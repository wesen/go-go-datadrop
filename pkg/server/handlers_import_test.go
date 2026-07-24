package server

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const importCSV = "observed_at,temperature_c,humidity\n" +
	"2026-07-01T00:00:00Z,21.7,0.48\n" +
	"2026-07-01T00:00:30Z,22.1,0.47\n" +
	"2026-07-01T00:01:00Z,22.4,0.46\n"

// importInto publishes a dataset file and materializes it, returning the result.
func importInto(t *testing.T, srv *Server, path, body, query string) datadrop.ImportResult {
	t.Helper()

	publish(t, srv, "greenhouse", "readings", path, body, "")

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/latest/import?path="+path+query, "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("import: status %d, body %s", rec.Code, rec.Body)
	}

	var result datadrop.ImportResult
	decodeBody(t, rec, &result)
	return result
}

func TestImportCSVProducesOneEventPerRow(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	result := importInto(t, srv, "readings.csv", importCSV, "")

	if result.Rows != 3 || result.Appended != 3 {
		t.Fatalf("rows=%d appended=%d, want 3 and 3", result.Rows, result.Appended)
	}

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events?order=asc", "", true)
	var query datadrop.QueryResult
	decodeBody(t, rec, &query)

	if len(query.Events) != 3 {
		t.Fatalf("stream holds %d events, want 3", len(query.Events))
	}

	// CSV has no types, so a numeric column must arrive as a number or a schema
	// declaring "type": "number" could never be satisfied.
	var payload map[string]any
	if err := json.Unmarshal(query.Events[0].Data, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if _, isNumber := payload["temperature_c"].(float64); !isNumber {
		t.Fatalf("temperature_c is %T, want a number", payload["temperature_c"])
	}
	if _, isString := payload["observed_at"].(string); !isString {
		t.Fatalf("observed_at is %T, want a string", payload["observed_at"])
	}
}

// Every generated event must point back at the exact bytes and row it came
// from; that is what makes derived events auditable.
func TestImportRecordsProvenance(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	importInto(t, srv, "readings.csv", importCSV, "")

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events?order=asc&limit=1", "", true)
	var query datadrop.QueryResult
	decodeBody(t, rec, &query)

	var meta map[string]any
	if err := json.Unmarshal(query.Events[0].Meta, &meta); err != nil {
		t.Fatalf("decode meta %s: %v", query.Events[0].Meta, err)
	}

	for key, want := range map[string]any{
		"dataset":         "readings",
		"dataset_version": float64(1),
		"dataset_path":    "readings.csv",
		"row":             float64(1),
	} {
		if meta[key] != want {
			t.Errorf("meta[%q] = %v, want %v", key, meta[key], want)
		}
	}
	if digest, ok := meta["digest"].(string); !ok || digest != sha256Of(importCSV) {
		t.Errorf("meta[digest] = %v, want the file's digest", meta["digest"])
	}
}

// Re-running an interrupted import must resume, not duplicate. Event
// identifiers derive from (digest, row), so the second run replays the same
// identifiers and the v0.1 append path returns the originals.
func TestImportIsIdempotent(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	first := importInto(t, srv, "readings.csv", importCSV, "")
	if first.Appended != 3 || first.Skipped != 0 {
		t.Fatalf("first run: appended=%d skipped=%d, want 3 and 0", first.Appended, first.Skipped)
	}

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/latest/import?path=readings.csv", "", true)
	var second datadrop.ImportResult
	decodeBody(t, rec, &second)

	if second.Appended != 0 || second.Skipped != 3 {
		t.Fatalf("second run: appended=%d skipped=%d, want 0 and 3", second.Appended, second.Skipped)
	}

	query := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", true)
	var result datadrop.QueryResult
	decodeBody(t, query, &result)
	if len(result.Events) != 3 {
		t.Fatalf("stream holds %d events after two imports, want 3", len(result.Events))
	}
}

func TestImportNDJSON(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	body := `{"temperature_c":21.7}` + "\n" + `{"temperature_c":22.1}` + "\n"
	result := importInto(t, srv, "readings.ndjson", body, "")

	if result.Rows != 2 || result.Appended != 2 {
		t.Fatalf("rows=%d appended=%d, want 2 and 2", result.Rows, result.Appended)
	}
}

func TestImportRoutesToTheRequestedStream(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	importInto(t, srv, "readings.csv", importCSV, "&stream=imported")

	// The default stream must be untouched.
	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", true)
	var events datadrop.QueryResult
	decodeBody(t, rec, &events)
	if len(events.Events) != 0 {
		t.Fatalf("the default stream received %d events, want 0", len(events.Events))
	}

	rec = request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events?stream=imported", "", true)
	decodeBody(t, rec, &events)
	if len(events.Events) != 3 {
		t.Fatalf("the imported stream holds %d events, want 3", len(events.Events))
	}
}

// Reaching the row cap must be reported, not passed over in silence.
func TestImportReportsTruncation(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	result := importInto(t, srv, "readings.csv", importCSV, "&max_rows=2")

	if !result.Truncated {
		t.Fatal("hitting the row cap was not reported as truncation")
	}
	if result.Appended != 2 {
		t.Fatalf("appended=%d, want 2", result.Appended)
	}
}

// A dataset schema is advisory by default, so a long import is not aborted
// partway by one bad row.
func TestImportWarnsOnSchemaViolations(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/readings.csv",
		"temperature_c\n21.7\nwarm\n", "text/csv", true)
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/1/commit",
		`{"schema":{"type":"object","properties":{"temperature_c":{"type":"number"}}}}`, true)

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=readings.csv", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var result datadrop.ImportResult
	decodeBody(t, rec, &result)
	if result.Appended != 2 {
		t.Fatalf("appended=%d, want 2 — a violation must not abort a permissive import", result.Appended)
	}
	if len(result.Warnings) == 0 {
		t.Fatal("a schema violation produced no warning")
	}
}

func TestImportStrictRejectsBadRows(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/readings.csv",
		"temperature_c\n21.7\nwarm\n", "text/csv", true)
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/1/commit",
		`{"schema":{"type":"object","properties":{"temperature_c":{"type":"number"}}}}`, true)

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=readings.csv&strict=true", "", true)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusUnprocessableEntity, rec.Body)
	}
}

func TestImportRequiresAPath(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "readings.csv", importCSV, "")

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// A file whose format cannot be inferred must say so rather than guess.
func TestImportRequiresAKnownFormat(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/data",
		importCSV, "application/octet-stream", true)
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/1/commit", "", true)

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=data", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	// Naming the format explicitly works.
	ok := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=data&format=csv", "", true)
	if ok.Code != http.StatusOK {
		t.Fatalf("explicit format: status %d, body %s", ok.Code, ok.Body)
	}
}

func TestImportRequiresAuth(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "readings.csv", importCSV, "")

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=readings.csv", "", false)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestImportMissingFile(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "readings.csv", importCSV, "")

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/greenhouse/datasets/readings/versions/1/import?path=nosuch.csv", "", true)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestCSVValueTyping(t *testing.T) {
	for input, want := range map[string]any{
		"21.7":                 21.7,
		"-3":                   float64(-3),
		"1e3":                  float64(1000),
		"":                     "",
		"warm":                 "warm",
		"true":                 true,
		"false":                false,
		"2026-07-01T00:00:00Z": "2026-07-01T00:00:00Z",
		// ParseFloat accepts hex float syntax; JSON does not represent it, and
		// a value like this is far more likely to be an identifier.
		"0x1p-2": "0x1p-2",
	} {
		if got := csvValue(input); got != want {
			t.Errorf("csvValue(%q) = %v (%T), want %v (%T)", input, got, got, want, want)
		}
	}
}

func TestFormatFromPath(t *testing.T) {
	for _, tc := range []struct {
		path, mediaType, want string
	}{
		{"data.csv", "", "csv"},
		{"data.ndjson", "", "ndjson"},
		{"data.jsonl", "", "ndjson"},
		{"data", "text/csv", "csv"},
		{"data", "application/x-ndjson", "ndjson"},
		{"data", "", ""},
		{"data.txt", "", ""},
	} {
		if got := formatFromPath(tc.path, tc.mediaType); got != tc.want {
			t.Errorf("formatFromPath(%q, %q) = %q, want %q", tc.path, tc.mediaType, got, tc.want)
		}
	}
}

// Identifiers derive from the digest rather than the dataset name, so the same
// content imported under two names does not duplicate the events.
func TestImportEventIDDependsOnContentNotName(t *testing.T) {
	digest := sha256Of("some content")
	other := sha256Of("different content")

	if importEventID(digest, 1) == importEventID(digest, 2) {
		t.Fatal("two rows of the same file share an identifier")
	}
	if importEventID(digest, 1) == importEventID(other, 1) {
		t.Fatal("the same row of two different files shares an identifier")
	}
}

// The derivation must stay stable across releases. Changing it silently breaks
// idempotency for every dataset already imported: a re-run would produce new
// identifiers and duplicate every row. A golden value is the only assertion
// that catches such a change — comparing the function to itself cannot.
func TestImportEventIDIsStable(t *testing.T) {
	// Derived independently: "ds-" + sha256(digest + "#1")[:32].
	const (
		digest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
		want   = "ds-732f8185da33e00e0556e9fb3ca1b9a2"
	)
	if got := importEventID(digest, 1); got != want {
		t.Fatalf("importEventID = %q, want %q.\n"+
			"If this change is deliberate, note that it invalidates the idempotency "+
			"of every already-imported dataset.", got, want)
	}
}
