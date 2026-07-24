// Package blob is a content-addressed store for the bytes of dataset files.
//
// It knows nothing about datasets, drops, or manifests: it maps a SHA-256
// digest to bytes on the filesystem, and that is the whole interface. Keeping
// it that narrow is what makes an object-storage backend a contained change
// later — see the DATADROP-2 guide §5 and §15.
//
// Two properties are load-bearing and are asserted by tests rather than left to
// review:
//
//   - Nothing is visible at its final path until it is complete and verified.
//     Writes go to a temporary file on the same filesystem, are fsynced, and are
//     then renamed into place.
//   - The store computes every digest itself. A caller-supplied digest is
//     verified, never trusted; trusting one would let a caller store arbitrary
//     bytes under another file's address.
package blob

import (
	"context"
	"crypto/sha256"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/errors"
)

// Sentinel errors callers map onto HTTP statuses.
var (
	// ErrNotFound means no blob is stored under the given digest.
	ErrNotFound = errors.New("blob not found")

	// ErrDigestMismatch means the caller asserted a digest that the bytes it
	// supplied do not hash to. The bytes are discarded.
	ErrDigestMismatch = errors.New("digest mismatch")
)

// tempDir is the subdirectory holding in-progress uploads. It sits beneath the
// store root so that os.Rename into the final location stays within one
// filesystem, which is what makes the rename atomic.
const tempDir = "tmp"

// DefaultGCMinAge is how old an unreferenced blob must be before a sweep will
// remove it.
//
// The grace period is not a tuning knob, it is a correctness requirement. A blob
// written moments ago for a draft version whose dataset_files row has not been
// inserted yet is momentarily unreferenced, and without a minimum age the sweep
// would delete it out from under an in-flight upload.
const DefaultGCMinAge = time.Hour

// Store is a content-addressed blob store rooted at a directory.
type Store struct {
	root string
}

// Open prepares the store rooted at dir, creating it if necessary and clearing
// any temporary files left behind by an interrupted process.
func Open(dir string) (*Store, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, errors.New("blob: root directory is required")
	}

	root, err := filepath.Abs(dir)
	if err != nil {
		return nil, errors.Wrap(err, "blob: resolve root")
	}
	if err := os.MkdirAll(filepath.Join(root, tempDir), 0o700); err != nil {
		return nil, errors.Wrap(err, "blob: create store directories")
	}

	s := &Store{root: root}

	// A crash bypasses the deferred cleanup in Put, so temp files can only be
	// reclaimed at startup.
	removed, err := s.SweepTemp()
	if err != nil {
		return nil, err
	}
	if removed > 0 {
		log.Info().Int("files", removed).Msg("swept temporary blob uploads left by a previous run")
	}

	log.Debug().Str("root", root).Msg("opened blob store")
	return s, nil
}

// Root returns the store's absolute root directory.
func (s *Store) Root() string { return s.root }

// PutResult describes the outcome of a write.
type PutResult struct {
	Digest Digest
	Size   int64

	// Deduplicated is true when the bytes were already present, so the write
	// consumed no additional storage.
	Deduplicated bool
}

// Put streams r into the store and returns its content address.
//
// If expected is non-empty, the computed digest must equal it or the write is
// discarded and ErrDigestMismatch is returned.
//
// The reader is consumed in a streaming copy and is never buffered, so the
// memory cost is independent of the object size.
func (s *Store) Put(ctx context.Context, r io.Reader, expected Digest) (PutResult, error) {
	if r == nil {
		return PutResult{}, errors.New("blob: reader is required")
	}
	if err := ctx.Err(); err != nil {
		return PutResult{}, errors.Wrap(err, "blob: put")
	}

	temp, err := os.CreateTemp(filepath.Join(s.root, tempDir), "upload-*")
	if err != nil {
		return PutResult{}, errors.Wrap(err, "blob: create temporary file")
	}
	tempPath := temp.Name()

	// renamed guards the cleanup: on every path except a successful rename the
	// temporary file must go, or an interrupted upload leaks a file into tmp/.
	renamed := false
	defer func() {
		_ = temp.Close()
		if !renamed {
			if err := os.Remove(tempPath); err != nil && !os.IsNotExist(err) {
				log.Warn().Err(err).Str("path", tempPath).Msg("failed to remove temporary blob")
			}
		}
	}()

	// Hash while writing. Hashing afterwards would mean either reading the file
	// back — doubling the I/O — or holding it in memory, which the streaming
	// commitment excludes.
	hasher := sha256.New()
	size, err := io.Copy(io.MultiWriter(temp, hasher), r)
	if err != nil {
		return PutResult{}, errors.Wrap(err, "blob: write temporary file")
	}

	digest := NewDigest(hasher.Sum(nil))
	if expected != "" && digest != expected {
		return PutResult{}, errors.Wrapf(ErrDigestMismatch,
			"blob: content hashes to %s, caller asserted %s", digest, expected)
	}

	// The bytes must be on disk before the rename publishes the name. Renaming
	// is atomic with respect to the directory entry, not with respect to data.
	if err := temp.Sync(); err != nil {
		return PutResult{}, errors.Wrap(err, "blob: sync temporary file")
	}
	if err := temp.Close(); err != nil {
		return PutResult{}, errors.Wrap(err, "blob: close temporary file")
	}

	finalPath := s.pathFor(digest)

	// Check for an existing blob only now, after writing. Checking first and
	// skipping the write races: two concurrent writers of the same new blob
	// would both observe it missing. Writing unconditionally and discarding on
	// collision is correct, at the cost of one temporary file in the rare case.
	if _, err := os.Stat(finalPath); err == nil {
		return PutResult{Digest: digest, Size: size, Deduplicated: true}, nil
	} else if !os.IsNotExist(err) {
		return PutResult{}, errors.Wrap(err, "blob: stat destination")
	}

	if err := os.MkdirAll(filepath.Dir(finalPath), 0o700); err != nil {
		return PutResult{}, errors.Wrap(err, "blob: create destination directory")
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		return PutResult{}, errors.Wrap(err, "blob: publish blob")
	}
	renamed = true

	log.Debug().Str("digest", digest.String()).Int64("size", size).Msg("stored blob")
	return PutResult{Digest: digest, Size: size}, nil
}

// Open returns a readable handle on a blob.
//
// The caller owns the returned file and must close it. An *os.File is returned
// rather than an io.ReadCloser because the download path hands it to
// http.ServeContent, which needs io.ReadSeeker to satisfy Range requests.
func (s *Store) Open(digest Digest) (*os.File, error) {
	if _, err := ParseDigest(digest.String()); err != nil {
		return nil, err
	}

	file, err := os.Open(s.pathFor(digest))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errors.Wrapf(ErrNotFound, "blob %s", digest)
		}
		return nil, errors.Wrapf(err, "blob: open %s", digest)
	}
	return file, nil
}

// Stat reports a blob's size without opening it for reading.
func (s *Store) Stat(digest Digest) (int64, error) {
	if _, err := ParseDigest(digest.String()); err != nil {
		return 0, err
	}

	info, err := os.Stat(s.pathFor(digest))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, errors.Wrapf(ErrNotFound, "blob %s", digest)
		}
		return 0, errors.Wrapf(err, "blob: stat %s", digest)
	}
	return info.Size(), nil
}

// Exists reports whether the store already holds these bytes. It backs the
// digest precheck that lets a client skip re-uploading an unchanged file.
func (s *Store) Exists(digest Digest) (bool, error) {
	_, err := s.Stat(digest)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, ErrNotFound):
		return false, nil
	default:
		return false, err
	}
}

// Delete removes a blob. Removing a blob that is not present is not an error,
// so that garbage collection is idempotent.
func (s *Store) Delete(digest Digest) error {
	if _, err := ParseDigest(digest.String()); err != nil {
		return err
	}
	if err := os.Remove(s.pathFor(digest)); err != nil && !os.IsNotExist(err) {
		return errors.Wrapf(err, "blob: delete %s", digest)
	}
	return nil
}

// GCResult summarizes a sweep.
type GCResult struct {
	Scanned    int
	Deleted    int
	FreedBytes int64
}

// GC deletes blobs that are not in referenced and are older than minAge.
//
// The caller supplies the referenced set, because the blob store deliberately
// does not know what a dataset is. minAge of zero selects DefaultGCMinAge;
// passing a negative value disables the age check and is intended only for
// tests, since doing so races with in-flight uploads.
func (s *Store) GC(ctx context.Context, referenced map[Digest]struct{}, minAge time.Duration) (GCResult, error) {
	if minAge == 0 {
		minAge = DefaultGCMinAge
	}
	cutoff := time.Now().Add(-minAge)

	var result GCResult
	root := filepath.Join(s.root, Algorithm)

	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil // nothing has been stored yet
			}
			return err
		}
		if entry.IsDir() {
			return ctx.Err()
		}
		result.Scanned++

		digest, parseErr := ParseDigest(Algorithm + ":" + entry.Name())
		if parseErr != nil {
			// Not something this store wrote. Leave it alone rather than
			// deleting a file whose provenance is unknown.
			log.Warn().Str("path", path).Msg("skipping unrecognized file in the blob store")
			return nil
		}
		if _, isReferenced := referenced[digest]; isReferenced {
			return nil
		}

		info, statErr := entry.Info()
		if statErr != nil {
			return errors.Wrapf(statErr, "blob: stat %s", path)
		}
		if minAge > 0 && info.ModTime().After(cutoff) {
			// Young and unreferenced: most likely an upload whose metadata row
			// has not been written yet.
			return nil
		}

		if removeErr := os.Remove(path); removeErr != nil && !os.IsNotExist(removeErr) {
			return errors.Wrapf(removeErr, "blob: delete %s", path)
		}
		result.Deleted++
		result.FreedBytes += info.Size()
		return nil
	})
	if err != nil {
		return result, errors.Wrap(err, "blob: garbage collect")
	}

	log.Info().
		Int("scanned", result.Scanned).
		Int("deleted", result.Deleted).
		Int64("freed_bytes", result.FreedBytes).
		Msg("blob garbage collection complete")

	return result, nil
}

// SweepTemp removes every file in the temporary directory and reports how many
// were removed. It runs at startup, because a crash bypasses Put's cleanup.
func (s *Store) SweepTemp() (int, error) {
	dir := filepath.Join(s.root, tempDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, errors.Wrap(err, "blob: read temporary directory")
	}

	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && !os.IsNotExist(err) {
			return removed, errors.Wrapf(err, "blob: remove temporary file %s", entry.Name())
		}
		removed++
	}
	return removed, nil
}

// pathFor is the absolute location of a blob's bytes.
func (s *Store) pathFor(digest Digest) string {
	return filepath.Join(s.root, digest.relPath())
}
