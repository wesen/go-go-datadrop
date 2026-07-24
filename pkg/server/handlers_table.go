package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/tabular"
)

// The table endpoints project a source into the shape a chart consumes. They
// are the only endpoints the web UI needs for data; everything else it calls is
// a catalogue.
//
// All three are reads. The UI never mutates, which is what lets it authenticate
// with a bearer token out of sessionStorage and set no cookie at all — see the
// DATADROP-3 guide, DR-4.

// handleListStreams answers "what streams does this drop have".
//
// There is no other way to find out. A stream comes into existence the moment
// something appends to it, so the catalogue is derived from the sequence
// allocator rather than from a declaration.
func (s *Server) handleListStreams(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, dropName) {
		return
	}
	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	streams, err := s.store.ListStreams(r.Context(), dropName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"drop":    dropName,
		"count":   len(streams),
		"streams": streams,
	})
}

// handleStreamTable projects a window of an event stream into a table.
//
// It accepts the same window parameters as GET /events, because a chart and a
// page of envelopes are two views of one question and having them disagree
// about what `from` means would be indefensible.
func (s *Server) handleStreamTable(w http.ResponseWriter, r *http.Request) {
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

	// Re-parse the limit against the table budget rather than the envelope-page
	// budget. parseEventQuery has already clamped it to datadrop.MaxLimit;
	// LimitCap is what lets the store's own Normalize honour the larger number
	// instead of clamping it straight back.
	limit, ok := parseTableLimit(w, r)
	if !ok {
		return
	}
	//
	// Ask for one row more than the budget. Getting it back is proof that more
	// rows exist; not getting it is proof that they do not. The alternative —
	// treating a full page as evidence of a remainder — reports truncation for
	// a stream that happens to hold exactly `limit` events, which is a lie in
	// the direction that makes users distrust the banner.
	query.Limit = limit + 1
	query.LimitCap = tabular.MaxTableRows + 1

	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	events, err := s.store.QueryEvents(r.Context(), query)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	truncated := len(events) > limit
	if truncated {
		events = events[:limit]
	}

	table, err := tabular.FromEvents(tabular.SourceRef{
		Kind:   tabular.KindStream,
		Drop:   query.Drop,
		Stream: query.Stream,
	}, events)
	if err != nil {
		s.internalError(w, r, err)
		return
	}

	table.Truncated = truncated
	if query.Order == datadrop.OrderDesc {
		table.Strategy = tabular.StrategyLatest
	} else {
		table.Strategy = tabular.StrategyHead
	}

	writeJSON(w, r, http.StatusOK, table)
}

// handleDatasetTable projects one file of a committed dataset version.
func (s *Server) handleDatasetTable(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, dropName) {
		return
	}

	version, ok := s.resolveVersion(w, r, dropName, datasetName)
	if !ok {
		return
	}

	params := r.URL.Query()

	logicalPath := strings.TrimSpace(params.Get("path"))
	if logicalPath == "" {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"path is required: name the file within the dataset to project")
		return
	}
	// This is the live traversal vector on this endpoint. http.ServeMux cleans
	// URL paths before routing, so a "../" in a {path...} segment never reaches
	// a handler — but nothing normalizes a query parameter.
	if err := datadrop.ValidateDatasetPath(logicalPath); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	limit, ok := parseTableLimit(w, r)
	if !ok {
		return
	}

	// includeDrafts is false: a reader must never observe a version that is
	// still being assembled.
	found, err := s.store.GetDatasetVersion(r.Context(), dropName, datasetName, version, false)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	file, err := s.store.GetDatasetFile(r.Context(), dropName, datasetName, version, logicalPath)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	format := tabular.Format(strings.ToLower(strings.TrimSpace(params.Get("format"))))
	if format == "" {
		format = tabular.FormatFromPath(logicalPath, file.MediaType)
	}
	if !format.Valid() {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"cannot determine a row format for "+strconv.Quote(logicalPath)+
				": pass format=csv, format=ndjson, or format=json")
		return
	}

	body, err := s.blobs.Open(blob.Digest(file.Digest))
	if err != nil {
		s.internalError(w, r, errors.Wrapf(err, "open blob %s", file.Digest))
		return
	}
	defer func() { _ = body.Close() }()

	table, err := tabular.FromRows(
		tabular.SourceRef{
			Kind:    tabular.KindDataset,
			Drop:    dropName,
			Dataset: datasetName,
			Version: version,
			Path:    logicalPath,
		},
		body, format, limit, tabular.SchemaProperties(found.Schema))
	if err != nil {
		// A file that does not parse as the requested format is the caller's
		// data problem, not a server fault.
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	writeJSON(w, r, http.StatusOK, table)
}

// parseTableLimit reads ?limit against the table row budget.
//
// An over-large request is not an error. "Give me everything" is a reasonable
// thing to ask, and answering it with a 400 teaches the caller nothing; the
// response says how many rows it actually contains and whether it was cut.
func parseTableLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if raw == "" {
		return tabular.DefaultTableRows, true
	}

	limit, err := strconv.Atoi(raw)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"invalid limit "+strconv.Quote(raw)+": expected an integer")
		return 0, false
	}
	return tabular.ClampRows(limit), true
}
