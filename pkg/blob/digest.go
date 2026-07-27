package blob

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"strings"

	"github.com/pkg/errors"
)

// Algorithm is the only digest algorithm this store understands. It is part of
// every digest string so that a second algorithm can be added later without
// making existing digests ambiguous.
const Algorithm = "sha256"

// hexLength is the encoded length of a SHA-256 digest.
const hexLength = sha256.Size * 2

// Digest is a content address of the form "sha256:<64 lowercase hex chars>".
//
// The digest is simultaneously the storage key, the integrity check, and the
// citation identity of a blob. Nothing else identifies bytes in this package.
type Digest string

// NewDigest builds a Digest from raw hash bytes.
func NewDigest(sum []byte) Digest {
	return Digest(Algorithm + ":" + hex.EncodeToString(sum))
}

// ParseDigest validates a digest string.
//
// Validation is not cosmetic: the digest is turned into a filesystem path by
// Digest.relPath, so an unvalidated digest is a path-traversal vector. Rejecting
// anything that is not exactly "sha256:" followed by 64 lowercase hex characters
// makes that impossible by construction rather than by escaping.
func ParseDigest(s string) (Digest, error) {
	algorithm, encoded, found := strings.Cut(s, ":")
	if !found {
		return "", errors.Errorf("blob: invalid digest %q: expected %s:<hex>", s, Algorithm)
	}
	if algorithm != Algorithm {
		return "", errors.Errorf("blob: unsupported digest algorithm %q: only %q is supported", algorithm, Algorithm)
	}
	if len(encoded) != hexLength {
		return "", errors.Errorf("blob: invalid digest %q: expected %d hex characters, got %d",
			s, hexLength, len(encoded))
	}
	for _, r := range encoded {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return "", errors.Errorf("blob: invalid digest %q: %q is not lowercase hex", s, r)
		}
	}
	return Digest(s), nil
}

// String returns the digest in its canonical "sha256:<hex>" form.
func (d Digest) String() string { return string(d) }

// Hex returns the encoded hash without the algorithm prefix.
func (d Digest) Hex() string {
	_, encoded, _ := strings.Cut(string(d), ":")
	return encoded
}

// relPath is the digest's location beneath the store root, using a two-level
// fanout on the first four hex characters.
//
// The fanout keeps any single directory to at most 65,536 entries. A flat
// directory holding a million files makes directory reads pathological on most
// filesystems and makes routine operational inspection unusable.
func (d Digest) relPath() string {
	encoded := d.Hex()
	return filepath.Join(Algorithm, encoded[0:2], encoded[2:4], encoded)
}
