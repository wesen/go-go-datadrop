package store

import (
	"context"
	"database/sql"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// CreateDrop inserts a drop. It returns ErrAlreadyExists if the name is taken.
func (s *Store) CreateDrop(ctx context.Context, d datadrop.Drop) (datadrop.Drop, error) {
	if err := datadrop.ValidateName("drop", d.Name); err != nil {
		return datadrop.Drop{}, err
	}
	if err := datadrop.ValidateRetention(d.Retention); err != nil {
		return datadrop.Drop{}, err
	}

	if d.CreatedAt.IsZero() {
		d.CreatedAt = s.Now()
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO drops(name, created_at, retention, public_read, owner_id)
		 VALUES(?, ?, ?, ?, ?)`,
		d.Name, FormatTime(d.CreatedAt), nullableString(d.Retention),
		boolToInt(d.PublicRead), nullableString(d.OwnerID))
	if err != nil {
		if isUniqueViolation(err) {
			return datadrop.Drop{}, errors.Wrapf(ErrAlreadyExists, "drop %q", d.Name)
		}
		return datadrop.Drop{}, errors.Wrapf(err, "store: create drop %q", d.Name)
	}

	if err := s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionDropCreate,
		Drop:   d.Name,
		Detail: jsonObject(map[string]any{
			"retention":   d.Retention,
			"public_read": d.PublicRead,
			"owner":       d.OwnerID,
		}),
	}); err != nil {
		return datadrop.Drop{}, err
	}

	log.Info().Str("drop", d.Name).Msg("created drop")
	return d, nil
}

// GetDrop reads one drop. It returns ErrNotFound when the name is unknown.
func (s *Store) GetDrop(ctx context.Context, name string) (datadrop.Drop, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+dropColumns+` FROM drops WHERE name = ?`, name)

	d, err := scanDrop(row)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Drop{}, errors.Wrapf(ErrNotFound, "drop %q", name)
		}
		return datadrop.Drop{}, errors.Wrapf(err, "store: get drop %q", name)
	}
	return d, nil
}

// ListDrops returns every drop, name-ordered, with no regard for who is asking.
//
// The HTTP surface calls VisibleDrops instead; this stays for the root
// principal and for the CLI's administrative paths.
func (s *Store) ListDrops(ctx context.Context) ([]datadrop.Drop, error) {
	return s.queryDrops(ctx, `ORDER BY name`)
}

// queryDrops runs a SELECT over drops with the given suffix appended.
//
// The suffix is always a literal in this package — never anything derived from
// a request — and the values are bound. Factored out so that VisibleDrops'
// membership predicate and ListDrops share one column list and one scanner,
// which is what stops the two drifting apart when a column is added.
func (s *Store) queryDrops(ctx context.Context, suffix string, args ...any) ([]datadrop.Drop, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+dropColumns+` FROM drops `+suffix, args...)
	if err != nil {
		return nil, errors.Wrap(err, "store: list drops")
	}
	defer func() { _ = rows.Close() }()

	drops := []datadrop.Drop{}
	for rows.Next() {
		d, err := scanDrop(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan drop")
		}
		drops = append(drops, d)
	}
	return drops, errors.Wrap(rows.Err(), "store: list drops")
}

// DropStats reads a drop plus its cheap counters, for the inspect endpoint.
func (s *Store) DropStats(ctx context.Context, name string) (datadrop.DropStats, error) {
	d, err := s.GetDrop(ctx, name)
	if err != nil {
		return datadrop.DropStats{}, err
	}

	stats := datadrop.DropStats{Drop: d, Streams: []string{}}

	var lastEvent sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(MAX(seq), 0), MAX(received_at) FROM events WHERE drop_name = ?`,
		name,
	).Scan(&stats.EventCount, &stats.LastSeq, &lastEvent); err != nil {
		return datadrop.DropStats{}, errors.Wrapf(err, "store: drop stats %q", name)
	}
	if lastEvent.Valid {
		t, err := ParseTime(lastEvent.String)
		if err != nil {
			return datadrop.DropStats{}, err
		}
		stats.LastEvent = &t
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT stream FROM stream_heads WHERE drop_name = ? ORDER BY stream`, name)
	if err != nil {
		return datadrop.DropStats{}, errors.Wrapf(err, "store: list streams for %q", name)
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var stream string
		if err := rows.Scan(&stream); err != nil {
			return datadrop.DropStats{}, errors.Wrap(err, "store: scan stream")
		}
		stats.Streams = append(stats.Streams, stream)
	}
	return stats, errors.Wrap(rows.Err(), "store: list streams")
}

// scanner abstracts *sql.Row and *sql.Rows so scanDrop serves both.
type scanner interface{ Scan(dest ...any) error }

// dropColumns is the one place the drops column list is written down.
const dropColumns = `name, created_at, retention, public_read, owner_id`

func scanDrop(sc scanner) (datadrop.Drop, error) {
	var (
		d          datadrop.Drop
		createdAt  string
		retention  sql.NullString
		publicRead int
		ownerID    sql.NullString
	)
	if err := sc.Scan(&d.Name, &createdAt, &retention, &publicRead, &ownerID); err != nil {
		return datadrop.Drop{}, err
	}

	t, err := ParseTime(createdAt)
	if err != nil {
		return datadrop.Drop{}, err
	}
	d.CreatedAt = t
	d.Retention = retention.String
	d.PublicRead = publicRead != 0
	d.OwnerID = ownerID.String
	return d, nil
}
