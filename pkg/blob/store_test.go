package blob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pkg/errors"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()

	s, err := Open(filepath.Join(t.TempDir(), "blobs"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return s
}

func digestOf(content string) Digest {
	sum := sha256.Sum256([]byte(content))
	return NewDigest(sum[:])
}

func put(t *testing.T, s *Store, content string) PutResult {
	t.Helper()

	result, err := s.Put(context.Background(), strings.NewReader(content), "")
	if err != nil {
		t.Fatalf("Put(%q): %v", content, err)
	}
	return result
}

func TestPutReturnsContentAddress(t *testing.T) {
	s := newTestStore(t)

	result := put(t, s, "hello")
	if result.Digest != digestOf("hello") {
		t.Fatalf("Digest = %s, want %s", result.Digest, digestOf("hello"))
	}
	if result.Size != 5 {
		t.Fatalf("Size = %d, want 5", result.Size)
	}
	if result.Deduplicated {
		t.Fatal("the first write reported deduplication")
	}
}

func TestPutRoundTrips(t *testing.T) {
	s := newTestStore(t)
	const content = "temperature,humidity\n21.7,0.48\n"

	result := put(t, s, content)

	file, err := s.Open(result.Digest)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = file.Close() }()

	read, err := io.ReadAll(file)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(read) != content {
		t.Fatalf("read back %q, want %q", read, content)
	}
}

// Identical content must occupy one file on disk regardless of how many times
// it is written. This is the property that makes republishing a dataset with
// one changed file cheap.
func TestPutDeduplicates(t *testing.T) {
	s := newTestStore(t)

	first := put(t, s, "identical")
	second := put(t, s, "identical")

	if first.Digest != second.Digest {
		t.Fatalf("identical content produced different digests: %s vs %s", first.Digest, second.Digest)
	}
	if !second.Deduplicated {
		t.Fatal("the second write of identical content did not report deduplication")
	}

	if files := countBlobFiles(t, s); files != 1 {
		t.Fatalf("%d files on disk after writing identical content twice, want 1", files)
	}
}

func TestPutVerifiesAssertedDigest(t *testing.T) {
	s := newTestStore(t)

	// A matching assertion is accepted.
	if _, err := s.Put(context.Background(), strings.NewReader("hello"), digestOf("hello")); err != nil {
		t.Fatalf("Put with a correct digest: %v", err)
	}

	// A mismatched assertion is rejected, and nothing is stored under the
	// asserted address. Trusting the caller here would let anyone place chosen
	// bytes at another file's content address.
	claimed := digestOf("something else entirely")
	_, err := s.Put(context.Background(), strings.NewReader("hello"), claimed)
	if !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("Put with a wrong digest returned %v, want ErrDigestMismatch", err)
	}
	if exists, _ := s.Exists(claimed); exists {
		t.Fatal("a rejected write left bytes stored under the asserted digest")
	}
}

// A failed write must leave nothing behind: no blob, and no temporary file.
func TestFailedPutLeavesNoTrace(t *testing.T) {
	s := newTestStore(t)

	claimed := digestOf("not what we send")
	if _, err := s.Put(context.Background(), strings.NewReader("actual bytes"), claimed); err == nil {
		t.Fatal("expected a digest mismatch")
	}

	if files := countBlobFiles(t, s); files != 0 {
		t.Fatalf("%d blob files after a failed write, want 0", files)
	}
	if temps := countTempFiles(t, s); temps != 0 {
		t.Fatalf("%d temporary files after a failed write, want 0", temps)
	}
}

// A read error partway through the body must not publish a partial blob.
func TestInterruptedPutPublishesNothing(t *testing.T) {
	s := newTestStore(t)

	reader := io.MultiReader(
		strings.NewReader("the first part arrives"),
		&failingReader{err: errors.New("connection reset")},
	)

	if _, err := s.Put(context.Background(), reader, ""); err == nil {
		t.Fatal("expected the interrupted read to fail the write")
	}

	if files := countBlobFiles(t, s); files != 0 {
		t.Fatalf("%d blob files after an interrupted write, want 0", files)
	}
	if temps := countTempFiles(t, s); temps != 0 {
		t.Fatalf("%d temporary files after an interrupted write, want 0", temps)
	}
}

func TestOpenAndStatReportNotFound(t *testing.T) {
	s := newTestStore(t)
	missing := digestOf("never stored")

	if _, err := s.Open(missing); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Open returned %v, want ErrNotFound", err)
	}
	if _, err := s.Stat(missing); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Stat returned %v, want ErrNotFound", err)
	}
	if exists, err := s.Exists(missing); err != nil || exists {
		t.Fatalf("Exists = (%v, %v), want (false, nil)", exists, err)
	}
}

func TestStatReportsSize(t *testing.T) {
	s := newTestStore(t)
	content := strings.Repeat("x", 4096)

	result := put(t, s, content)
	size, err := s.Stat(result.Digest)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if size != int64(len(content)) {
		t.Fatalf("Stat = %d, want %d", size, len(content))
	}
}

func TestDeleteIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	result := put(t, s, "transient")

	if err := s.Delete(result.Digest); err != nil {
		t.Fatalf("first Delete: %v", err)
	}
	if err := s.Delete(result.Digest); err != nil {
		t.Fatalf("second Delete on an absent blob: %v, want nil", err)
	}
	if exists, _ := s.Exists(result.Digest); exists {
		t.Fatal("the blob still exists after deletion")
	}
}

// Nothing outside the store's own digest namespace may be reached, even with a
// deliberately hostile digest string.
func TestInvalidDigestsAreRejected(t *testing.T) {
	s := newTestStore(t)

	for name, value := range map[string]string{
		"no algorithm":     "abcd",
		"wrong algorithm":  "md5:" + strings.Repeat("a", 32),
		"too short":        "sha256:abcd",
		"uppercase hex":    "sha256:" + strings.Repeat("A", 64),
		"non-hex":          "sha256:" + strings.Repeat("z", 64),
		"path traversal":   "sha256:../../../../etc/passwd",
		"traversal in hex": "sha256:" + strings.Repeat("a", 60) + "/../",
		"empty":            "",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseDigest(value); err == nil {
				t.Fatalf("ParseDigest(%q) accepted an invalid digest", value)
			}
			if _, err := s.Open(Digest(value)); err == nil {
				t.Fatalf("Open(%q) accepted an invalid digest", value)
			}
			if _, err := s.Stat(Digest(value)); err == nil {
				t.Fatalf("Stat(%q) accepted an invalid digest", value)
			}
		})
	}
}

func TestParseDigestAcceptsCanonicalForm(t *testing.T) {
	canonical := "sha256:" + strings.Repeat("0123456789abcdef", 4)

	parsed, err := ParseDigest(canonical)
	if err != nil {
		t.Fatalf("ParseDigest: %v", err)
	}
	if parsed.String() != canonical {
		t.Fatalf("String() = %q, want %q", parsed, canonical)
	}
	if parsed.Hex() != strings.Repeat("0123456789abcdef", 4) {
		t.Fatalf("Hex() = %q", parsed.Hex())
	}
}

// The two-level fanout keeps directories small; the layout is also what a
// human operator will navigate, so it is worth pinning.
func TestOnDiskLayoutUsesFanout(t *testing.T) {
	s := newTestStore(t)
	result := put(t, s, "layout")

	encoded := result.Digest.Hex()
	expected := filepath.Join(s.Root(), "sha256", encoded[0:2], encoded[2:4], encoded)

	if _, err := os.Stat(expected); err != nil {
		t.Fatalf("blob is not at the expected fanout path %s: %v", expected, err)
	}
}

func TestSweepTempRemovesLeftovers(t *testing.T) {
	s := newTestStore(t)

	// Simulate files left by a process that died mid-upload.
	for i := 0; i < 3; i++ {
		f, err := os.CreateTemp(filepath.Join(s.Root(), tempDir), "upload-*")
		if err != nil {
			t.Fatalf("create leftover: %v", err)
		}
		_ = f.Close()
	}

	removed, err := s.SweepTemp()
	if err != nil {
		t.Fatalf("SweepTemp: %v", err)
	}
	if removed != 3 {
		t.Fatalf("SweepTemp removed %d files, want 3", removed)
	}
	if temps := countTempFiles(t, s); temps != 0 {
		t.Fatalf("%d temporary files remain after a sweep", temps)
	}
}

// Opening a store sweeps leftovers, because a crash bypasses Put's cleanup.
func TestOpenSweepsTemp(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "blobs")

	first, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	f, err := os.CreateTemp(filepath.Join(first.Root(), tempDir), "upload-*")
	if err != nil {
		t.Fatalf("create leftover: %v", err)
	}
	_ = f.Close()

	second, err := Open(dir)
	if err != nil {
		t.Fatalf("re-Open: %v", err)
	}
	if temps := countTempFiles(t, second); temps != 0 {
		t.Fatalf("%d temporary files survived a re-open", temps)
	}
}

func TestGCDeletesOnlyUnreferencedBlobs(t *testing.T) {
	s := newTestStore(t)

	kept := put(t, s, "referenced")
	dropped := put(t, s, "unreferenced")

	referenced := map[Digest]struct{}{kept.Digest: {}}

	// minAge < 0 disables the age check, which is only safe in a test.
	result, err := s.GC(context.Background(), referenced, -1)
	if err != nil {
		t.Fatalf("GC: %v", err)
	}
	if result.Deleted != 1 {
		t.Fatalf("GC deleted %d blobs, want 1", result.Deleted)
	}

	if exists, _ := s.Exists(kept.Digest); !exists {
		t.Fatal("GC deleted a referenced blob")
	}
	if exists, _ := s.Exists(dropped.Digest); exists {
		t.Fatal("GC kept an unreferenced blob")
	}
}

// The grace period is a correctness requirement, not a tuning knob: a blob
// written for a draft whose metadata row does not exist yet is momentarily
// unreferenced, and must survive a sweep.
func TestGCRespectsTheGracePeriod(t *testing.T) {
	s := newTestStore(t)
	fresh := put(t, s, "just uploaded, not yet referenced")

	result, err := s.GC(context.Background(), map[Digest]struct{}{}, time.Hour)
	if err != nil {
		t.Fatalf("GC: %v", err)
	}
	if result.Deleted != 0 {
		t.Fatalf("GC deleted %d recently written blobs, want 0", result.Deleted)
	}
	if exists, _ := s.Exists(fresh.Digest); !exists {
		t.Fatal("GC deleted a blob younger than the grace period")
	}
}

func TestGCReportsFreedBytes(t *testing.T) {
	s := newTestStore(t)
	content := strings.Repeat("y", 1024)
	put(t, s, content)

	result, err := s.GC(context.Background(), map[Digest]struct{}{}, -1)
	if err != nil {
		t.Fatalf("GC: %v", err)
	}
	if result.FreedBytes != int64(len(content)) {
		t.Fatalf("FreedBytes = %d, want %d", result.FreedBytes, len(content))
	}
}

func TestGCOnAnEmptyStore(t *testing.T) {
	result, err := newTestStore(t).GC(context.Background(), map[Digest]struct{}{}, -1)
	if err != nil {
		t.Fatalf("GC on an empty store: %v", err)
	}
	if result.Scanned != 0 || result.Deleted != 0 {
		t.Fatalf("GC on an empty store reported %+v", result)
	}
}

func TestOpenRejectsEmptyRoot(t *testing.T) {
	if _, err := Open("   "); err == nil {
		t.Fatal("Open accepted an empty root directory")
	}
}

// A large body must not be buffered. This does not measure memory directly; it
// establishes that a body substantially larger than any sensible buffer is
// handled and hashed correctly, which a naive ReadAll implementation would also
// pass — so it is a smoke test for the streaming path rather than a proof.
func TestPutHandlesLargeContent(t *testing.T) {
	s := newTestStore(t)

	const size = 8 << 20 // 8 MiB
	body := bytes.Repeat([]byte("0123456789abcdef"), size/16)

	result, err := s.Put(context.Background(), bytes.NewReader(body), "")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if result.Size != int64(size) {
		t.Fatalf("Size = %d, want %d", result.Size, size)
	}

	sum := sha256.Sum256(body)
	if result.Digest.Hex() != hex.EncodeToString(sum[:]) {
		t.Fatal("the digest of a large body does not match its content")
	}
}

// failingReader returns an error after whatever preceded it in a MultiReader.
type failingReader struct{ err error }

func (r *failingReader) Read([]byte) (int, error) { return 0, r.err }

func countBlobFiles(t *testing.T, s *Store) int {
	t.Helper()

	count := 0
	root := filepath.Join(s.Root(), Algorithm)
	err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if !entry.IsDir() {
			count++
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk blob store: %v", err)
	}
	return count
}

func countTempFiles(t *testing.T, s *Store) int {
	t.Helper()

	entries, err := os.ReadDir(filepath.Join(s.Root(), tempDir))
	if err != nil {
		if os.IsNotExist(err) {
			return 0
		}
		t.Fatalf("read temporary directory: %v", err)
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			count++
		}
	}
	return count
}
