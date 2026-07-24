package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This is the acceptance test for the dataset layer: publish, republish with
// one file changed, retrieve with verification, and materialize into a stream —
// against a real binary, a real socket, a real SQLite file, and real bytes on
// disk.

// datasetFixture writes a CSV large enough that deduplication is measurable.
func datasetFixture(t *testing.T, dir string) (string, string) {
	t.Helper()

	var builder strings.Builder
	builder.WriteString("observed_at,temperature_c,humidity\n")
	for i := 0; i < 5000; i++ {
		builder.WriteString("2026-07-01T00:00:00Z,21.7,0.48\n")
	}

	csvPath := filepath.Join(dir, "readings.csv")
	if err := os.WriteFile(csvPath, []byte(builder.String()), 0o600); err != nil {
		t.Fatalf("write CSV: %v", err)
	}

	readmePath := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readmePath, []byte("# Greenhouse readings\n"), 0o600); err != nil {
		t.Fatalf("write README: %v", err)
	}
	return csvPath, readmePath
}

// countFiles counts regular files beneath dir.
func countFiles(t *testing.T, dir string) int {
	t.Helper()

	count := 0
	err := filepath.WalkDir(dir, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if !entry.IsDir() {
			count++
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", dir, err)
	}
	return count
}

func TestDatasetEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	workDir := t.TempDir()
	dbPath := filepath.Join(workDir, "datadrop.db")
	blobDir := filepath.Join(workDir, "blobs")
	const token = "smoke-token"

	server := exec.Command(binary, "serve",
		"--addr", "127.0.0.1:"+port, "--db", dbPath, "--blobs", blobDir, "--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		_ = server.Process.Kill()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}

	csvPath, readmePath := datasetFixture(t, workDir)
	csvInfo, err := os.Stat(csvPath)
	if err != nil {
		t.Fatalf("stat CSV: %v", err)
	}

	dd.mustRun("create", "greenhouse")

	// --- publish v1 --------------------------------------------------------
	stdout, stderr := dd.mustRun("dataset", "push", "greenhouse", "readings-2026",
		"--file", csvPath+":data/readings.csv",
		"--file", readmePath+":README.md",
		"--title", "Greenhouse readings, 2026 season",
		"--license", "CC-BY-4.0")

	if !strings.Contains(stderr, "uploaded 2 file(s)") {
		t.Fatalf("first push should upload both files; stderr: %s", stderr)
	}

	var version map[string]any
	if err := json.Unmarshal([]byte(stdout), &version); err != nil {
		t.Fatalf("decode push output %q: %v", stdout, err)
	}
	if version["state"] != "committed" {
		t.Fatalf("state = %v, want committed", version["state"])
	}

	blobsAfterFirst := countFiles(t, blobDir)
	if blobsAfterFirst != 2 {
		t.Fatalf("%d blobs after the first push, want 2", blobsAfterFirst)
	}

	// --- republish with only the README changed ----------------------------
	if err := os.WriteFile(readmePath,
		[]byte("# Greenhouse readings\n\nRecalibrated 2026-06-01.\n"), 0o600); err != nil {
		t.Fatalf("rewrite README: %v", err)
	}

	_, stderr = dd.mustRun("dataset", "push", "greenhouse", "readings-2026",
		"--file", csvPath+":data/readings.csv",
		"--file", readmePath+":README.md")

	// This is the whole argument for the staged protocol: the unchanged CSV is
	// recorded without being transferred.
	if !strings.Contains(stderr, "uploaded 1 file(s)") {
		t.Fatalf("the republish should upload only the changed file; stderr: %s", stderr)
	}
	if !strings.Contains(stderr, "reused 1 already-stored file(s)") {
		t.Fatalf("the republish should reuse the unchanged file; stderr: %s", stderr)
	}

	if blobs := countFiles(t, blobDir); blobs != 3 {
		t.Fatalf("%d blobs after the republish, want 3 (the CSV is shared)", blobs)
	}

	// --- retrieve and verify ----------------------------------------------
	outDir := filepath.Join(workDir, "downloaded")
	dd.mustRun("dataset", "get", "greenhouse", "readings-2026", "--output", outDir)

	downloadedCSV := filepath.Join(outDir, "data", "readings.csv")
	original, err := os.ReadFile(csvPath)
	if err != nil {
		t.Fatalf("read original: %v", err)
	}
	retrieved, err := os.ReadFile(downloadedCSV)
	if err != nil {
		t.Fatalf("read downloaded: %v", err)
	}
	if string(original) != string(retrieved) {
		t.Fatal("the retrieved file does not match what was published")
	}
	if int64(len(retrieved)) != csvInfo.Size() {
		t.Fatalf("retrieved %d bytes, want %d", len(retrieved), csvInfo.Size())
	}

	// --- the digest check must actually fire -------------------------------
	sum := sha256.Sum256(original)
	digest := "sha256:" + hex.EncodeToString(sum[:])

	blobPath := filepath.Join(blobDir, "sha256", digest[7:9], digest[9:11], digest[7:])
	corrupt, err := os.OpenFile(blobPath, os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatalf("open blob for corruption: %v", err)
	}
	if _, err := corrupt.WriteAt([]byte("CORRUPTED"), 100); err != nil {
		t.Fatalf("corrupt blob: %v", err)
	}
	_ = corrupt.Close()

	corruptDir := filepath.Join(workDir, "corrupt")
	_, stderr, code := dd.run("dataset", "get", "greenhouse", "readings-2026", "--output", corruptDir)
	if code == 0 {
		t.Fatal("a corrupted download exited 0; the integrity check did not fire")
	}
	if !strings.Contains(stderr, "integrity check failed") {
		t.Fatalf("expected an integrity failure; stderr: %s", stderr)
	}
}

func TestDatasetImportEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	workDir := t.TempDir()
	const token = "smoke-token"

	server := exec.Command(binary, "serve",
		"--addr", "127.0.0.1:"+port,
		"--db", filepath.Join(workDir, "datadrop.db"),
		"--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		_ = server.Process.Kill()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}

	csvPath := filepath.Join(workDir, "readings.csv")
	if err := os.WriteFile(csvPath,
		[]byte("observed_at,temperature_c\n2026-07-01T00:00:00Z,21.7\n2026-07-01T00:00:30Z,22.1\n"),
		0o600); err != nil {
		t.Fatalf("write CSV: %v", err)
	}

	dd.mustRun("create", "greenhouse")
	dd.mustRun("dataset", "push", "greenhouse", "readings", "--file", csvPath+":readings.csv")

	// --- materialize -------------------------------------------------------
	stdout, _ := dd.mustRun("dataset", "import", "greenhouse", "readings", "--path", "readings.csv")

	var result map[string]any
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode import output %q: %v", stdout, err)
	}
	if result["appended"] != float64(2) {
		t.Fatalf("appended = %v, want 2", result["appended"])
	}

	// The events carry provenance back to the exact bytes and row.
	stdout, _ = dd.mustRun("query", "greenhouse", "--order", "asc", "--output", "json")

	var events []map[string]any
	if err := json.Unmarshal([]byte(stdout), &events); err != nil {
		t.Fatalf("decode query output: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("stream holds %d events, want 2", len(events))
	}

	meta, ok := events[0]["meta"].(map[string]any)
	if !ok {
		t.Fatalf("event has no meta object: %+v", events[0])
	}
	for key, want := range map[string]any{
		"dataset": "readings", "dataset_version": float64(1),
		"dataset_path": "readings.csv", "row": float64(1),
	} {
		if meta[key] != want {
			t.Errorf("meta[%q] = %v, want %v", key, meta[key], want)
		}
	}

	// A numeric CSV column must arrive typed, or a schema could never match it.
	data, ok := events[0]["data"].(map[string]any)
	if !ok {
		t.Fatalf("event has no data object: %+v", events[0])
	}
	if _, isNumber := data["temperature_c"].(float64); !isNumber {
		t.Fatalf("temperature_c is %T, want a number", data["temperature_c"])
	}

	// --- re-import must resume, not duplicate ------------------------------
	stdout, _ = dd.mustRun("dataset", "import", "greenhouse", "readings", "--path", "readings.csv")
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode second import: %v", err)
	}
	if result["appended"] != float64(0) || result["skipped"] != float64(2) {
		t.Fatalf("second import: appended=%v skipped=%v, want 0 and 2",
			result["appended"], result["skipped"])
	}

	stdout, _ = dd.mustRun("query", "greenhouse", "--output", "json")
	if err := json.Unmarshal([]byte(stdout), &events); err != nil {
		t.Fatalf("decode query: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("stream holds %d events after two imports, want 2", len(events))
	}
}

// Deleting a version leaves its bytes until a sweep reclaims them, and the
// sweep must not touch bytes another version still shares.
func TestDatasetGCEndToEnd(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	workDir := t.TempDir()
	blobDir := filepath.Join(workDir, "blobs")
	const token = "smoke-token"

	server := exec.Command(binary, "serve",
		"--addr", "127.0.0.1:"+port,
		"--db", filepath.Join(workDir, "datadrop.db"),
		"--blobs", blobDir, "--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		_ = server.Process.Kill()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}

	unique := filepath.Join(workDir, "unique.csv")
	if err := os.WriteFile(unique, []byte("a,b\n1,2\n"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	dd.mustRun("create", "greenhouse")
	dd.mustRun("dataset", "push", "greenhouse", "readings", "--file", unique+":data.csv")

	if blobs := countFiles(t, blobDir); blobs != 1 {
		t.Fatalf("%d blobs after publishing, want 1", blobs)
	}

	dd.mustRun("dataset", "rm", "greenhouse", "readings", "--version", "1")

	// The bytes survive deletion; only a sweep reclaims them.
	if blobs := countFiles(t, blobDir); blobs != 1 {
		t.Fatalf("%d blobs after deleting the version, want 1 (deletion does not sweep)", blobs)
	}

	// A sweep with a one-second floor, after waiting past it.
	time.Sleep(1100 * time.Millisecond)
	stdout, _ := dd.mustRun("dataset", "gc", "--min-age-seconds", "1")

	var result map[string]any
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode gc output %q: %v", stdout, err)
	}
	if result["deleted"] != float64(1) {
		t.Fatalf("deleted = %v, want 1", result["deleted"])
	}
	if blobs := countFiles(t, blobDir); blobs != 0 {
		t.Fatalf("%d blobs after the sweep, want 0", blobs)
	}
}
