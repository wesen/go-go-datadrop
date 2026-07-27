package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This is the acceptance test for v0.1: the README quick start, executed
// against a real binary, a real socket, and a real SQLite file.
//
// It shells out to a compiled binary rather than calling cli.Execute in-process
// so that it also covers argument parsing, exit codes, and the stdout/stderr
// split — the parts of the CLI contract that an in-process test cannot see.

// buildBinary compiles the CLI once for the whole test.
func buildBinary(t *testing.T) string {
	t.Helper()

	binary := filepath.Join(t.TempDir(), "datadrop")

	build := exec.Command("go", "build", "-o", binary, ".")
	build.Env = append(build.Environ(), "GOWORK=off")

	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build: %v\n%s", err, output)
	}
	return binary
}

// freePort asks the kernel for an unused port, so parallel runs cannot collide.
func freePort(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve a port: %v", err)
	}
	defer func() { _ = listener.Close() }()

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}
	return port
}

// cli runs a client subcommand and returns stdout, stderr, and the exit code.
type cliRunner struct {
	t      *testing.T
	binary string
	env    []string
	stdin  string
}

func (r cliRunner) withStdin(input string) cliRunner {
	r.stdin = input
	return r
}

func (r cliRunner) run(args ...string) (string, string, int) {
	r.t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, r.binary, args...)
	cmd.Env = append(cmd.Environ(), r.env...)
	if r.stdin != "" {
		cmd.Stdin = strings.NewReader(r.stdin)
	}

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err := cmd.Run()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return outBuf.String(), errBuf.String(), exitErr.ExitCode()
		}
		r.t.Fatalf("run %v: %v\nstderr: %s", args, err, errBuf.String())
	}
	return outBuf.String(), errBuf.String(), 0
}

// mustRun fails the test unless the command exits 0.
func (r cliRunner) mustRun(args ...string) (string, string) {
	r.t.Helper()

	stdout, stderr, code := r.run(args...)
	if code != 0 {
		r.t.Fatalf("%v exited %d\nstdout: %s\nstderr: %s", args, code, stdout, stderr)
	}
	return stdout, stderr
}

func TestQuickStartEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	dbPath := filepath.Join(t.TempDir(), "datadrop.db")
	const token = "smoke-token"

	// Start the server.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server := exec.CommandContext(ctx, binary, "serve",
		"--addr", "127.0.0.1:"+port,
		"--db", dbPath,
		"--token", token,
		"--log-level", "debug")

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
		env: []string{
			"DATADROP_ADDR=" + base,
			"DATADROP_TOKEN=" + token,
		},
	}

	// --- create ------------------------------------------------------------
	stdout, _ := dd.mustRun("create", "greenhouse", "--output", "json")
	if created := decodeOneRow(t, "create", stdout); created["name"] != "greenhouse" {
		t.Fatalf("create output does not name the drop: %s", stdout)
	}

	// --- push, three ways --------------------------------------------------
	dd.mustRun("push", "greenhouse", "temperature=21.7", "humidity=0.48")
	dd.withStdin(`{"temperature":22.8}`).mustRun("push", "greenhouse", "--stdin")
	dd.withStdin("{\"temperature\":23.1}\n{\"temperature\":23.5}\n").
		mustRun("push", "greenhouse", "--stdin", "--ndjson")

	// --- query -------------------------------------------------------------
	stdout, _ = dd.mustRun("query", "greenhouse", "--limit", "10", "--output", "json")

	var events []map[string]any
	if err := json.Unmarshal([]byte(stdout), &events); err != nil {
		t.Fatalf("decode query output %q: %v", stdout, err)
	}
	if len(events) != 4 {
		t.Fatalf("query returned %d events, want 4", len(events))
	}

	// key=value values must be typed, not stringified.
	//
	// The payload is flattened into data.* columns rather than nested, because
	// the CLI projects events through pkg/tabular — the same projection the
	// /table endpoint and the web workbench use, so `--fields data.temperature`
	// and a workbench field chip name one column (DR-83).
	oldest := events[len(events)-1]
	if _, isNumber := oldest["data.temperature"].(float64); !isNumber {
		t.Fatalf("temperature was stored as %T, want a number: %+v",
			oldest["data.temperature"], oldest)
	}

	// --- tail (non-following) ---------------------------------------------
	//
	// The header is lower-case `seq`, because that is what `--fields seq` takes
	// and what `--output json` emits; a table that shouts SEQ while every other
	// surface says seq would be a third spelling of one thing.
	stdout, _ = dd.mustRun("tail", "greenhouse", "--limit", "2")
	if !strings.Contains(stdout, "seq") {
		t.Fatalf("tail did not print a table header: %s", stdout)
	}

	// --- export ------------------------------------------------------------
	stdout, _ = dd.mustRun("export", "greenhouse", "--format", "csv")
	records, err := csv.NewReader(strings.NewReader(stdout)).ReadAll()
	if err != nil {
		t.Fatalf("parse exported CSV: %v\n%s", err, stdout)
	}
	if len(records) != 5 { // header + 4 events
		t.Fatalf("CSV has %d rows including the header, want 5", len(records))
	}
	if records[0][0] != "id" {
		t.Fatalf("first CSV column is %q, want %q", records[0][0], "id")
	}

	stdout, _ = dd.mustRun("export", "greenhouse", "--format", "ndjson")
	if lines := strings.Count(strings.TrimSpace(stdout), "\n") + 1; lines != 4 {
		t.Fatalf("NDJSON export has %d lines, want 4", lines)
	}

	// --- inspect / list ----------------------------------------------------
	//
	// inspect returns one row, so --output json is an array of one rather than
	// a bare object — which is the point of the conversion: --output json means
	// the same thing on every verb, and a script no longer has to know which
	// one it called.
	stdout, _ = dd.mustRun("inspect", "greenhouse", "--output", "json")
	if inspected := decodeOneRow(t, "inspect", stdout); inspected["event_count"] != float64(4) {
		t.Fatalf("inspect reports event_count = %v, want 4", inspected["event_count"])
	}

	stdout, _ = dd.mustRun("list")
	if !strings.Contains(stdout, "greenhouse") {
		t.Fatalf("list does not include the drop: %s", stdout)
	}
}

// The documented exit codes are part of the CLI contract, because scripts
// branch on them instead of parsing stderr.
func TestExitCodes(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	dbPath := filepath.Join(t.TempDir(), "datadrop.db")
	const token = "smoke-token"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server := exec.CommandContext(ctx, binary, "serve",
		"--addr", "127.0.0.1:"+port, "--db", dbPath, "--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		cancel()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	authorized := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}
	unauthorized := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=wrong-token"}}

	authorized.mustRun("create", "greenhouse")

	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	writeFile(t, schemaPath, `{
		"type": "object",
		"required": ["temperature"],
		"properties": { "temperature": { "type": "number" } }
	}`)
	authorized.mustRun("schema", "put", "greenhouse", "--file", schemaPath, "--mode", "strict")

	cases := []struct {
		name string
		run  func() (string, string, int)
		want int
	}{
		{
			name: "bad credentials exit 3",
			run:  func() (string, string, int) { return unauthorized.run("query", "greenhouse") },
			want: 3,
		},
		{
			name: "unknown drop exits 4",
			run:  func() (string, string, int) { return authorized.run("query", "nosuchdrop") },
			want: 4,
		},
		{
			name: "strict schema rejection exits 5",
			run: func() (string, string, int) {
				return authorized.run("push", "greenhouse", "temperature=warm")
			},
			want: 5,
		},
		{
			name: "valid push exits 0",
			run: func() (string, string, int) {
				return authorized.run("push", "greenhouse", "temperature=21.7")
			},
			want: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stdout, stderr, code := tc.run()
			if code != tc.want {
				t.Fatalf("exit code = %d, want %d\nstdout: %s\nstderr: %s",
					code, tc.want, stdout, stderr)
			}
		})
	}
}

// Diagnostics must go to stderr so that piping stdout stays machine-readable
// even at --log-level debug.
func TestDiagnosticsStayOffStdout(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	dbPath := filepath.Join(t.TempDir(), "datadrop.db")
	const token = "smoke-token"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server := exec.CommandContext(ctx, binary, "serve",
		"--addr", "127.0.0.1:"+port, "--db", dbPath, "--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		cancel()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}

	dd.mustRun("create", "greenhouse")
	dd.mustRun("push", "greenhouse", "n=1")

	// A retention warning is a diagnostic and must not pollute stdout.
	stdout, stderr := dd.mustRun("create", "kept", "--retention", "90d")
	if strings.Contains(stdout, "not enforced") {
		t.Fatalf("the retention notice leaked into stdout: %s", stdout)
	}
	if !strings.Contains(stderr, "not enforced") {
		t.Fatalf("the retention notice is missing from stderr: %s", stderr)
	}

	// stdout must be parseable JSON even with debug logging on.
	stdout, _ = dd.mustRun("query", "greenhouse", "--output", "json", "--log-level", "debug")
	var events []map[string]any
	if err := json.Unmarshal([]byte(stdout), &events); err != nil {
		t.Fatalf("stdout is not clean JSON at --log-level debug: %v\n%s", err, stdout)
	}
}

func waitForHealth(t *testing.T, base string) {
	t.Helper()

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", strings.TrimPrefix(base, "http://"), time.Second)
		if err == nil {
			_ = conn.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("server did not become reachable")
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
