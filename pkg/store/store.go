// Package store owns the SQLite persistence layer for datadrop: opening and
// migrating the database, and (in later slices) appending and querying events.
//
// The v0.1 design constrains this package in three ways that are easy to
// undo by accident:
//
//   - DR-2 mandates the pure-Go modernc.org/sqlite driver, whose DSN pragma
//     syntax differs from the CGO mattn/go-sqlite3 driver used by the imported
//     reference implementation. See dsnForPath.
//   - The connection pool is pinned to a single connection so that writes are
//     serialized and per-stream sequence reservation is trivially correct.
//   - Migrations are forward-only and idempotent, so `datadrop serve` can be
//     run repeatedly against the same file.
package store

import (
	"context"
	"database/sql"
	"embed"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"

	_ "modernc.org/sqlite" // pure-Go SQLite driver (DR-2)
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// TimeFormat is the canonical on-disk timestamp representation: RFC3339, UTC,
// fixed-width millisecond precision.
//
// The fixed width matters. time.RFC3339Nano strips trailing zeros, which would
// make "…:05.100Z" and "…:05.1Z" different strings that compare incorrectly in
// a lexicographic range query.
const TimeFormat = "2006-01-02T15:04:05.000Z07:00"

// FormatTime renders t in the canonical on-disk representation.
func FormatTime(t time.Time) string {
	return t.UTC().Format(TimeFormat)
}

// ParseTime parses a timestamp written by FormatTime.
func ParseTime(s string) (time.Time, error) {
	t, err := time.Parse(TimeFormat, s)
	if err != nil {
		return time.Time{}, errors.Wrapf(err, "parse timestamp %q", s)
	}
	return t.UTC(), nil
}

// Store is a handle on the datadrop SQLite database.
type Store struct {
	db   *sql.DB
	path string

	// now is injectable so tests can pin the clock.
	now func() time.Time
}

// Open opens (creating if needed) the SQLite database at path and applies any
// pending migrations. It is safe to call repeatedly against the same file.
func Open(ctx context.Context, path string) (*Store, error) {
	if ctx == nil {
		return nil, errors.New("store: context is required")
	}
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("store: database path is required")
	}

	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return nil, errors.Wrap(err, "store: resolve database path")
	}

	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o700); err != nil {
		return nil, errors.Wrap(err, "store: create database directory")
	}

	// Refuse to follow a symlink or write through a device/fifo at the store
	// path; the database may hold credentials-adjacent audit data.
	if info, err := os.Lstat(absolutePath); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return nil, errors.Errorf("store: %s must be a regular file, not a symlink or device", absolutePath)
		}
	} else if !os.IsNotExist(err) {
		return nil, errors.Wrap(err, "store: inspect database path")
	}

	db, err := sql.Open("sqlite", dsnForPath(absolutePath))
	if err != nil {
		return nil, errors.Wrap(err, "store: open SQLite")
	}

	// Serialize all access. SQLite permits one writer at a time; pinning the
	// pool to a single connection removes SQLITE_BUSY entirely and makes the
	// per-stream sequence reservation correct without extra locking. The
	// throughput ceiling this imposes is accepted by DR-2.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	s := &Store{db: db, path: absolutePath, now: time.Now}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, errors.Wrap(err, "store: ping SQLite")
	}
	if err := s.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	log.Debug().Str("path", absolutePath).Msg("opened store")
	return s, nil
}

// Close releases the database handle.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return errors.Wrap(s.db.Close(), "store: close SQLite")
}

// Path returns the absolute path of the underlying database file.
func (s *Store) Path() string { return s.path }

// DB exposes the underlying handle for packages in this module that need to
// issue statements the store does not yet wrap.
func (s *Store) DB() *sql.DB { return s.db }

// SetClock overrides the clock used for generated timestamps. Tests only.
func (s *Store) SetClock(now func() time.Time) {
	if now != nil {
		s.now = now
	}
}

// Now returns the current time according to the store's clock, truncated to
// the storage resolution.
//
// The truncation matters: without it a value returned from a create/append
// call carries nanoseconds while the same value re-read from the database
// carries milliseconds, so a caller comparing the two sees them differ.
func (s *Store) Now() time.Time {
	return s.now().UTC().Truncate(time.Millisecond)
}

// dsnForPath builds a modernc.org/sqlite DSN.
//
// NOTE: this deliberately does not match the reference implementation's DSN.
// mattn/go-sqlite3 spells these as `_journal_mode=WAL&_busy_timeout=5000`;
// modernc.org/sqlite ignores those and wants `_pragma=journal_mode(WAL)`.
// Copying the reference DSN verbatim silently disables WAL and foreign keys.
func dsnForPath(absolutePath string) string {
	q := url.Values{}
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(on)")
	q.Add("_pragma", "synchronous(FULL)")

	// Every transaction takes SQLite's write lock at BEGIN rather than lazily
	// on its first write. Sequence reservation reads stream_heads before
	// updating it, and a deferred transaction can fail to upgrade that read
	// lock. With SetMaxOpenConns(1) this is belt-and-braces, but it is what
	// keeps the reservation correct if the pool cap is ever raised.
	q.Set("_txlock", "immediate")

	return "file:" + absolutePath + "?" + q.Encode()
}

// migration is one embedded SQL file, identified by its numeric prefix.
type migration struct {
	version int
	name    string
	body    string
}

// migrate applies every embedded migration whose version exceeds the highest
// already recorded. Migrations are forward-only: they are never re-run and
// never rolled back.
func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INTEGER PRIMARY KEY,
			name       TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)`); err != nil {
		return errors.Wrap(err, "store: create schema_migrations")
	}

	var current int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&current); err != nil {
		return errors.Wrap(err, "store: read current schema version")
	}

	migrations, err := loadMigrations()
	if err != nil {
		return err
	}

	for _, m := range migrations {
		if m.version <= current {
			continue
		}
		if err := s.applyMigration(ctx, m); err != nil {
			return err
		}
		log.Info().Int("version", m.version).Str("name", m.name).Msg("applied migration")
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, m migration) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return errors.Wrapf(err, "store: begin migration %d", m.version)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, m.body); err != nil {
		return errors.Wrapf(err, "store: apply migration %d (%s)", m.version, m.name)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)`,
		m.version, m.name, FormatTime(s.now()),
	); err != nil {
		return errors.Wrapf(err, "store: record migration %d", m.version)
	}
	return errors.Wrapf(tx.Commit(), "store: commit migration %d", m.version)
}

// loadMigrations reads the embedded migrations, ordered by version.
func loadMigrations() ([]migration, error) {
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return nil, errors.Wrap(err, "store: read embedded migrations")
	}

	migrations := make([]migration, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		version, err := versionFromFilename(entry.Name())
		if err != nil {
			return nil, err
		}
		body, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return nil, errors.Wrapf(err, "store: read migration %s", entry.Name())
		}
		migrations = append(migrations, migration{
			version: version,
			name:    entry.Name(),
			body:    string(body),
		})
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].version < migrations[j].version
	})

	for i := 1; i < len(migrations); i++ {
		if migrations[i].version == migrations[i-1].version {
			return nil, errors.Errorf("store: duplicate migration version %d (%s, %s)",
				migrations[i].version, migrations[i-1].name, migrations[i].name)
		}
	}
	return migrations, nil
}

// versionFromFilename extracts the numeric prefix of "0001_init.sql".
func versionFromFilename(name string) (int, error) {
	prefix, _, found := strings.Cut(name, "_")
	if !found {
		return 0, errors.Errorf("store: migration %q must be named NNNN_description.sql", name)
	}
	version, err := strconv.Atoi(prefix)
	if err != nil {
		return 0, errors.Wrapf(err, "store: migration %q has a non-numeric version prefix", name)
	}
	return version, nil
}
