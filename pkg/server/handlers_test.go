package server

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/tabular"
)

const testToken = "test-token"

const readingSchema = `{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"required": ["temperature"],
	"properties": {
		"temperature": { "type": "number", "x-drop-semantic": "temperature" },
		"humidity": { "type": "number", "minimum": 0, "maximum": 1 }
	}
}`

// request issues a request against the full middleware chain.
func request(t *testing.T, srv *Server, method, target, body string, authorized bool) *httptest.ResponseRecorder {
	t.Helper()

	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}

	req := httptest.NewRequest(method, target, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if authorized {
		req.Header.Set("Authorization", "Bearer "+testToken)
	}

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// seedDrop creates a drop and returns the server, failing the test on error.
func seedDrop(t *testing.T, srv *Server, name string) {
	t.Helper()

	rec := request(t, srv, http.MethodPost, "/v1/drops", `{"name":"`+name+`"}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed drop %q: status %d, body %s", name, rec.Code, rec.Body)
	}
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder, out any) {
	t.Helper()

	if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
}

func TestCreateDropRequiresAuth(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/drops", `{"name":"greenhouse"}`, false)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
	if challenge := rec.Header().Get("WWW-Authenticate"); challenge == "" {
		t.Fatal("401 response is missing a WWW-Authenticate challenge")
	}
}

// A problem document must never echo the credential that was presented.
func TestUnauthorizedResponseDoesNotLeakTheToken(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodPost, "/v1/drops", strings.NewReader(`{"name":"x"}`))
	req.Header.Set("Authorization", "Bearer super-secret-value")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if strings.Contains(rec.Body.String(), "super-secret-value") {
		t.Fatalf("the response echoed the presented token: %s", rec.Body)
	}
}

func TestCreateDropRejectsInvalidName(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/drops", `{"name":"Not Valid"}`, true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusBadRequest, rec.Body)
	}

	var problem Problem
	decodeBody(t, rec, &problem)
	if problem.Code != CodeInvalidRequest {
		t.Fatalf("code = %q, want %q", problem.Code, CodeInvalidRequest)
	}
	if problem.RequestID == "" {
		t.Fatal("problem document is missing a request_id")
	}
}

func TestCreateDropConflict(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := request(t, srv, http.MethodPost, "/v1/drops", `{"name":"greenhouse"}`, true)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}
}

// A misspelled field must fail loudly rather than silently create a drop with
// the wrong policy.
func TestCreateDropRejectsUnknownFields(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/drops",
		`{"name":"greenhouse","public_reed":true}`, true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestAppendEventSimpleMode(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events",
		`{"temperature": 21.7}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body)
	}

	var result datadrop.AppendResult
	decodeBody(t, rec, &result)
	if result.Seq != 1 {
		t.Fatalf("seq = %d, want 1", result.Seq)
	}
	if result.Stream != datadrop.DefaultStream {
		t.Fatalf("stream = %q, want %q", result.Stream, datadrop.DefaultStream)
	}
}

func TestAppendEventEnvelopeMode(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	body := `{"specversion":"1.0","id":"fixed-id","source":"device:sensor-7",
	          "type":"io.example.reading","subject":"zone-a",
	          "time":"2026-07-01T12:00:00.000Z","data":{"temperature":21.7}}`

	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", body, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body)
	}

	var result datadrop.AppendResult
	decodeBody(t, rec, &result)
	if result.ID != "fixed-id" {
		t.Fatalf("id = %q, want the client-supplied %q", result.ID, "fixed-id")
	}

	// The envelope's attributes must have been stored, and the producer's
	// observation time kept distinct from the receive time.
	read := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", true)
	var query datadrop.QueryResult
	decodeBody(t, read, &query)

	if len(query.Events) != 1 {
		t.Fatalf("stored %d events, want 1", len(query.Events))
	}
	stored := query.Events[0]
	if stored.Source != "device:sensor-7" || stored.Type != "io.example.reading" || stored.Subject != "zone-a" {
		t.Fatalf("envelope attributes were not stored: %+v", stored)
	}
	if stored.Time.Equal(stored.ReceivedAt) {
		t.Fatal("producer time and receive time were conflated")
	}
}

// A replayed ID returns the original event with 200, not a second event.
func TestAppendEventIsIdempotent(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	body := `{"specversion":"1.0","id":"fixed-id","data":{"temperature":21.7}}`

	first := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", body, true)
	if first.Code != http.StatusCreated {
		t.Fatalf("first status = %d, want %d", first.Code, http.StatusCreated)
	}

	second := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", body, true)
	if second.Code != http.StatusOK {
		t.Fatalf("replay status = %d, want %d (200 signals a duplicate)", second.Code, http.StatusOK)
	}

	var original, replay datadrop.AppendResult
	decodeBody(t, first, &original)
	decodeBody(t, second, &replay)
	if replay.Seq != original.Seq {
		t.Fatalf("replay seq = %d, want the original %d", replay.Seq, original.Seq)
	}
}

func TestAppendEventToMissingDrop(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/drops/nosuch/events", `{"a":1}`, true)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestAppendEventRejectsMalformedJSON(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", `{"broken":`, true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestAppendEventEnforcesBodyLimit(t *testing.T) {
	srv := newTestServer(t)
	srv.cfg.MaxBodyBytes = 64
	seedDrop(t, srv, "greenhouse")

	oversize := `{"a":"` + strings.Repeat("x", 500) + `"}`
	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", oversize, true)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
}

// Strict mode rejects with 422 and stores nothing.
func TestStrictSchemaRejectsInvalidPayload(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	put := request(t, srv, http.MethodPut,
		"/v1/drops/greenhouse/schemas/events?mode=strict", readingSchema, true)
	if put.Code != http.StatusCreated {
		t.Fatalf("PUT schema status = %d, want %d (body %s)", put.Code, http.StatusCreated, put.Body)
	}

	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events",
		`{"temperature":"warm"}`, true)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusUnprocessableEntity, rec.Body)
	}

	var problem Problem
	decodeBody(t, rec, &problem)
	if problem.Code != CodeValidationFailed {
		t.Fatalf("code = %q, want %q", problem.Code, CodeValidationFailed)
	}
	if len(problem.Errors) == 0 {
		t.Fatal("422 response carries no per-field errors")
	}

	// Nothing may have been stored.
	read := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", true)
	var query datadrop.QueryResult
	decodeBody(t, read, &query)
	if len(query.Events) != 0 {
		t.Fatalf("strict mode stored %d events, want 0", len(query.Events))
	}
}

// Permissive mode accepts, warns in the response, and persists the warning.
func TestPermissiveSchemaAcceptsWithWarnings(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	put := request(t, srv, http.MethodPut,
		"/v1/drops/greenhouse/schemas/events?mode=permissive", readingSchema, true)
	if put.Code != http.StatusCreated {
		t.Fatalf("PUT schema status = %d, want %d", put.Code, http.StatusCreated)
	}

	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events",
		`{"temperature":"warm"}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body)
	}

	var result datadrop.AppendResult
	decodeBody(t, rec, &result)
	if len(result.Warnings) == 0 {
		t.Fatal("permissive acceptance returned no warnings")
	}

	// The warnings must survive in storage, not just in the response.
	read := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", true)
	var query datadrop.QueryResult
	decodeBody(t, read, &query)
	if len(query.Events) != 1 {
		t.Fatalf("stored %d events, want 1", len(query.Events))
	}

	var meta datadrop.EventMeta
	if err := json.Unmarshal(query.Events[0].Meta, &meta); err != nil {
		t.Fatalf("decode stored meta %s: %v", query.Events[0].Meta, err)
	}
	if len(meta.Warnings) == 0 {
		t.Fatalf("stored meta carries no warnings: %s", query.Events[0].Meta)
	}
}

func TestPutSchemaRejectsMalformedDocument(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := request(t, srv, http.MethodPut,
		"/v1/drops/greenhouse/schemas/events", `{"type": 42}`, true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var problem Problem
	decodeBody(t, rec, &problem)
	if problem.Code != CodeSchemaInvalid {
		t.Fatalf("code = %q, want %q", problem.Code, CodeSchemaInvalid)
	}
}

func TestGetSchemaPreservesExtensionKeywords(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	if rec := request(t, srv, http.MethodPut,
		"/v1/drops/greenhouse/schemas/events", readingSchema, true); rec.Code != http.StatusCreated {
		t.Fatalf("PUT schema status = %d", rec.Code)
	}

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/schemas/events", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !strings.Contains(rec.Body.String(), "x-drop-semantic") {
		t.Fatalf("the round trip lost the extension keyword: %s", rec.Body)
	}
}

func TestQueryEventsParameters(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	for i := 0; i < 5; i++ {
		if rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events",
			`{"n":1}`, true); rec.Code != http.StatusCreated {
			t.Fatalf("append %d: status %d", i, rec.Code)
		}
	}

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/events?limit=2&order=desc", "", true)
	var result datadrop.QueryResult
	decodeBody(t, rec, &result)

	if result.Count != 2 {
		t.Fatalf("count = %d, want 2", result.Count)
	}
	if result.Events[0].Seq != 5 {
		t.Fatalf("first event seq = %d, want 5 (descending)", result.Events[0].Seq)
	}
	if result.NextAfter != 4 {
		t.Fatalf("next_after = %d, want 4", result.NextAfter)
	}
}

func TestQueryEventsRejectsBadParameters(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	for _, target := range []string{
		"/v1/drops/greenhouse/events?limit=abc",
		"/v1/drops/greenhouse/events?after=xyz",
		"/v1/drops/greenhouse/events?order=sideways",
		"/v1/drops/greenhouse/events?time_field=whenever",
		"/v1/drops/greenhouse/events?from=not-a-time",
	} {
		if rec := request(t, srv, http.MethodGet, target, "", true); rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want %d", target, rec.Code, http.StatusBadRequest)
		}
	}
}

// A drop marked public_read is readable without a token; writes still are not.
func TestPublicReadDrop(t *testing.T) {
	srv := newTestServer(t)

	if rec := request(t, srv, http.MethodPost, "/v1/drops",
		`{"name":"public","public_read":true}`, true); rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d", rec.Code)
	}
	if rec := request(t, srv, http.MethodPost, "/v1/drops/public/events",
		`{"n":1}`, true); rec.Code != http.StatusCreated {
		t.Fatalf("append status = %d", rec.Code)
	}

	if rec := request(t, srv, http.MethodGet, "/v1/drops/public/events", "", false); rec.Code != http.StatusOK {
		t.Fatalf("unauthenticated read of a public drop: status %d, want %d", rec.Code, http.StatusOK)
	}
	if rec := request(t, srv, http.MethodPost, "/v1/drops/public/events",
		`{"n":2}`, false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated write to a public drop: status %d, want %d",
			rec.Code, http.StatusUnauthorized)
	}
}

func TestPrivateDropRequiresTokenToRead(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	if rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/events", "", false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestExportNDJSON(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	for i := 0; i < 3; i++ {
		request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", `{"n":1}`, true)
	}

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/export?format=ndjson", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	lines := strings.Split(strings.TrimSpace(rec.Body.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("got %d NDJSON lines, want 3", len(lines))
	}
	for i, line := range lines {
		var e datadrop.Envelope
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			t.Fatalf("line %d is not valid JSON: %v", i, err)
		}
		if e.Seq != int64(i+1) {
			t.Fatalf("line %d has seq %d; export must be chronological", i, e.Seq)
		}
	}
}

func TestExportJSON(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events", `{"n":1}`, true)

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/export?format=json", "", true)

	var doc struct {
		Events []datadrop.Envelope `json:"events"`
	}
	decodeBody(t, rec, &doc)
	if len(doc.Events) != 1 {
		t.Fatalf("exported %d events, want 1", len(doc.Events))
	}
}

// The flattening rules are the interoperability contract: two implementations
// that disagree here produce silently different spreadsheets.
func TestExportCSVFlattening(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	// Heterogeneous payloads: different keys, a nested object, an array, and
	// an explicit null.
	for _, payload := range []string{
		`{"temperature":21.7}`,
		`{"humidity":0.48,"location":{"lat":52.5,"lon":13.4}}`,
		`{"tags":["a","b"],"note":null}`,
	} {
		if rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/events",
			payload, true); rec.Code != http.StatusCreated {
			t.Fatalf("append %s: status %d", payload, rec.Code)
		}
	}

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/export?format=csv", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	records, err := csv.NewReader(strings.NewReader(rec.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("parse CSV: %v", err)
	}
	if len(records) != 4 {
		t.Fatalf("got %d CSV rows (incl. header), want 4", len(records))
	}

	header := records[0]
	index := map[string]int{}
	for i, name := range header {
		index[name] = i
	}

	// Fixed envelope columns come first, in order.
	for i, want := range tabular.EnvelopeColumns {
		if header[i] != want {
			t.Fatalf("column %d = %q, want %q", i, header[i], want)
		}
	}

	// Payload columns: the union of every key, dotted for nesting.
	for _, want := range []string{
		"data.temperature", "data.humidity",
		"data.location.lat", "data.location.lon",
		"data.tags", "data.note",
	} {
		if _, ok := index[want]; !ok {
			t.Fatalf("missing column %q; header is %v", want, header)
		}
	}

	// Payload columns are sorted among themselves.
	payloadColumns := header[len(tabular.EnvelopeColumns):]
	for i := 1; i < len(payloadColumns); i++ {
		if payloadColumns[i-1] > payloadColumns[i] {
			t.Fatalf("payload columns are not sorted: %v", payloadColumns)
		}
	}

	// A missing value is an empty cell, not "null".
	if cell := records[1][index["data.humidity"]]; cell != "" {
		t.Fatalf("absent value rendered as %q, want an empty cell", cell)
	}
	// An explicit JSON null is also an empty cell.
	if cell := records[3][index["data.note"]]; cell != "" {
		t.Fatalf("JSON null rendered as %q, want an empty cell", cell)
	}
	// An array becomes compact JSON in the cell.
	if cell := records[3][index["data.tags"]]; cell != `["a","b"]` {
		t.Fatalf("array rendered as %q, want compact JSON", cell)
	}
	// A nested value lands under its dotted path.
	if cell := records[2][index["data.location.lat"]]; cell != "52.5" {
		t.Fatalf("nested value rendered as %q, want %q", cell, "52.5")
	}
}

func TestExportRejectsUnknownFormat(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/export?format=parquet", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestRequestIDHeaderIsSet(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodGet, "/healthz", "", false)
	if rec.Header().Get("X-Request-Id") == "" {
		t.Fatal("response is missing an X-Request-Id header")
	}
}

func TestDecodeIngestDiscriminatesShapes(t *testing.T) {
	cases := []struct {
		name        string
		body        string
		contentType string
		mode        string
		wantData    string
	}{
		{
			name:     "bare payload is simple mode",
			body:     `{"temperature":21.7}`,
			wantData: `{"temperature":21.7}`,
		},
		{
			name:     "specversion implies envelope mode",
			body:     `{"specversion":"1.0","data":{"temperature":21.7}}`,
			wantData: `{"temperature":21.7}`,
		},
		{
			name:        "content type implies envelope mode",
			body:        `{"data":{"temperature":21.7}}`,
			contentType: cloudEventsContentType,
			wantData:    `{"temperature":21.7}`,
		},
		{
			// The escape hatch: a payload that legitimately has a
			// "specversion" field must be storable as data.
			name:     "mode=simple overrides the heuristic",
			body:     `{"specversion":"not-cloudevents","data":"mine"}`,
			mode:     "simple",
			wantData: `{"specversion":"not-cloudevents","data":"mine"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			envelope, err := decodeIngest([]byte(tc.body), tc.contentType, tc.mode)
			if err != nil {
				t.Fatalf("decodeIngest: %v", err)
			}
			if string(envelope.Data) != tc.wantData {
				t.Fatalf("data = %s, want %s", envelope.Data, tc.wantData)
			}
		})
	}
}

func TestDecodeIngestRejectsBadInput(t *testing.T) {
	for name, tc := range map[string]struct{ body, mode string }{
		"empty":            {"", ""},
		"invalid JSON":     {`{"broken":`, ""},
		"envelope no data": {`{"specversion":"1.0"}`, ""},
		"bad mode":         {`{"a":1}`, "sideways"},
		"bad envelope time": {
			`{"specversion":"1.0","time":"yesterday","data":{}}`, "",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeIngest([]byte(tc.body), "", tc.mode); err == nil {
				t.Fatal("decodeIngest accepted invalid input")
			}
		})
	}
}
