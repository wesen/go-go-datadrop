package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// cloudEventsContentType marks a body as a full CloudEvents envelope rather
// than a bare payload.
const cloudEventsContentType = "application/cloudevents+json"

// handleAppendEvent is the ingest endpoint.
//
// The ordering here is load-bearing (intern guide §7.3): validate, then commit,
// then publish to the hub, then respond. Publishing before the commit would let
// a subscriber observe an event that then fails to persist.
func (s *Server) handleAppendEvent(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}

	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}

	stream := datadrop.NormalizeStream(r.URL.Query().Get("stream"))
	if err := datadrop.ValidateName("stream", stream); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	body, ok := s.readBody(w, r)
	if !ok {
		return
	}

	envelope, err := decodeIngest(body, r.Header.Get("Content-Type"), r.URL.Query().Get("mode"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}
	envelope.Drop = dropName
	envelope.Stream = stream

	// The drop must exist before we bother validating against its schema.
	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	warnings, ok := s.validatePayload(w, r, dropName, stream, &envelope)
	if !ok {
		return
	}

	appended, err := s.store.AppendEvent(auditContext(r), envelope)
	switch {
	case errors.Is(err, store.ErrAlreadyExists):
		// Idempotent replay: report the original event with 200, not 201, and
		// do not publish — subscribers already saw it the first time.
		writeJSON(w, r, http.StatusOK, datadrop.AppendResult{
			ID: appended.ID, Drop: appended.Drop, Stream: appended.Stream,
			Seq: appended.Seq, ReceivedAt: appended.ReceivedAt, Duplicate: true,
		})
		return
	case err != nil:
		s.writeStoreError(w, r, err)
		return
	}

	// Publish only after the commit succeeded. A crash between here and the
	// commit loses a notification, never data: the client's next reconnect
	// replays it from the durable table.
	s.hub.Publish(appended)

	writeJSON(w, r, http.StatusCreated, datadrop.AppendResult{
		ID: appended.ID, Drop: appended.Drop, Stream: appended.Stream,
		Seq: appended.Seq, ReceivedAt: appended.ReceivedAt, Warnings: warnings,
	})
}

// validatePayload applies the stream's active schema.
//
// It returns (warnings, true) when ingestion should proceed, and writes a
// problem document and returns (nil, false) when it should not. On success it
// annotates envelope.Meta with the schema version and any warnings.
func (s *Server) validatePayload(
	w http.ResponseWriter, r *http.Request,
	dropName, stream string, envelope *datadrop.Envelope,
) ([]datadrop.Violation, bool) {
	active, err := s.store.ActiveSchema(r.Context(), dropName, stream)
	if errors.Is(err, store.ErrNotFound) {
		// No schema registered. This is the upstream design's "open" mode:
		// accept any valid JSON. Not an error.
		return nil, true
	}
	if err != nil {
		s.writeStoreError(w, r, err)
		return nil, false
	}

	compiled, err := s.schemas.Get(active)
	if err != nil {
		// The stored schema no longer compiles. It was validated at PUT time,
		// so this is a server-side problem, not the caller's fault.
		s.internalError(w, r, err)
		return nil, false
	}

	result, err := compiled.Validate(envelope.Data)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return nil, false
	}

	if !result.Valid && active.Mode == datadrop.ModeStrict {
		writeProblem(w, r, http.StatusUnprocessableEntity, CodeValidationFailed,
			"payload does not satisfy schema version "+strconv.Itoa(active.Version),
			result.Violations...)
		return nil, false
	}

	meta := datadrop.EventMeta{
		SchemaVersion: active.Version,
		Producer:      envelope.Meta,
	}
	if !result.Valid {
		// Permissive mode: accept, but record why it was suspect. The warnings
		// are persisted, not just returned, so they survive the response.
		meta.Warnings = result.Violations
		log.Debug().
			Str("drop", dropName).Str("stream", stream).
			Int("violations", len(result.Violations)).
			Msg("accepted payload with schema warnings")
	}

	encoded, err := json.Marshal(meta)
	if err != nil {
		s.internalError(w, r, err)
		return nil, false
	}
	envelope.Meta = encoded

	return result.Violations, true
}

// decodeIngest accepts both request shapes the design defines (§10.1/§10.2).
//
// A body is treated as a full envelope when the Content-Type says so, or when
// mode=envelope is passed explicitly, or — as a fallback — when the top-level
// object carries a "specversion" key. That last heuristic is why mode=simple
// exists: a payload that legitimately contains a "specversion" field would
// otherwise be misread as an envelope.
func decodeIngest(body []byte, contentType, mode string) (datadrop.Envelope, error) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return datadrop.Envelope{}, errors.New("request body is empty")
	}
	if !json.Valid(trimmed) {
		return datadrop.Envelope{}, errors.New("request body is not valid JSON")
	}

	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "simple":
		return datadrop.Envelope{Data: json.RawMessage(trimmed)}, nil
	case "envelope":
		return decodeEnvelope(trimmed)
	case "":
	default:
		return datadrop.Envelope{}, errors.Errorf(
			"invalid mode %q: expected \"simple\" or \"envelope\"", mode)
	}

	mediaType := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	if mediaType == cloudEventsContentType {
		return decodeEnvelope(trimmed)
	}
	if hasSpecVersion(trimmed) {
		return decodeEnvelope(trimmed)
	}
	return datadrop.Envelope{Data: json.RawMessage(trimmed)}, nil
}

// ingestEnvelope is the wire form of a submitted envelope. It exists so that
// server-assigned fields (seq, received_at, drop) cannot be set by a client
// even if they appear in the body.
type ingestEnvelope struct {
	SpecVersion string          `json:"specversion"`
	ID          string          `json:"id"`
	Source      string          `json:"source"`
	Type        string          `json:"type"`
	Subject     string          `json:"subject"`
	Time        string          `json:"time"`
	Data        json.RawMessage `json:"data"`
	Meta        json.RawMessage `json:"meta"`
}

func decodeEnvelope(body []byte) (datadrop.Envelope, error) {
	var wire ingestEnvelope
	if err := json.Unmarshal(body, &wire); err != nil {
		return datadrop.Envelope{}, errors.Wrap(err, "invalid CloudEvents envelope")
	}
	if len(bytes.TrimSpace(wire.Data)) == 0 {
		return datadrop.Envelope{}, errors.New(`envelope is missing a "data" member`)
	}

	envelope := datadrop.Envelope{
		ID:      wire.ID,
		Source:  wire.Source,
		Type:    wire.Type,
		Subject: wire.Subject,
		Data:    wire.Data,
		Meta:    wire.Meta,
	}

	if wire.Time != "" {
		observed, err := parseTimestamp(wire.Time)
		if err != nil {
			return datadrop.Envelope{}, errors.Wrapf(err, "invalid envelope time %q", wire.Time)
		}
		envelope.Time = observed
	}
	return envelope, nil
}

// hasSpecVersion reports whether the body is a JSON object with a top-level
// "specversion" member, without fully decoding the payload.
func hasSpecVersion(body []byte) bool {
	var probe struct {
		SpecVersion *string `json:"specversion"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return false
	}
	return probe.SpecVersion != nil
}

// parseTimestamp accepts RFC3339, with or without fractional seconds.
func parseTimestamp(value string) (time.Time, error) {
	for _, layout := range []string{store.TimeFormat, time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, value); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, errors.Errorf("expected an RFC3339 timestamp, got %q", value)
}

func (s *Server) handleQueryEvents(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, dropName) {
		return
	}

	query, ok := s.parseEventQuery(w, r, dropName)
	if !ok {
		return
	}

	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	events, err := s.store.QueryEvents(r.Context(), query)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	result := datadrop.QueryResult{
		Drop:   query.Drop,
		Stream: query.Stream,
		Count:  len(events),
		Events: events,
	}
	if len(events) > 0 {
		// The cursor to resume from is the edge of this page in the direction
		// the caller is paging: the lowest sequence descending, highest
		// ascending.
		result.NextAfter = events[len(events)-1].Seq
	}

	writeJSON(w, r, http.StatusOK, result)
}

// parseEventQuery builds an EventQuery from the URL, reporting parse failures
// as 400s rather than silently defaulting.
func (s *Server) parseEventQuery(
	w http.ResponseWriter, r *http.Request, dropName string,
) (datadrop.EventQuery, bool) {
	params := r.URL.Query()

	query := datadrop.EventQuery{
		Drop:   dropName,
		Stream: datadrop.NormalizeStream(params.Get("stream")),
	}

	if raw := params.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
				errors.Wrapf(err, "invalid limit %q", raw).Error())
			return datadrop.EventQuery{}, false
		}
		query.Limit = limit
	}

	if raw := params.Get("after"); raw != "" {
		after, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
				errors.Wrapf(err, "invalid after %q", raw).Error())
			return datadrop.EventQuery{}, false
		}
		query.After = after
	}

	for _, bound := range []struct {
		param string
		field *time.Time
	}{
		{"from", &query.From},
		{"to", &query.To},
	} {
		raw := params.Get(bound.param)
		if raw == "" {
			continue
		}
		parsed, err := parseTimestamp(raw)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
				errors.Wrapf(err, "invalid %s", bound.param).Error())
			return datadrop.EventQuery{}, false
		}
		*bound.field = parsed
	}

	order, err := datadrop.ParseOrder(params.Get("order"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return datadrop.EventQuery{}, false
	}
	query.Order = order

	timeField, err := datadrop.ParseTimeField(params.Get("time_field"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return datadrop.EventQuery{}, false
	}
	query.TimeField = timeField

	if err := query.Normalize(); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return datadrop.EventQuery{}, false
	}
	return query, true
}

// bytesReader is a tiny helper so handlers_drops.go can re-read a buffered
// body without importing bytes.
func bytesReader(b []byte) *bytes.Reader { return bytes.NewReader(b) }
