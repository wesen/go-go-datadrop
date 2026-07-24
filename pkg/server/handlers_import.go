package server

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/schema"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// DefaultImportMaxRows bounds a synchronous import.
//
// The upstream design makes large imports background jobs with progress
// reporting. v0.2 caps the row count and returns a summary instead: that is
// useful immediately and does not prejudge the job design. Reaching the cap is
// reported as Truncated rather than passed over in silence.
const DefaultImportMaxRows = 100_000

// handleImportDataset materializes a dataset file's rows into an event stream.
//
// Every generated event carries provenance back to the dataset version, the
// file, the row number, and the digest of the exact bytes it came from — which
// is what the upstream design §12.4 requires and what makes derived events
// auditable.
func (s *Server) handleImportDataset(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
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
			"path is required: name the file within the dataset to import")
		return
	}

	streamName := datadrop.NormalizeStream(params.Get("stream"))
	if err := datadrop.ValidateName("stream", streamName); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	maxRows := DefaultImportMaxRows
	if raw := params.Get("max_rows"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
				"invalid max_rows "+strconv.Quote(raw)+": expected a positive integer")
			return
		}
		maxRows = parsed
	}

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

	format := strings.ToLower(strings.TrimSpace(params.Get("format")))
	if format == "" {
		format = formatFromPath(logicalPath, file.MediaType)
	}
	if format != "csv" && format != "ndjson" {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"cannot determine a row format for "+strconv.Quote(logicalPath)+
				": pass format=csv or format=ndjson")
		return
	}

	compiled, mode, ok := s.importValidator(w, r, found)
	if !ok {
		return
	}

	body, err := s.blobs.Open(blob.Digest(file.Digest))
	if err != nil {
		s.internalError(w, r, errors.Wrapf(err, "open blob %s", file.Digest))
		return
	}
	defer func() { _ = body.Close() }()

	result, err := s.materialize(r, materializeRequest{
		drop:        dropName,
		dataset:     datasetName,
		version:     version,
		logicalPath: logicalPath,
		digest:      file.Digest,
		stream:      streamName,
		format:      format,
		maxRows:     maxRows,
		body:        body,
		compiled:    compiled,
		mode:        mode,
	})
	if err != nil {
		s.writeImportError(w, r, err)
		return
	}

	if err := s.store.Audit(auditContext(r), datadrop.AuditRecord{
		Action: datadrop.ActionDatasetImport,
		Drop:   dropName,
		Detail: jsonDetail(map[string]any{
			"dataset": datasetName, "version": version, "path": logicalPath,
			"stream": streamName, "rows": result.Rows, "appended": result.Appended,
		}),
	}); err != nil {
		s.internalError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, result)
}

// importValidator compiles the version's schema, if it has one.
//
// A dataset schema describes one record, and it is applied here rather than at
// upload time: validating a 400 MB CSV during upload would mean parsing it in
// the request path, which the streaming commitment excludes.
func (s *Server) importValidator(
	w http.ResponseWriter, r *http.Request, version datadrop.DatasetVersion,
) (*schema.Compiled, datadrop.Mode, bool) {
	if len(version.Schema) == 0 {
		return nil, datadrop.ModePermissive, true
	}

	compiled, err := s.schemas.Get(datadrop.Schema{
		Drop:    version.Drop,
		Stream:  version.Dataset + "#v" + strconv.Itoa(version.Version),
		Version: version.Version,
		Spec:    version.Schema,
	})
	if err != nil {
		s.internalError(w, r, err)
		return nil, "", false
	}

	// A dataset schema is advisory by default: rows that do not match are
	// imported with warnings rather than aborting a long import partway.
	// ?strict=true makes a violation fatal.
	mode := datadrop.ModePermissive
	if strings.EqualFold(r.URL.Query().Get("strict"), "true") {
		mode = datadrop.ModeStrict
	}
	return compiled, mode, true
}

type materializeRequest struct {
	drop        string
	dataset     string
	version     int
	logicalPath string
	digest      string
	stream      string
	format      string
	maxRows     int
	body        io.Reader
	compiled    *schema.Compiled
	mode        datadrop.Mode
}

// errImportRejected marks a row that failed strict validation, so the handler
// can map it to 422 rather than 500.
var errImportRejected = errors.New("row rejected by the dataset schema")

// materialize reads rows and appends one event per row.
func (s *Server) materialize(
	r *http.Request, req materializeRequest,
) (datadrop.ImportResult, error) {
	result := datadrop.ImportResult{
		Drop: req.drop, Dataset: req.dataset, Version: req.version,
		Path: req.logicalPath, Stream: req.stream,
	}

	ctx := auditContext(r)

	emit := func(row int, payload json.RawMessage) error {
		result.Rows++

		if req.compiled != nil {
			outcome, err := req.compiled.Validate(payload)
			if err != nil {
				return errors.Wrapf(err, "row %d", row)
			}
			if !outcome.Valid {
				if req.mode == datadrop.ModeStrict {
					return errors.Wrapf(errImportRejected, "row %d", row)
				}
				result.Warnings = append(result.Warnings, outcome.Violations...)
			}
		}

		meta, err := json.Marshal(map[string]any{
			"dataset":         req.dataset,
			"dataset_version": req.version,
			"dataset_path":    req.logicalPath,
			"digest":          req.digest,
			"row":             row,
		})
		if err != nil {
			return errors.Wrap(err, "encode provenance")
		}

		// A deterministic identifier derived from (digest, row) makes a repeated
		// import idempotent: the second run replays the same identifiers, and
		// the v0.1 append path returns the original event rather than appending
		// a duplicate. This is why an interrupted import can simply be re-run.
		event := datadrop.Envelope{
			Drop:   req.drop,
			Stream: req.stream,
			ID:     importEventID(req.digest, row),
			Source: "dataset:" + req.dataset + "/" + req.logicalPath,
			Type:   "io.datadrop.dataset.row.v1",
			Data:   payload,
			Meta:   meta,
		}

		appended, err := s.store.AppendEvent(ctx, event)
		switch {
		case errors.Is(err, store.ErrAlreadyExists):
			// Already imported by an earlier run.
			result.Skipped++
			return nil
		case err != nil:
			return errors.Wrapf(err, "row %d", row)
		}

		result.Appended++
		s.hub.Publish(appended)
		return nil
	}

	var err error
	switch req.format {
	case "csv":
		result.Truncated, err = readCSVRows(req.body, req.maxRows, emit)
	default:
		result.Truncated, err = readNDJSONRows(req.body, req.maxRows, emit)
	}
	if err != nil {
		return result, err
	}
	return result, nil
}

// readCSVRows turns each data row into a JSON object keyed by the header.
func readCSVRows(body io.Reader, maxRows int, emit func(int, json.RawMessage) error) (bool, error) {
	reader := csv.NewReader(body)
	// Rows are allowed to differ in length; a short or long row is a data
	// problem to report, not a parse error that aborts the file.
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = true

	header, err := reader.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			return false, nil // an empty file imports zero rows
		}
		return false, errors.Wrap(err, "read CSV header")
	}

	columns := make([]string, len(header))
	copy(columns, header)
	for i, name := range columns {
		if strings.TrimSpace(name) == "" {
			columns[i] = "column_" + strconv.Itoa(i+1)
		}
	}

	row := 0
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			return false, nil
		}
		if err != nil {
			return false, errors.Wrapf(err, "read CSV row %d", row+1)
		}
		if row >= maxRows {
			return true, nil
		}
		row++

		payload := map[string]any{}
		for i, value := range record {
			name := "column_" + strconv.Itoa(i+1)
			if i < len(columns) {
				name = columns[i]
			}
			payload[name] = csvValue(value)
		}

		encoded, err := json.Marshal(payload)
		if err != nil {
			return false, errors.Wrapf(err, "encode CSV row %d", row)
		}
		if err := emit(row, encoded); err != nil {
			return false, err
		}
	}
}

// csvValue types a CSV cell.
//
// CSV has no types, so a number that reads as a number becomes one and
// everything else stays a string. Without this every field would be a string
// and a JSON Schema declaring `"type": "number"` could never be satisfied.
func csvValue(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if number, err := strconv.ParseFloat(trimmed, 64); err == nil {
		// Reject the forms ParseFloat accepts but JSON does not represent.
		if !strings.ContainsAny(trimmed, "xXpP") && !isNonFinite(number) {
			return number
		}
	}
	switch strings.ToLower(trimmed) {
	case "true":
		return true
	case "false":
		return false
	}
	return value
}

func isNonFinite(f float64) bool {
	return f != f || f > 1e308 || f < -1e308
}

// readNDJSONRows treats each non-empty line as one payload.
func readNDJSONRows(body io.Reader, maxRows int, emit func(int, json.RawMessage) error) (bool, error) {
	decoder := json.NewDecoder(body)

	row := 0
	for {
		var payload json.RawMessage
		err := decoder.Decode(&payload)
		if errors.Is(err, io.EOF) {
			return false, nil
		}
		if err != nil {
			return false, errors.Wrapf(err, "decode NDJSON record %d", row+1)
		}
		if row >= maxRows {
			return true, nil
		}
		row++

		if err := emit(row, payload); err != nil {
			return false, err
		}
	}
}

// importEventID derives a stable identifier from the source bytes and the row.
//
// Deriving it from the digest rather than from the dataset name means the same
// content imported under two names produces the same identifiers, so importing
// a renamed copy does not duplicate the events.
func importEventID(digest string, row int) string {
	sum := sha256.Sum256([]byte(digest + "#" + strconv.Itoa(row)))
	return "ds-" + hex.EncodeToString(sum[:16])
}

// formatFromPath guesses the row format from the file name or media type.
func formatFromPath(logicalPath, mediaType string) string {
	lower := strings.ToLower(logicalPath)
	switch {
	case strings.HasSuffix(lower, ".csv"):
		return "csv"
	case strings.HasSuffix(lower, ".ndjson"), strings.HasSuffix(lower, ".jsonl"):
		return "ndjson"
	}

	switch strings.ToLower(mediaType) {
	case "text/csv":
		return "csv"
	case "application/x-ndjson", "application/jsonl":
		return "ndjson"
	}
	return ""
}

func (s *Server) writeImportError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, errImportRejected):
		writeProblem(w, r, http.StatusUnprocessableEntity, CodeValidationFailed, err.Error())
	case errors.Is(err, store.ErrNotFound), errors.Is(err, store.ErrAlreadyExists):
		s.writeStoreError(w, r, err)
	default:
		// A malformed row is the caller's data problem, not a server fault.
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
	}
}

// jsonDetail encodes an audit detail object.
func jsonDetail(v map[string]any) json.RawMessage {
	encoded, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return encoded
}
