package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestOpenCreatesAndMigrates(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "datadrop.db")

	st, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	for _, table := range []string{"drops", "events", "stream_heads", "schemas", "audit_log", "schema_migrations"} {
		var name string
		err := st.DB().QueryRowContext(ctx,
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			t.Fatalf("expected table %q to exist: %v", table, err)
		}
	}

	var version int
	if err := st.DB().QueryRowContext(ctx,
		`SELECT MAX(version) FROM schema_migrations`).Scan(&version); err != nil {
		t.Fatalf("read schema version: %v", err)
	}
	if version != 1 {
		t.Fatalf("schema version = %d, want 1", version)
	}
}

// Re-opening the same file must be a no-op: `datadrop serve` is expected to be
// run repeatedly against the same database.
func TestOpenIsIdempotent(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "datadrop.db")

	first, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("first Close: %v", err)
	}

	second, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	t.Cleanup(func() { _ = second.Close() })

	var applied int
	if err := second.DB().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM schema_migrations`).Scan(&applied); err != nil {
		t.Fatalf("count migrations: %v", err)
	}
	if applied != 1 {
		t.Fatalf("migration applied %d times, want 1", applied)
	}
}

// The DSN must actually enable WAL and foreign keys. Copying the CGO driver's
// DSN spelling silently disables both, so assert on the live pragmas.
func TestOpenAppliesPragmas(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "datadrop.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	var journalMode string
	if err := st.DB().QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("read journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal_mode = %q, want %q", journalMode, "wal")
	}

	var foreignKeys int
	if err := st.DB().QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil {
		t.Fatalf("read foreign_keys: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, want 1", foreignKeys)
	}
}

func TestOpenRejectsEmptyPath(t *testing.T) {
	if _, err := Open(context.Background(), "  "); err == nil {
		t.Fatal("expected an error for an empty database path")
	}
}

// Timestamps must round-trip and must keep a fixed-width fractional part, so
// that lexicographic comparison in SQL matches chronological order.
func TestTimeFormatRoundTripsAtFixedWidth(t *testing.T) {
	cases := []time.Time{
		time.Date(2026, 7, 24, 12, 0, 5, 100_000_000, time.UTC), // .100
		time.Date(2026, 7, 24, 12, 0, 5, 0, time.UTC),           // .000
		time.Date(2026, 7, 24, 12, 0, 5, 999_000_000, time.UTC), // .999
	}

	for _, want := range cases {
		text := FormatTime(want)
		if len(text) != len("2006-01-02T15:04:05.000Z") {
			t.Fatalf("FormatTime(%v) = %q, want fixed width", want, text)
		}
		got, err := ParseTime(text)
		if err != nil {
			t.Fatalf("ParseTime(%q): %v", text, err)
		}
		if !got.Equal(want) {
			t.Fatalf("round trip: got %v, want %v", got, want)
		}
	}

	earlier := FormatTime(time.Date(2026, 7, 24, 12, 0, 5, 100_000_000, time.UTC))
	later := FormatTime(time.Date(2026, 7, 24, 12, 0, 5, 200_000_000, time.UTC))
	if earlier >= later {
		t.Fatalf("lexicographic order broken: %q should sort before %q", earlier, later)
	}
}

func TestLoadMigrationsAreOrderedAndUnique(t *testing.T) {
	migrations, err := loadMigrations()
	if err != nil {
		t.Fatalf("loadMigrations: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatal("expected at least one embedded migration")
	}
	for i := 1; i < len(migrations); i++ {
		if migrations[i].version <= migrations[i-1].version {
			t.Fatalf("migrations out of order at %d: %d then %d",
				i, migrations[i-1].version, migrations[i].version)
		}
	}
}

func TestVersionFromFilename(t *testing.T) {
	if got, err := versionFromFilename("0012_add_thing.sql"); err != nil || got != 12 {
		t.Fatalf("versionFromFilename = (%d, %v), want (12, nil)", got, err)
	}
	if _, err := versionFromFilename("init.sql"); err == nil {
		t.Fatal("expected an error for a filename without a numeric prefix")
	}
	if _, err := versionFromFilename("abc_init.sql"); err == nil {
		t.Fatal("expected an error for a non-numeric version prefix")
	}
}
