package store

import (
	"database/sql"
	"strings"

	"github.com/pkg/errors"
)

// Sentinel errors the HTTP layer maps onto status codes. Callers should test
// with errors.Is, not string comparison.
var (
	// ErrNotFound means the requested drop, schema, or event does not exist.
	ErrNotFound = errors.New("not found")

	// ErrAlreadyExists means a uniquely-keyed row is already present. For
	// AppendEvent it specifically means the event ID has been seen before,
	// which is an idempotent replay rather than a failure — the caller gets
	// the original event alongside this error.
	ErrAlreadyExists = errors.New("already exists")
)

// isNoRows reports whether err is database/sql's empty-result sentinel.
func isNoRows(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}

// isUniqueViolation reports whether err is a SQLite uniqueness/primary-key
// constraint failure.
//
// modernc.org/sqlite returns a driver error whose Error() carries the SQLite
// message. There is no exported error-code type to switch on, so this matches
// the message text. Narrow and ugly, but the alternative — treating every
// insert failure as a duplicate — would silently swallow real errors.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToUpper(err.Error())
	return strings.Contains(msg, "UNIQUE CONSTRAINT FAILED") ||
		strings.Contains(msg, "SQLITE_CONSTRAINT_UNIQUE") ||
		strings.Contains(msg, "SQLITE_CONSTRAINT_PRIMARYKEY")
}

// isForeignKeyViolation reports whether err is a SQLite foreign-key failure,
// which for us means "the referenced drop does not exist".
func isForeignKeyViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToUpper(err.Error())
	return strings.Contains(msg, "FOREIGN KEY CONSTRAINT FAILED") ||
		strings.Contains(msg, "SQLITE_CONSTRAINT_FOREIGNKEY")
}
