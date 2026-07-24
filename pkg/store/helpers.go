package store

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// execer is satisfied by both *sql.DB and *sql.Tx, so audit records can be
// written either standalone or inside a caller's transaction.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// NewEventID mints a ULID: 128 bits, time-prefixed, lexicographically sortable
// by creation time. Preferred over UUIDv4 because sorting the ID sorts the
// events, which makes IDs debuggable in a way random UUIDs are not.
func NewEventID(t time.Time) (string, error) {
	id, err := ulid.New(ulid.Timestamp(t), rand.Reader)
	if err != nil {
		return "", errors.Wrap(err, "store: generate event id")
	}
	return id.String(), nil
}

// beginImmediate starts a write transaction.
//
// The IMMEDIATE lock mode comes from the connection's `_txlock=immediate` DSN
// parameter (see dsnForPath), not from anything here — database/sql has no API
// for SQLite's BEGIN variants, so it has to be a connection-level setting.
func (s *Store) beginImmediate(ctx context.Context) (*sql.Tx, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	return tx, errors.Wrap(err, "store: begin transaction")
}

// audit appends one write-log record. It takes an execer so that a caller can
// make the audit record part of the same transaction as the change it records.
func (s *Store) audit(ctx context.Context, ex execer, rec datadrop.AuditRecord) error {
	if rec.TS.IsZero() {
		rec.TS = s.Now()
	}
	if rec.Actor == "" {
		rec.Actor = ActorFromContext(ctx)
	}

	_, err := ex.ExecContext(ctx,
		`INSERT INTO audit_log(ts, actor, action, drop_name, detail) VALUES(?, ?, ?, ?, ?)`,
		FormatTime(rec.TS), nullableString(rec.Actor), rec.Action,
		nullableString(rec.Drop), nullableJSON(rec.Detail))
	return errors.Wrapf(err, "store: write audit record %q", rec.Action)
}

// ListAudit returns the most recent audit records, newest first.
func (s *Store) ListAudit(ctx context.Context, drop string, limit int) ([]datadrop.AuditRecord, error) {
	if limit <= 0 || limit > datadrop.MaxLimit {
		limit = datadrop.DefaultLimit
	}

	query := `SELECT id, ts, actor, action, drop_name, detail FROM audit_log`
	args := []any{}
	if drop != "" {
		query += ` WHERE drop_name = ?`
		args = append(args, drop)
	}
	query += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, errors.Wrap(err, "store: list audit records")
	}
	defer func() { _ = rows.Close() }()

	records := []datadrop.AuditRecord{}
	for rows.Next() {
		var (
			rec                     datadrop.AuditRecord
			ts                      string
			actor, dropName, detail sql.NullString
		)
		if err := rows.Scan(&rec.ID, &ts, &actor, &rec.Action, &dropName, &detail); err != nil {
			return nil, errors.Wrap(err, "store: scan audit record")
		}
		t, err := ParseTime(ts)
		if err != nil {
			return nil, err
		}
		rec.TS = t
		rec.Actor = actor.String
		rec.Drop = dropName.String
		if detail.Valid {
			rec.Detail = json.RawMessage(detail.String)
		}
		records = append(records, rec)
	}
	return records, errors.Wrap(rows.Err(), "store: list audit records")
}

// actorContextKey types the context value carrying the authenticated actor.
type actorContextKey struct{}

// WithActor tags ctx with the principal responsible for a mutation, so the
// store can attribute audit records without every method taking an actor
// parameter.
func WithActor(ctx context.Context, actor string) context.Context {
	return context.WithValue(ctx, actorContextKey{}, actor)
}

// ActorFromContext returns the actor set by WithActor, or "anonymous".
func ActorFromContext(ctx context.Context) string {
	if actor, ok := ctx.Value(actorContextKey{}).(string); ok && actor != "" {
		return actor
	}
	return "anonymous"
}

// compactJSON validates and minifies a JSON document. It preserves content
// exactly — only insignificant whitespace is removed — because principle §6.2
// says raw input is evidence.
//
// A nil, empty, or literal-null input compacts to nil rather than to "null",
// so callers can distinguish "absent" from "present and null".
func compactJSON(raw json.RawMessage) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, nil
	}

	var buf bytes.Buffer
	if err := json.Compact(&buf, trimmed); err != nil {
		return nil, errors.Wrap(err, "invalid JSON")
	}
	return json.RawMessage(buf.Bytes()), nil
}

// jsonObject marshals a map for an audit detail column. Marshalling a
// map[string]any of scalars cannot fail, so an error would be a programming
// bug; it is dropped rather than propagated into every audit call site.
func jsonObject(v map[string]any) json.RawMessage {
	encoded, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return encoded
}

// nullableString maps "" to SQL NULL so absent values are not stored as empty
// strings, which would be indistinguishable from a deliberate empty value.
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
