package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// AppendEvent durably appends one event and returns it with its server-assigned
// sequence and receive time.
//
// The sequence is reserved from stream_heads inside the same transaction as the
// insert, so an acknowledged event is always durably ordered. This is the core
// storage invariant; see the intern guide §6.3.
//
// If an event with the same ID already exists, the insert is abandoned and the
// ORIGINAL event is returned alongside ErrAlreadyExists. That makes a retried
// write idempotent (guide §9.4): the caller reports 200 rather than 201 and
// does not append a duplicate.
func (s *Store) AppendEvent(ctx context.Context, e datadrop.Envelope) (datadrop.Envelope, error) {
	if err := datadrop.ValidateName("drop", e.Drop); err != nil {
		return datadrop.Envelope{}, err
	}
	e.Stream = datadrop.NormalizeStream(e.Stream)
	if err := datadrop.ValidateName("stream", e.Stream); err != nil {
		return datadrop.Envelope{}, err
	}

	e.SpecVersion = datadrop.SpecVersion
	if strings.TrimSpace(e.ID) == "" {
		id, err := NewEventID(s.Now())
		if err != nil {
			return datadrop.Envelope{}, err
		}
		e.ID = id
	}
	if e.Type == "" {
		e.Type = datadrop.DefaultType
	}

	e.ReceivedAt = s.Now()
	if e.Time.IsZero() {
		e.Time = e.ReceivedAt
	}

	data, err := compactJSON(e.Data)
	if err != nil {
		return datadrop.Envelope{}, errors.Wrap(err, "store: event data")
	}
	e.Data = data

	meta, err := compactJSON(e.Meta)
	if err != nil {
		return datadrop.Envelope{}, errors.Wrap(err, "store: event meta")
	}
	e.Meta = meta

	// The sequence reservation and the insert share one transaction: an
	// acknowledged event is always durably ordered, and a failed insert never
	// burns a sequence number.
	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return datadrop.Envelope{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	seq, err := reserveSequence(ctx, tx, e.Drop, e.Stream)
	if err != nil {
		return datadrop.Envelope{}, err
	}
	e.Seq = seq

	_, err = tx.ExecContext(ctx, `
		INSERT INTO events(id, drop_name, stream, seq, source, type, subject,
		                   time, received_at, data, meta)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.Drop, e.Stream, e.Seq,
		nullableString(e.Source), nullableString(e.Type), nullableString(e.Subject),
		FormatTime(e.Time), FormatTime(e.ReceivedAt),
		string(e.Data), nullableJSON(e.Meta))
	if err != nil {
		if isUniqueViolation(err) {
			// The aborted statement leaves the transaction unusable, so roll
			// back before re-reading the original event on a fresh connection.
			_ = tx.Rollback()
			committed = true // suppress the deferred rollback

			existing, getErr := s.GetEvent(ctx, e.ID)
			if getErr != nil {
				return datadrop.Envelope{}, errors.Wrapf(err, "store: append event %q", e.ID)
			}
			return existing, errors.Wrapf(ErrAlreadyExists, "event %q", e.ID)
		}
		if isForeignKeyViolation(err) {
			return datadrop.Envelope{}, errors.Wrapf(ErrNotFound, "drop %q", e.Drop)
		}
		return datadrop.Envelope{}, errors.Wrapf(err, "store: append event to %s/%s", e.Drop, e.Stream)
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionEventAppend,
		Drop:   e.Drop,
		Detail: jsonObject(map[string]any{
			"event_id": e.ID,
			"stream":   e.Stream,
			"seq":      e.Seq,
		}),
	}); err != nil {
		return datadrop.Envelope{}, err
	}

	if err := tx.Commit(); err != nil {
		return datadrop.Envelope{}, errors.Wrap(err, "store: commit event")
	}
	committed = true

	log.Debug().
		Str("drop", e.Drop).Str("stream", e.Stream).
		Int64("seq", e.Seq).Str("id", e.ID).
		Msg("appended event")

	return e, nil
}

// reserveSequence allocates the next sequence for (drop, stream) inside tx.
//
// The head row makes this O(1). MAX(seq)+1 would also work under a single
// connection but costs an index seek on a growing table for every write, and
// silently becomes a race if the pool cap is ever raised.
func reserveSequence(ctx context.Context, tx *sql.Tx, drop, stream string) (int64, error) {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO stream_heads(drop_name, stream, sequence) VALUES(?, ?, 0)
		ON CONFLICT(drop_name, stream) DO NOTHING`, drop, stream); err != nil {
		if isForeignKeyViolation(err) {
			return 0, errors.Wrapf(ErrNotFound, "drop %q", drop)
		}
		return 0, errors.Wrapf(err, "store: ensure stream head %s/%s", drop, stream)
	}

	var sequence int64
	if err := tx.QueryRowContext(ctx,
		`SELECT sequence FROM stream_heads WHERE drop_name = ? AND stream = ?`,
		drop, stream).Scan(&sequence); err != nil {
		return 0, errors.Wrapf(err, "store: read stream head %s/%s", drop, stream)
	}
	sequence++

	if _, err := tx.ExecContext(ctx,
		`UPDATE stream_heads SET sequence = ? WHERE drop_name = ? AND stream = ?`,
		sequence, drop, stream); err != nil {
		return 0, errors.Wrapf(err, "store: advance stream head %s/%s", drop, stream)
	}
	return sequence, nil
}

// GetEvent reads one event by its globally unique ID.
func (s *Store) GetEvent(ctx context.Context, id string) (datadrop.Envelope, error) {
	row := s.db.QueryRowContext(ctx, selectEventColumns+` FROM events WHERE id = ?`, id)

	e, err := scanEvent(row)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Envelope{}, errors.Wrapf(ErrNotFound, "event %q", id)
		}
		return datadrop.Envelope{}, errors.Wrapf(err, "store: get event %q", id)
	}
	return e, nil
}

const selectEventColumns = `
	SELECT id, drop_name, stream, seq, source, type, subject,
	       time, received_at, data, meta`

// QueryEvents returns a window of a stream.
//
// Every value is a bound parameter. The only interpolated fragments are
// q.TimeField and q.Order, both of which come from closed allowlists in
// package datadrop — Normalize rejects anything else before we get here.
func (s *Store) QueryEvents(ctx context.Context, q datadrop.EventQuery) ([]datadrop.Envelope, error) {
	if err := q.Normalize(); err != nil {
		return nil, err
	}

	var sb strings.Builder
	sb.WriteString(selectEventColumns)
	sb.WriteString(` FROM events WHERE drop_name = ? AND stream = ?`)
	args := []any{q.Drop, q.Stream}

	if q.After > 0 {
		if q.Order == datadrop.OrderAsc {
			sb.WriteString(` AND seq > ?`)
		} else {
			sb.WriteString(` AND seq < ?`)
		}
		args = append(args, q.After)
	}
	if !q.From.IsZero() {
		sb.WriteString(` AND ` + string(q.TimeField) + ` >= ?`)
		args = append(args, FormatTime(q.From))
	}
	if !q.To.IsZero() {
		sb.WriteString(` AND ` + string(q.TimeField) + ` < ?`)
		args = append(args, FormatTime(q.To))
	}

	sb.WriteString(` ORDER BY seq `)
	if q.Order == datadrop.OrderAsc {
		sb.WriteString(`ASC`)
	} else {
		sb.WriteString(`DESC`)
	}
	sb.WriteString(` LIMIT ?`)
	args = append(args, q.Limit)

	rows, err := s.db.QueryContext(ctx, sb.String(), args...)
	if err != nil {
		return nil, errors.Wrapf(err, "store: query events in %s/%s", q.Drop, q.Stream)
	}
	defer func() { _ = rows.Close() }()

	events := []datadrop.Envelope{}
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan event")
		}
		events = append(events, e)
	}
	return events, errors.Wrap(rows.Err(), "store: query events")
}

// EachEvent streams every event matching q to fn, paging by sequence so that
// an export is never bounded by q.Limit and never buffers the whole result.
//
// Order is always ascending: an export is a replay of the log.
func (s *Store) EachEvent(ctx context.Context, q datadrop.EventQuery, fn func(datadrop.Envelope) error) error {
	q.Order = datadrop.OrderAsc
	q.Limit = datadrop.MaxLimit
	if err := q.Normalize(); err != nil {
		return err
	}

	after := q.After
	for {
		page := q
		page.After = after

		events, err := s.QueryEvents(ctx, page)
		if err != nil {
			return err
		}
		for _, e := range events {
			if err := fn(e); err != nil {
				return err
			}
			after = e.Seq
		}
		if len(events) < page.Limit {
			return nil
		}
	}
}

func scanEvent(sc scanner) (datadrop.Envelope, error) {
	var (
		e                          datadrop.Envelope
		source, eventType, subject sql.NullString
		eventTime, receivedAt      string
		data                       string
		meta                       sql.NullString
	)

	if err := sc.Scan(&e.ID, &e.Drop, &e.Stream, &e.Seq,
		&source, &eventType, &subject,
		&eventTime, &receivedAt, &data, &meta); err != nil {
		return datadrop.Envelope{}, err
	}

	e.SpecVersion = datadrop.SpecVersion
	e.Source = source.String
	e.Type = eventType.String
	e.Subject = subject.String
	e.Data = json.RawMessage(data)
	if meta.Valid {
		e.Meta = json.RawMessage(meta.String)
	}

	var err error
	if e.Time, err = ParseTime(eventTime); err != nil {
		return datadrop.Envelope{}, err
	}
	if e.ReceivedAt, err = ParseTime(receivedAt); err != nil {
		return datadrop.Envelope{}, err
	}
	return e, nil
}

// ListStreams reports every stream in a drop, with its sequence head, its
// current event count, and the ingest time of its newest event.
//
// Streams have no registry — appending to a name creates it — so stream_heads
// is the only record that a stream ever existed. That matters for a stream
// whose events have all been swept: the head remains and the count is zero,
// which is a true statement about the drop that a query over `events` alone
// could not make.
//
// Cost: the two correlated subqueries are O(events in the stream). This is a
// catalogue endpoint called once when a picker opens, not per keystroke. If it
// ever becomes a problem the answer is an explicit "without counts" mode, not a
// cached counter column that can drift away from the rows it counts.
func (s *Store) ListStreams(ctx context.Context, drop string) ([]datadrop.StreamInfo, error) {
	if err := datadrop.ValidateName("drop", drop); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT h.stream,
		       h.sequence,
		       (SELECT COUNT(*) FROM events e
		         WHERE e.drop_name = h.drop_name AND e.stream = h.stream),
		       (SELECT MAX(e.received_at) FROM events e
		         WHERE e.drop_name = h.drop_name AND e.stream = h.stream)
		  FROM stream_heads h
		 WHERE h.drop_name = ?
		 ORDER BY h.stream`, drop)
	if err != nil {
		return nil, errors.Wrapf(err, "store: list streams in %s", drop)
	}
	defer func() { _ = rows.Close() }()

	streams := []datadrop.StreamInfo{}
	for rows.Next() {
		var (
			info     datadrop.StreamInfo
			lastSeen sql.NullString
		)
		if err := rows.Scan(&info.Stream, &info.Sequence, &info.EventCount, &lastSeen); err != nil {
			return nil, errors.Wrap(err, "store: scan stream")
		}
		if lastSeen.Valid {
			parsed, err := ParseTime(lastSeen.String)
			if err != nil {
				return nil, err
			}
			info.LastReceivedAt = &parsed
		}
		streams = append(streams, info)
	}
	return streams, errors.Wrapf(rows.Err(), "store: list streams in %s", drop)
}
