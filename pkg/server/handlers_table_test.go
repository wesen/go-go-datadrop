package server

import (
	"encoding/csv"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/tabular"
)

// appendReading pushes one event onto a stream.
func appendReading(t *testing.T, srv *Server, drop, stream, body string) {
	t.Helper()

	target := "/v1/drops/" + drop + "/events"
	if stream != "" {
		target += "?stream=" + stream
	}
	rec := request(t, srv, http.MethodPost, target, body, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("append to %s: status %d, body %s", target, rec.Code, rec.Body)
	}
}

func TestListStreamsReportsHeadsAndCounts(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	appendReading(t, srv, "lab", "", `{"temperature":21.0}`)
	appendReading(t, srv, "lab", "temps", `{"temperature":21.5}`)
	appendReading(t, srv, "lab", "temps", `{"temperature":22.0}`)

	rec := request(t, srv, http.MethodGet, "/v1/drops/lab/streams", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var got struct {
		Drop    string                `json:"drop"`
		Count   int                   `json:"count"`
		Streams []datadrop.StreamInfo `json:"streams"`
	}
	decodeBody(t, rec, &got)

	if got.Count != 2 || len(got.Streams) != 2 {
		t.Fatalf("got %d streams, want 2: %+v", got.Count, got.Streams)
	}
	// Ordered by name: "events" before "temps".
	if got.Streams[0].Stream != "events" || got.Streams[1].Stream != "temps" {
		t.Fatalf("streams are not ordered by name: %+v", got.Streams)
	}
	if got.Streams[1].Sequence != 2 || got.Streams[1].EventCount != 2 {
		t.Fatalf("temps = seq %d / count %d, want 2 / 2",
			got.Streams[1].Sequence, got.Streams[1].EventCount)
	}
	if got.Streams[1].LastReceivedAt == nil {
		t.Fatal("temps has no last_received_at despite holding events")
	}
}

func TestListStreamsUnknownDrop(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodGet, "/v1/drops/nope/streams", "", true)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", rec.Code, rec.Body)
	}
}

func TestStreamTableTypesColumns(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	appendReading(t, srv, "lab", "temps", `{"temp_c":21.5,"station":"north","ok":true}`)
	appendReading(t, srv, "lab", "temps", `{"temp_c":22.0,"station":"south","ok":false}`)

	rec := request(t, srv, http.MethodGet, "/v1/drops/lab/table?stream=temps", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var table tabular.Table
	decodeBody(t, rec, &table)

	if table.Source.Kind != tabular.KindStream || table.Source.Stream != "temps" {
		t.Fatalf("source = %+v, want a temps stream reference", table.Source)
	}
	if table.RowCount != 2 {
		t.Fatalf("RowCount = %d, want 2", table.RowCount)
	}
	// order defaults to desc, which for a timeseries means "the recent past".
	if table.Strategy != tabular.StrategyLatest {
		t.Fatalf("Strategy = %q, want %q", table.Strategy, tabular.StrategyLatest)
	}
	if table.NextAfter != 2 {
		t.Fatalf("NextAfter = %d, want 2", table.NextAfter)
	}

	for name, want := range map[string]struct {
		fieldType tabular.FieldType
		from      tabular.TypeSource
	}{
		"seq":          {tabular.TypeQuantitative, tabular.SourceEnvelope},
		"time":         {tabular.TypeTemporal, tabular.SourceEnvelope},
		"data.temp_c":  {tabular.TypeQuantitative, tabular.SourceValues},
		"data.station": {tabular.TypeNominal, tabular.SourceValues},
		"data.ok":      {tabular.TypeNominal, tabular.SourceValues},
	} {
		field, ok := table.Field(name)
		if !ok {
			t.Fatalf("field %q is missing; fields are %+v", name, table.Fields)
		}
		if field.Type != want.fieldType || field.InferredFrom != want.from {
			t.Errorf("%s = (%s, %s), want (%s, %s)",
				name, field.Type, field.InferredFrom, want.fieldType, want.from)
		}
	}
}

// The table budget is larger than the envelope-page budget. Without LimitCap,
// EventQuery.Normalize clamps every chart back to datadrop.MaxLimit and nothing
// fails visibly.
func TestStreamTableHonoursALimitAboveTheEventPageCap(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	want := datadrop.MaxLimit + 5
	for i := 0; i < want; i++ {
		appendReading(t, srv, "lab", "temps", `{"n":`+strconv.Itoa(i)+`}`)
	}

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/lab/table?stream=temps&limit="+strconv.Itoa(want), "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var table tabular.Table
	decodeBody(t, rec, &table)

	if table.RowCount != want {
		t.Fatalf("RowCount = %d, want %d — the table limit was clamped to the "+
			"envelope-page cap", table.RowCount, want)
	}
	if table.Truncated {
		t.Fatal("Truncated is true for a query that returned every row")
	}
}

func TestStreamTableReportsTruncation(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	for i := 0; i < 5; i++ {
		appendReading(t, srv, "lab", "temps", `{"n":`+strconv.Itoa(i)+`}`)
	}

	rec := request(t, srv, http.MethodGet, "/v1/drops/lab/table?stream=temps&limit=3", "", true)
	var table tabular.Table
	decodeBody(t, rec, &table)

	if !table.Truncated {
		t.Fatal("Truncated is false for a page that filled its limit")
	}
	if table.RowCount != 3 {
		t.Fatalf("RowCount = %d, want 3", table.RowCount)
	}
}

func TestStreamTableRequiresAuth(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	rec := request(t, srv, http.MethodGet, "/v1/drops/lab/table", "", false)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (body %s)", rec.Code, rec.Body)
	}
}

func TestStreamTableIsReadableOnAPublicDrop(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/drops",
		`{"name":"open","public_read":true}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create drop: status %d, body %s", rec.Code, rec.Body)
	}
	appendReading(t, srv, "open", "", `{"n":1}`)

	rec = request(t, srv, http.MethodGet, "/v1/drops/open/table", "", false)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
	}
}

// The CSV export and the table projection must name the same columns in the
// same order. They share a flattener precisely so that this cannot drift, and
// this test is what says so out loud.
func TestExportAndTableAgreeOnColumns(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	appendReading(t, srv, "lab", "",
		`{"temperature":21.5,"location":{"lat":52.1,"lon":4.3},"tags":["a"]}`)
	appendReading(t, srv, "lab", "", `{"temperature":22.0,"note":"clear"}`)

	exportRec := request(t, srv, http.MethodGet, "/v1/drops/lab/export?format=csv", "", true)
	if exportRec.Code != http.StatusOK {
		t.Fatalf("export: status %d, body %s", exportRec.Code, exportRec.Body)
	}
	records, err := csv.NewReader(strings.NewReader(exportRec.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("parse export CSV: %v", err)
	}
	header := records[0]

	tableRec := request(t, srv, http.MethodGet, "/v1/drops/lab/table", "", true)
	var table tabular.Table
	decodeBody(t, tableRec, &table)

	if len(header) != len(table.Fields) {
		t.Fatalf("export has %d columns, table has %d fields\nexport: %v\ntable: %+v",
			len(header), len(table.Fields), header, table.Fields)
	}
	for i := range header {
		if header[i] != table.Fields[i].Name {
			t.Fatalf("column %d: export %q, table %q", i, header[i], table.Fields[i].Name)
		}
	}
}

func TestDatasetTableUsesTheVersionSchema(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	// A zero-padded identifier column. Sniffing calls it quantitative; the
	// schema says string, and the schema wins.
	body := "station_id,reading\n01,3\n02,4\n03,5\n"
	rec := request(t, srv, http.MethodPost, "/v1/drops/lab/datasets/census/versions", "", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("open draft: status %d, body %s", rec.Code, rec.Body)
	}
	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)

	base := "/v1/drops/lab/datasets/census/versions/" + strconv.Itoa(version.Version)
	if up := upload(t, srv, base+"/files/rows.csv", body, "text/csv", true); up.Code != http.StatusCreated {
		t.Fatalf("upload: status %d, body %s", up.Code, up.Body)
	}
	commit := request(t, srv, http.MethodPost, base+"/commit",
		`{"schema":{"type":"object","properties":{"station_id":{"type":"string"}}}}`, true)
	if commit.Code != http.StatusOK {
		t.Fatalf("commit: status %d, body %s", commit.Code, commit.Body)
	}

	rec = request(t, srv, http.MethodGet,
		"/v1/drops/lab/datasets/census/versions/latest/table?path=rows.csv", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var table tabular.Table
	decodeBody(t, rec, &table)

	if table.Source.Version != version.Version || table.Source.Path != "rows.csv" {
		t.Fatalf("source = %+v", table.Source)
	}
	if table.RowCount != 3 {
		t.Fatalf("RowCount = %d, want 3", table.RowCount)
	}

	station, ok := table.Field("station_id")
	if !ok {
		t.Fatalf("station_id is missing; fields are %+v", table.Fields)
	}
	if station.Type != tabular.TypeNominal || station.InferredFrom != tabular.SourceSchema {
		t.Fatalf("station_id = (%s, %s), want (n, schema)", station.Type, station.InferredFrom)
	}

	// The CSV author's column order survives the round trip.
	if table.Fields[0].Name != "station_id" || table.Fields[1].Name != "reading" {
		t.Fatalf("column order = %q, %q; want station_id, reading",
			table.Fields[0].Name, table.Fields[1].Name)
	}
}

// The traversal vector on this endpoint is the query parameter, not the URL
// path: http.ServeMux cleans the path before routing, and nothing normalizes a
// query string.
func TestDatasetTableRejectsTraversalInTheQueryParameter(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")
	publish(t, srv, "lab", "readings", "rows.csv", csvBody, "")

	for _, hostile := range []string{
		"../../etc/passwd",
		"/etc/passwd",
		"a/../../b",
		`windows\path`,
		"./rows.csv",
	} {
		target := "/v1/drops/lab/datasets/readings/versions/1/table?path=" +
			url.QueryEscape(hostile)
		rec := request(t, srv, http.MethodGet, target, "", true)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("path %q: status %d, want 400 (body %s)", hostile, rec.Code, rec.Body)
		}
	}
}

func TestDatasetTableRequiresAPath(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")
	publish(t, srv, "lab", "readings", "rows.csv", csvBody, "")

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/lab/datasets/readings/versions/1/table", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
	}
}

// A draft is not a readable version. Serving one produces silently wrong
// results, which is why every read path filters on committed.
func TestDatasetTableCannotSeeADraft(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	rec := request(t, srv, http.MethodPost, "/v1/drops/lab/datasets/wip/versions", "", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("open draft: status %d, body %s", rec.Code, rec.Body)
	}
	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)

	base := "/v1/drops/lab/datasets/wip/versions/" + strconv.Itoa(version.Version)
	if up := upload(t, srv, base+"/files/rows.csv", csvBody, "text/csv", true); up.Code != http.StatusCreated {
		t.Fatalf("upload: status %d, body %s", up.Code, up.Body)
	}

	rec = request(t, srv, http.MethodGet, base+"/table?path=rows.csv", "", true)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", rec.Code, rec.Body)
	}
}

func TestDatasetTableRejectsAnUnknownFormat(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")

	rec := request(t, srv, http.MethodPost, "/v1/drops/lab/datasets/misc/versions", "", true)
	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)

	base := "/v1/drops/lab/datasets/misc/versions/" + strconv.Itoa(version.Version)
	if up := upload(t, srv, base+"/files/notes.txt", "hello", "text/plain", true); up.Code != http.StatusCreated {
		t.Fatalf("upload: status %d, body %s", up.Code, up.Body)
	}
	if c := request(t, srv, http.MethodPost, base+"/commit", "", true); c.Code != http.StatusOK {
		t.Fatalf("commit: status %d, body %s", c.Code, c.Body)
	}

	rec = request(t, srv, http.MethodGet, base+"/table?path=notes.txt", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
	}
}

func TestTableLimitIsClampedNotRejected(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "lab")
	appendReading(t, srv, "lab", "", `{"n":1}`)

	rec := request(t, srv, http.MethodGet, "/v1/drops/lab/table?limit=999999999", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
	}

	rec = request(t, srv, http.MethodGet, "/v1/drops/lab/table?limit=abc", "", true)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("non-numeric limit: status = %d, want 400 (body %s)", rec.Code, rec.Body)
	}
}
