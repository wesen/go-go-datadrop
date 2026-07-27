package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/hex"
	"strings"

	"github.com/pkg/errors"
)

// The API token format:
//
//	ddp_7f3k9m2qx4vb_8h2n6p4r9tzw3xk5mcqf7bdy1sav0jne
//	└┬─┘└─────┬─────┘ └──────────────┬─────────────────┘
//	 │        │                      └─ secret: 20 bytes, 160 bits
//	 │        └─ id: 8 bytes, public, stored in plaintext
//	 └─ fixed prefix
//
// Every part earns its place, and each answers a question that came up while
// designing this (guide §9.2, DR-23):
//
//   - The prefix makes a leaked token findable. Secret scanners and a two-line
//     pre-commit hook can match a distinctive prefix; a bare base64 blob is
//     indistinguishable from every other base64 blob in a repository. This is
//     the highest-value byte-for-byte decision in the format.
//   - The separate public id turns verification into one indexed lookup rather
//     than a scan-and-compare over every hash in the table, and it is what makes
//     the id safe to put in an audit row and a log line.
//   - Base32 without padding rather than base64: case-insensitive on the wire,
//     no '+' or '/' for a shell to mangle, URL-safe, and unambiguous when read
//     out of a terminal.
const (
	// TokenPrefix is what makes a leaked credential greppable.
	TokenPrefix = "ddp_"

	tokenIDBytes     = 8  // 13 base32 characters
	tokenSecretBytes = 20 // 32 base32 characters, 160 bits
)

// tokenEncoding is lowercase base32 without padding. Lowercase because these
// are read and typed by people, and SHOUTING CREDENTIALS are harder to
// transcribe; the alphabet is still case-insensitive on parse.
var tokenEncoding = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

// NewToken is a freshly minted credential.
//
// Secret is the only field that is not persisted, and it exists on this struct
// for exactly as long as it takes to put it in the one HTTP response that ever
// carries it (guide §9.5).
type NewToken struct {
	ID         string
	Secret     string
	SecretHash string
	// String is the full credential: prefix, id, secret. Shown once.
	String string
}

// MintToken generates a new API token.
func MintToken() (NewToken, error) {
	idBytes := make([]byte, tokenIDBytes)
	if _, err := rand.Read(idBytes); err != nil {
		return NewToken{}, errors.Wrap(err, "auth: generate token id")
	}
	secretBytes := make([]byte, tokenSecretBytes)
	if _, err := rand.Read(secretBytes); err != nil {
		return NewToken{}, errors.Wrap(err, "auth: generate token secret")
	}

	id := tokenEncoding.EncodeToString(idBytes)
	secret := tokenEncoding.EncodeToString(secretBytes)
	return NewToken{
		ID:         id,
		Secret:     secret,
		SecretHash: HashSecret(secret),
		String:     TokenPrefix + id + "_" + secret,
	}, nil
}

// HashSecret is how a token secret is stored.
//
// SHA-256, not bcrypt or argon2, and this is deliberate rather than an
// oversight. A slow key-derivation function exists to make brute-forcing a
// low-entropy human-chosen secret expensive. This secret is 160 bits from
// crypto/rand: it is not brute-forceable at any cost, so a KDF would add tens
// of milliseconds to every single API request and buy nothing. The rule for
// passwords is the opposite of the rule here, and the difference is entropy.
func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// LooksLikeToken reports whether raw has the shape of an API token.
//
// Used by the resolver to decide whether to attempt a lookup at all. It is a
// shape test and not a validity test: it must never be the thing that decides
// whether a credential is accepted.
func LooksLikeToken(raw string) bool { return strings.HasPrefix(raw, TokenPrefix) }

// ParseToken splits a presented credential into its public id and its secret.
//
// It validates shape only. A well-formed token for an id that does not exist
// parses successfully and then fails to resolve, which is the correct division
// of labour: this function must not be able to tell an attacker whether an id
// is real.
func ParseToken(raw string) (string, string, error) {
	if !strings.HasPrefix(raw, TokenPrefix) {
		return "", "", errors.New("auth: not a datadrop token")
	}
	rest := strings.ToLower(strings.TrimPrefix(raw, TokenPrefix))
	// SplitN with 2, not Split: a secret can never contain '_' given the
	// alphabet above, but relying on that from the parser means a future
	// alphabet change turns into a silent truncation rather than an error.
	parts := strings.SplitN(rest, "_", 2)
	if len(parts) != 2 {
		return "", "", errors.New("auth: malformed token: expected ddp_<id>_<secret>")
	}
	id, secret := parts[0], parts[1]
	if err := validTokenPart(id, tokenIDBytes); err != nil {
		return "", "", errors.Wrap(err, "auth: token id")
	}
	if err := validTokenPart(secret, tokenSecretBytes); err != nil {
		return "", "", errors.Wrap(err, "auth: token secret")
	}
	return id, secret, nil
}

// VerifySecret compares a presented secret against a stored hash, in constant
// time.
func VerifySecret(secret, storedHash string) bool {
	return subtle.ConstantTimeCompare([]byte(HashSecret(secret)), []byte(storedHash)) == 1
}

func validTokenPart(part string, wantBytes int) error {
	decoded, err := tokenEncoding.DecodeString(part)
	if err != nil {
		return errors.New("is not valid base32")
	}
	if len(decoded) != wantBytes {
		return errors.Errorf("is %d bytes, expected %d", len(decoded), wantBytes)
	}
	return nil
}

// NewUserID mints the local identifier for a user.
//
// We mint our own rather than using the OIDC `sub` as a primary key. `sub` is
// an opaque provider string of unbounded shape, and ours appears in foreign
// keys, audit rows, URLs and log lines. A local identifier we control means
// changing identity provider does not rewrite half the database, and an audit
// row does not carry a foreign system's identifier forever (guide §6.3).
func NewUserID() (string, error) { return newPrefixedID("usr_", 16) }

// NewSessionValue is the raw value of a session cookie: 32 bytes from
// crypto/rand. What is stored is its SHA-256, so a dump of the database does
// not hand over live sessions.
func NewSessionValue() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", errors.Wrap(err, "auth: generate session value")
	}
	return tokenEncoding.EncodeToString(buf), nil
}

// NewFlowValue generates a state, nonce or PKCE verifier.
func NewFlowValue() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", errors.Wrap(err, "auth: generate flow value")
	}
	return tokenEncoding.EncodeToString(buf), nil
}

func newPrefixedID(prefix string, n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", errors.Wrapf(err, "auth: generate %sid", prefix)
	}
	return prefix + tokenEncoding.EncodeToString(buf), nil
}
