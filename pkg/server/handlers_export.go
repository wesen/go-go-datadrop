package server

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
	"github.com/go-go-golems/go-go-datadrop/pkg/tabular"
)

// Export formats. Principle §6.6: open formats are the exit strategy, so all
// three ship in v0.1 rather than waiting for a later milestone.
const (
	FormatJSON   = "json"
	FormatNDJSON = "ndjson"
	FormatCSV    = "csv"
)

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = FormatNDJSON
	}
	switch format {
	case FormatJSON, FormatNDJSON, FormatCSV:
	default:
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"invalid format "+strconv.Quote(format)+": expected csv, ndjson, or json")
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

	// An export is a replay of the log, so it is always chronological and is
	// not bounded by the query limit — EachEvent pages past the cap.
	query.Order = datadrop.OrderAsc

	var err error
	switch format {
	case FormatNDJSON:
		err = s.exportNDJSON(w, r, query)
	case FormatJSON:
		err = s.exportJSON(w, r, query)
	case FormatCSV:
		err = s.exportCSV(w, r, query)
	}

	if err != nil {
		// The status line and part of the body are already on the wire by the
		// time a streaming export fails, so a problem document is impossible.
		// Log it and drop the connection; the client sees a truncated body.
		log.Error().Err(err).
			Str("drop", dropName).Str("format", format).
			Str("request_id", RequestIDFromContext(r.Context())).
			Msg("export failed mid-stream")
	}
}

// exportNDJSON writes one envelope per line, streaming.
func (s *Server) exportNDJSON(w http.ResponseWriter, r *http.Request, q datadrop.EventQuery) error {
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	encoder := json.NewEncoder(w)
	flusher, _ := w.(http.Flusher)

	count := 0
	err := s.store.EachEvent(r.Context(), q, func(e datadrop.Envelope) error {
		if err := encoder.Encode(e); err != nil {
			return errors.Wrap(err, "write NDJSON record")
		}
		count++
		if flusher != nil && count%200 == 0 {
			flusher.Flush()
		}
		return nil
	})
	if flusher != nil {
		flusher.Flush()
	}
	return err
}

// exportJSON writes one {"events":[...]} document, streaming the array so a
// large export does not materialize in memory.
func (s *Server) exportJSON(w http.ResponseWriter, r *http.Request, q datadrop.EventQuery) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write([]byte(`{"events":[`)); err != nil {
		return errors.Wrap(err, "write JSON prologue")
	}

	first := true
	err := s.store.EachEvent(r.Context(), q, func(e datadrop.Envelope) error {
		if !first {
			if _, err := w.Write([]byte(",")); err != nil {
				return errors.Wrap(err, "write JSON separator")
			}
		}
		first = false

		encoded, err := json.Marshal(e)
		if err != nil {
			return errors.Wrap(err, "encode event")
		}
		if _, err := w.Write(encoded); err != nil {
			return errors.Wrap(err, "write event")
		}
		return nil
	})
	if err != nil {
		return err
	}

	_, err = w.Write([]byte("]}\n"))
	return errors.Wrap(err, "write JSON epilogue")
}

// exportCSV flattens events into a table.
//
// The column set is the union of every payload key across the result, which
// cannot be known until every row has been seen — so this buffers. That is
// acceptable because the export is bounded by the same limit clamp as a query
// (datadrop.MaxLimit rows); an unbounded CSV export would need a two-pass
// scan and is deliberately out of v0.1 scope. The bound is enforced here
// rather than silently truncating.
//
// Flattening rules, pinned so two implementations agree:
//   - fixed envelope columns first, then "data.<key>" columns sorted by name;
//   - nested objects use dotted paths ("data.location.lat");
//   - arrays and any value that cannot be flattened are emitted as compact JSON;
//   - a missing value is an empty cell, not the string "null".
func (s *Server) exportCSV(w http.ResponseWriter, r *http.Request, q datadrop.EventQuery) error {
	type row struct {
		envelope datadrop.Envelope
		flat     map[string]string
	}

	var (
		rows        []row
		dataColumns = map[string]struct{}{}
	)

	q.Limit = datadrop.MaxLimit
	events, err := s.store.QueryEvents(r.Context(), q)
	if err != nil {
		return err
	}

	for _, e := range events {
		flat := map[string]string{}
		if err := tabular.FlattenStrings("", e.Data, flat); err != nil {
			return errors.Wrapf(err, "flatten event %s", e.ID)
		}
		for key := range flat {
			dataColumns[key] = struct{}{}
		}
		rows = append(rows, row{envelope: e, flat: flat})
	}

	columns := make([]string, 0, len(dataColumns))
	for key := range dataColumns {
		columns = append(columns, key)
	}
	sort.Strings(columns)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+q.Drop+`-`+q.Stream+`.csv"`)
	w.WriteHeader(http.StatusOK)

	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := make([]string, 0, len(tabular.EnvelopeColumns)+len(columns))
	header = append(header, tabular.EnvelopeColumns...)
	for _, key := range columns {
		header = append(header, tabular.DataPrefix+key)
	}
	if err := writer.Write(header); err != nil {
		return errors.Wrap(err, "write CSV header")
	}

	for _, rec := range rows {
		e := rec.envelope
		line := []string{
			e.ID, e.Drop, e.Stream, strconv.FormatInt(e.Seq, 10),
			store.FormatTime(e.Time), store.FormatTime(e.ReceivedAt),
			e.Source, e.Type, e.Subject,
		}
		for _, key := range columns {
			line = append(line, rec.flat[key])
		}
		if err := writer.Write(line); err != nil {
			return errors.Wrap(err, "write CSV row")
		}
	}

	writer.Flush()
	return errors.Wrap(writer.Error(), "flush CSV")
}
