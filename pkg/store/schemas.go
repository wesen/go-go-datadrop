package store

import (
	"context"
	"encoding/json"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// PutSchema registers a new schema version for a stream.
//
// Versions are immutable and monotonic: this always writes MAX(version)+1 and
// never rewrites an existing row. The highest version is the active one.
func (s *Store) PutSchema(ctx context.Context, sc datadrop.Schema) (datadrop.Schema, error) {
	if err := datadrop.ValidateName("drop", sc.Drop); err != nil {
		return datadrop.Schema{}, err
	}
	sc.Stream = datadrop.NormalizeStream(sc.Stream)
	if err := datadrop.ValidateName("stream", sc.Stream); err != nil {
		return datadrop.Schema{}, err
	}

	mode, err := datadrop.ParseMode(string(sc.Mode))
	if err != nil {
		return datadrop.Schema{}, err
	}
	sc.Mode = mode

	// Compact but do not reformat: x-drop-* extension keywords must survive a
	// round trip byte-for-byte in content, since the semantic layer reads them.
	spec, err := compactJSON(sc.Spec)
	if err != nil {
		return datadrop.Schema{}, errors.Wrap(err, "store: schema spec")
	}
	if len(spec) == 0 {
		return datadrop.Schema{}, errors.New("store: schema spec is required")
	}
	sc.Spec = spec
	sc.CreatedAt = s.Now()

	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return datadrop.Schema{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	// The drop must exist. The foreign key would catch this on insert, but a
	// clean ErrNotFound beats decoding a constraint message.
	var exists int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM drops WHERE name = ?`, sc.Drop).Scan(&exists); err != nil {
		return datadrop.Schema{}, errors.Wrapf(err, "store: check drop %q", sc.Drop)
	}
	if exists == 0 {
		return datadrop.Schema{}, errors.Wrapf(ErrNotFound, "drop %q", sc.Drop)
	}

	var latest int
	if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM schemas WHERE drop_name = ? AND stream = ?`,
		sc.Drop, sc.Stream).Scan(&latest); err != nil {
		return datadrop.Schema{}, errors.Wrapf(err, "store: read latest schema version for %s/%s", sc.Drop, sc.Stream)
	}
	sc.Version = latest + 1

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO schemas(drop_name, stream, version, spec, mode, created_at)
		VALUES(?, ?, ?, ?, ?, ?)`,
		sc.Drop, sc.Stream, sc.Version, string(sc.Spec), string(sc.Mode),
		FormatTime(sc.CreatedAt)); err != nil {
		return datadrop.Schema{}, errors.Wrapf(err, "store: put schema for %s/%s", sc.Drop, sc.Stream)
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionSchemaPut,
		Drop:   sc.Drop,
		Detail: jsonObject(map[string]any{
			"stream":  sc.Stream,
			"version": sc.Version,
			"mode":    string(sc.Mode),
		}),
	}); err != nil {
		return datadrop.Schema{}, err
	}

	if err := tx.Commit(); err != nil {
		return datadrop.Schema{}, errors.Wrap(err, "store: commit schema")
	}
	committed = true

	log.Info().
		Str("drop", sc.Drop).Str("stream", sc.Stream).
		Int("version", sc.Version).Str("mode", string(sc.Mode)).
		Msg("registered schema")

	return sc, nil
}

// ActiveSchema returns the highest-versioned schema for a stream.
//
// ErrNotFound means no schema is registered, which is not an error condition:
// it is the upstream design's "open" mode, where any valid JSON is accepted.
func (s *Store) ActiveSchema(ctx context.Context, drop, stream string) (datadrop.Schema, error) {
	stream = datadrop.NormalizeStream(stream)

	var (
		sc        datadrop.Schema
		spec      string
		mode      string
		createdAt string
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT drop_name, stream, version, spec, mode, created_at
		FROM schemas WHERE drop_name = ? AND stream = ?
		ORDER BY version DESC LIMIT 1`, drop, stream,
	).Scan(&sc.Drop, &sc.Stream, &sc.Version, &spec, &mode, &createdAt)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Schema{}, errors.Wrapf(ErrNotFound, "schema for %s/%s", drop, stream)
		}
		return datadrop.Schema{}, errors.Wrapf(err, "store: active schema for %s/%s", drop, stream)
	}

	sc.Spec = json.RawMessage(spec)
	sc.Mode = datadrop.Mode(mode)
	if sc.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.Schema{}, err
	}
	return sc, nil
}
