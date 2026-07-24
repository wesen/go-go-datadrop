package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// The acceptance test for the visualization layer: a real binary serving a real
// UI bundle, with both source kinds projected into typed tables.
//
// What it is actually protecting is the claim the whole ticket rests on — that
// the browser is told the column types rather than guessing them, and that the
// CSV export and the table agree about what the columns are.

type tableResponse struct {
	Source struct {
		Kind    string `json:"kind"`
		Drop    string `json:"drop"`
		Stream  string `json:"stream"`
		Dataset string `json:"dataset"`
		Version int    `json:"version"`
		Path    string `json:"path"`
	} `json:"source"`
	Fields []struct {
		Name         string `json:"name"`
		Type         string `json:"type"`
		InferredFrom string `json:"inferred_from"`
	} `json:"fields"`
	Rows      []map[string]any `json:"rows"`
	RowCount  int              `json:"row_count"`
	Truncated bool             `json:"truncated"`
	Strategy  string           `json:"strategy"`
	NextAfter int64            `json:"next_after"`
}

func (r tableResponse) field(name string) (string, string, bool) {
	for _, f := range r.Fields {
		if f.Name == name {
			return f.Type, f.InferredFrom, true
		}
	}
	return "", "", false
}

func TestTableAndUIEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	dir := t.TempDir()
	const token = "table-smoke-token"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server := exec.CommandContext(ctx, binary, "serve",
		"--addr", "127.0.0.1:"+port,
		"--db", filepath.Join(dir, "datadrop.db"),
		"--token", token,
		"--log-level", "warn")

	var serverLog bytes.Buffer
	server.Stdout = &serverLog
	server.Stderr = &serverLog
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		cancel()
		_ = server.Wait()
		if t.Failed() {
			t.Logf("server log:\n%s", serverLog.String())
		}
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{
		t:      t,
		binary: binary,
		env:    []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token},
	}

	// --- the UI is served, and does not shadow the API ---------------------

	if status, body := httpGet(t, base+"/ui/", ""); status != http.StatusOK ||
		!strings.Contains(body, "<div id=\"root\">") {
		t.Fatalf("GET /ui/ = %d, body %q", status, truncate(body))
	}
	if status, _ := httpGet(t, base+"/v1/drop", token); status != http.StatusNotFound {
		t.Fatalf("a mistyped API path returned %d, want 404 — the SPA is shadowing the API", status)
	}

	// --- a stream becomes a typed table ------------------------------------

	dd.mustRun("create", "lab")
	for i := 0; i < 5; i++ {
		dd.withStdin(`{"temp_c":`+strconv.Itoa(20+i)+`.5,"station":"north","ok":true}`).
			mustRun("push", "lab", "--stdin", "--stream", "temps")
	}

	status, body := httpGet(t, base+"/v1/drops/lab/streams", token)
	if status != http.StatusOK || !strings.Contains(body, `"stream":"temps"`) {
		t.Fatalf("GET /streams = %d, body %q", status, truncate(body))
	}

	streamTable := getTable(t, base+"/v1/drops/lab/table?stream=temps", token)
	if streamTable.RowCount != 5 {
		t.Fatalf("stream table has %d rows, want 5", streamTable.RowCount)
	}
	if streamTable.Strategy != "latest" || streamTable.Truncated {
		t.Fatalf("strategy %q, truncated %v; want latest and false",
			streamTable.Strategy, streamTable.Truncated)
	}
	if streamTable.NextAfter != 5 {
		t.Fatalf("next_after = %d, want 5", streamTable.NextAfter)
	}

	for name, want := range map[string][2]string{
		"seq":          {"q", "envelope"},
		"time":         {"t", "envelope"},
		"data.temp_c":  {"q", "values"},
		"data.station": {"n", "values"},
	} {
		gotType, gotFrom, ok := streamTable.field(name)
		if !ok {
			t.Fatalf("field %q missing from the stream table", name)
		}
		if gotType != want[0] || gotFrom != want[1] {
			t.Errorf("%s = (%s, %s), want (%s, %s)", name, gotType, gotFrom, want[0], want[1])
		}
	}

	// --- a dataset becomes a typed table, and the schema wins ---------------
	//
	// station_id holds zero-padded identifiers. A sniffer calls them numbers and
	// destroys the padding; the schema says string, and both the type and the
	// text must survive.

	writeFile(t, filepath.Join(dir, "rows.csv"),
		"station_id,population\n001,1200\n002,4300\n003,900\n")
	writeFile(t, filepath.Join(dir, "schema.json"), `{
		"type": "object",
		"properties": {
			"station_id": {"type": "string"},
			"population": {"type": "integer"}
		}
	}`)

	dd.mustRun("dataset", "push", "lab", "census",
		"--file", filepath.Join(dir, "rows.csv")+":rows.csv",
		"--schema", filepath.Join(dir, "schema.json"))

	datasetTable := getTable(t,
		base+"/v1/drops/lab/datasets/census/versions/latest/table?path=rows.csv", token)

	if datasetTable.RowCount != 3 {
		t.Fatalf("dataset table has %d rows, want 3", datasetTable.RowCount)
	}
	if gotType, gotFrom, _ := datasetTable.field("station_id"); gotType != "n" || gotFrom != "schema" {
		t.Fatalf("station_id = (%s, %s), want (n, schema)", gotType, gotFrom)
	}
	if got := datasetTable.Rows[0]["station_id"]; got != "001" {
		t.Fatalf("station_id = %v (%T), want the string \"001\" — the padding was lost", got, got)
	}
	// The CSV author's column order survives.
	if datasetTable.Fields[0].Name != "station_id" || datasetTable.Fields[1].Name != "population" {
		t.Fatalf("column order = %q, %q", datasetTable.Fields[0].Name, datasetTable.Fields[1].Name)
	}

	// --- the export and the table name the same columns --------------------

	_, exportBody := httpGet(t, base+"/v1/drops/lab/export?format=csv&stream=temps", token)
	header := strings.Split(strings.SplitN(exportBody, "\n", 2)[0], ",")
	if len(header) != len(streamTable.Fields) {
		t.Fatalf("export has %d columns, table has %d fields\nexport: %v",
			len(header), len(streamTable.Fields), header)
	}
	for i := range header {
		if header[i] != streamTable.Fields[i].Name {
			t.Fatalf("column %d: export %q, table %q", i, header[i], streamTable.Fields[i].Name)
		}
	}

	// --- reads still need a credential -------------------------------------

	if status, _ := httpGet(t, base+"/v1/drops/lab/table?stream=temps", ""); status != http.StatusUnauthorized {
		t.Fatalf("an unauthenticated table read returned %d, want 401", status)
	}
}

func httpGet(t *testing.T, url, token string) (int, string) {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read %s: %v", url, err)
	}
	return resp.StatusCode, string(body)
}

func getTable(t *testing.T, url, token string) tableResponse {
	t.Helper()

	status, body := httpGet(t, url, token)
	if status != http.StatusOK {
		t.Fatalf("GET %s = %d, body %q", url, status, truncate(body))
	}

	var table tableResponse
	if err := json.Unmarshal([]byte(body), &table); err != nil {
		t.Fatalf("decode table %q: %v", truncate(body), err)
	}
	return table
}

func truncate(s string) string {
	if len(s) <= 400 {
		return s
	}
	return s[:400] + "…"
}
