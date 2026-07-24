package server

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const csvBody = "temperature,humidity\n21.7,0.48\n22.1,0.47\n"

func sha256Of(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// upload performs a PUT with an arbitrary body and content type.
func upload(
	t *testing.T, srv *Server, target, body, contentType string, authorized bool,
) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodPut, target, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if authorized {
		req.Header.Set("Authorization", "Bearer "+testToken)
	}

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// mount performs the bodyless PUT that links an already-stored blob.
func mount(t *testing.T, srv *Server, target string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodPut, target, http.NoBody)
	req.Header.Set("Authorization", "Bearer "+testToken)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// publish opens a draft, uploads one file, and commits it.
func publish(t *testing.T, srv *Server, drop, dataset, path, body, manifest string) int {
	t.Helper()

	rec := request(t, srv, http.MethodPost,
		"/v1/drops/"+drop+"/datasets/"+dataset+"/versions", "", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("open draft: status %d, body %s", rec.Code, rec.Body)
	}

	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)

	base := "/v1/drops/" + drop + "/datasets/" + dataset + "/versions/" +
		strconv.Itoa(version.Version)

	if up := upload(t, srv, base+"/files/"+path, body, "text/csv", true); up.Code != http.StatusCreated {
		t.Fatalf("upload: status %d, body %s", up.Code, up.Body)
	}

	commitBody := ""
	if manifest != "" {
		commitBody = `{"manifest":` + manifest + `}`
	}
	if c := request(t, srv, http.MethodPost, base+"/commit", commitBody, true); c.Code != http.StatusOK {
		t.Fatalf("commit: status %d, body %s", c.Code, c.Body)
	}
	return version.Version
}

func TestDatasetLifecycle(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	version := publish(t, srv, "greenhouse", "readings", "data/readings.csv", csvBody,
		`{"title":"Greenhouse readings","license":"CC-BY-4.0","row_count":2}`)
	if version != 1 {
		t.Fatalf("first version = %d, want 1", version)
	}

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var got datadrop.DatasetVersion
	decodeBody(t, rec, &got)

	if got.State != datadrop.StateCommitted {
		t.Fatalf("State = %q, want committed", got.State)
	}
	if got.FileCount != 1 || got.TotalBytes != int64(len(csvBody)) {
		t.Fatalf("counters = %d files / %d bytes, want 1 / %d",
			got.FileCount, got.TotalBytes, len(csvBody))
	}
	if len(got.Files) != 1 || got.Files[0].Digest != sha256Of(csvBody) {
		t.Fatalf("files = %+v, want one with the body's digest", got.Files)
	}
	if !strings.Contains(string(got.Manifest), "CC-BY-4.0") {
		t.Fatalf("manifest lost its content: %s", got.Manifest)
	}
}

func TestUploadRequiresAuth(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	rec := upload(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv", csvBody, "text/csv", false)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// The server hashes; the client asserts. A mismatch is a corrupt transfer and
// must store nothing.
func TestUploadVerifiesAssertedDigest(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	wrong := sha256Of("entirely different content")
	rec := upload(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv?digest="+wrong,
		csvBody, "text/csv", true)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusBadRequest, rec.Body)
	}

	var problem Problem
	decodeBody(t, rec, &problem)
	if problem.Code != CodeDigestMismatch {
		t.Fatalf("code = %q, want %q", problem.Code, CodeDigestMismatch)
	}

	// Nothing may be stored under the asserted digest.
	head := headRequest(t, srv, "/v1/blobs/"+wrong, true)
	if head.Code != http.StatusNotFound {
		t.Fatalf("a rejected upload left bytes at the asserted digest: HTTP %d", head.Code)
	}
}

// The digest precheck plus the bodyless mount is what makes republishing a
// dataset with one changed file cheap.
func TestMountExistingBlobTransfersNothing(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	digest := sha256Of(csvBody)

	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	// The server now holds these bytes.
	if head := headRequest(t, srv, "/v1/blobs/"+digest, true); head.Code != http.StatusOK {
		t.Fatalf("HEAD blob after upload = %d, want 200", head.Code)
	}

	// Version 2 references them without a body.
	rec := request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("open draft: %d", rec.Code)
	}

	mounted := mount(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/2/files/data.csv?digest="+digest)
	if mounted.Code != http.StatusCreated {
		t.Fatalf("mount: status %d, body %s", mounted.Code, mounted.Body)
	}

	var result datadrop.UploadFileResult
	decodeBody(t, mounted, &result)
	if !result.Deduplicated {
		t.Fatal("a mounted file did not report deduplication")
	}
	if result.SizeBytes != int64(len(csvBody)) {
		t.Fatalf("SizeBytes = %d, want %d", result.SizeBytes, len(csvBody))
	}
}

func TestMountMissingBlobIsNotFound(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	rec := mount(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/x.csv?digest="+sha256Of("never uploaded"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestUploadToCommittedVersionIsRejected(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	rec := upload(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/late.csv", "x", "text/csv", true)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusConflict, rec.Body)
	}

	var problem Problem
	decodeBody(t, rec, &problem)
	if problem.Code != CodeImmutable {
		t.Fatalf("code = %q, want %q", problem.Code, CodeImmutable)
	}
}

func TestUploadEnforcesTheUploadCap(t *testing.T) {
	srv := newTestServer(t)
	srv.cfg.MaxUploadBytes = 32
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	rec := upload(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/big.csv",
		strings.Repeat("x", 500), "text/csv", true)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
	}
}

// The upload cap is much larger than the JSON body cap, and the two must not
// interfere: a body far above MaxBodyBytes must still upload.
func TestUploadCapIsSeparateFromBodyCap(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	// Lower the JSON body cap only after the setup requests, which are
	// themselves JSON and would otherwise trip it.
	srv.cfg.MaxBodyBytes = 16
	srv.cfg.MaxUploadBytes = 1 << 20

	rec := upload(t, srv,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv",
		strings.Repeat("x", 4096), "text/csv", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d — the JSON body cap must not bound uploads (body %s)",
			rec.Code, http.StatusCreated, rec.Body)
	}
}

func TestUploadRejectsBadPaths(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	// Note: a traversal in the URL path is cleaned by http.ServeMux before
	// routing, so it never reaches the handler. The query-parameter form on the
	// single-shot endpoint is NOT normalized, which is the vector this asserts.
	for _, bad := range []string{"../escape.csv", "/etc/passwd", "a/../../b.csv", "./x.csv"} {
		rec := upload(t, srv,
			"/v1/drops/greenhouse/datasets/trav/data?path="+url.QueryEscape(bad),
			csvBody, "text/csv", true)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("path %q: status %d, want %d", bad, rec.Code, http.StatusBadRequest)
		}
	}
}

// A client's default Content-Type carries no information and must not be baked
// into an immutable version; the extension is preferred over it.
func TestMediaTypeIgnoresClientDefaults(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	base := "/v1/drops/greenhouse/datasets/readings/versions/1/files/"

	// curl sends this for --data-binary with no explicit -H.
	upload(t, srv, base+"README.md", "# hi\n", "application/x-www-form-urlencoded", true)
	// A deliberate type wins, even against a misleading extension.
	upload(t, srv, base+"data.bin", csvBody, "text/csv", true)

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/1/commit", "", true)

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1", "", true)
	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)

	byPath := map[string]string{}
	for _, f := range version.Files {
		byPath[f.Path] = f.MediaType
	}
	if byPath["README.md"] != "text/markdown" {
		t.Errorf("README.md media type = %q, want text/markdown (the client default must lose)",
			byPath["README.md"])
	}
	if byPath["data.bin"] != "text/csv" {
		t.Errorf("data.bin media type = %q, want text/csv (a deliberate type must win)",
			byPath["data.bin"])
	}
}

func TestDownloadServesBytesWithETag(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Body.String() != csvBody {
		t.Fatalf("body = %q, want the uploaded content", rec.Body.String())
	}
	if got, want := rec.Header().Get("ETag"), `"`+sha256Of(csvBody)+`"`; got != want {
		t.Fatalf("ETag = %q, want %q (the digest is the validator)", got, want)
	}
	if rec.Header().Get("Accept-Ranges") != "bytes" {
		t.Fatal("Accept-Ranges is not advertised, so clients cannot resume")
	}
}

// Range support is what lets an interrupted multi-gigabyte download resume.
func TestDownloadSupportsRange(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	req := httptest.NewRequest(http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv", nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Range", "bytes=0-10")

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusPartialContent)
	}
	if got := rec.Body.String(); got != csvBody[:11] {
		t.Fatalf("body = %q, want the first 11 bytes %q", got, csvBody[:11])
	}
	if got := rec.Header().Get("Content-Range"); !strings.HasPrefix(got, "bytes 0-10/") {
		t.Fatalf("Content-Range = %q", got)
	}
}

func TestDownloadHonoursIfNoneMatch(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	req := httptest.NewRequest(http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv", nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("If-None-Match", `"`+sha256Of(csvBody)+`"`)

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotModified)
	}
}

// latest must resolve over committed versions only.
func TestLatestSkipsDrafts(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody+"22.4,0.46\n", "")

	// Version 3 stays a draft.
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/latest", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)
	if version.Version != 2 {
		t.Fatalf("latest = %d, want 2 (a draft must not shadow the committed version)", version.Version)
	}
}

func TestDraftIsNotReadable(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv",
		csvBody, "text/csv", true)

	t.Run("version metadata", func(t *testing.T) {
		rec := request(t, srv, http.MethodGet,
			"/v1/drops/greenhouse/datasets/readings/versions/1", "", true)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
		}
	})

	t.Run("file bytes", func(t *testing.T) {
		rec := request(t, srv, http.MethodGet,
			"/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv", "", true)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d — a half-uploaded file must not be served",
				rec.Code, http.StatusNotFound)
		}
	})
}

// The single-shot form exists so that `curl -T file` works.
func TestSingleShotUpload(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	rec := upload(t, srv, "/v1/drops/greenhouse/datasets/quick/data?path=readings.csv",
		csvBody, "text/csv", true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body)
	}

	var version datadrop.DatasetVersion
	decodeBody(t, rec, &version)
	if version.State != datadrop.StateCommitted {
		t.Fatalf("State = %q, want committed — the single-shot form must commit", version.State)
	}
	if version.FileCount != 1 {
		t.Fatalf("FileCount = %d, want 1", version.FileCount)
	}
}

func TestArchiveIsSelfDescribing(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/data/readings.csv",
		csvBody, "text/csv", true)
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/1/commit",
		`{"manifest":{"title":"Readings"},"schema":{"type":"object"}}`, true)

	rec := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1/archive", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	entries := map[string]string{}
	reader := tar.NewReader(rec.Body)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read archive: %v", err)
		}
		body, err := io.ReadAll(reader)
		if err != nil {
			t.Fatalf("read entry %s: %v", header.Name, err)
		}
		entries[header.Name] = string(body)
	}

	// The archive carries the description alongside the bytes, so it can be
	// verified somewhere else.
	for _, name := range []string{"manifest.json", "schema.json", "files/data/readings.csv"} {
		if _, present := entries[name]; !present {
			t.Fatalf("archive is missing %s; it holds %v", name, keysOf(entries))
		}
	}
	if entries["files/data/readings.csv"] != csvBody {
		t.Fatal("the archived file's content does not match what was uploaded")
	}
	if !strings.Contains(entries["manifest.json"], "Readings") {
		t.Fatalf("archived manifest = %s", entries["manifest.json"])
	}
}

func TestDeleteVersion(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	rec := request(t, srv, http.MethodDelete,
		"/v1/drops/greenhouse/datasets/readings/versions/1", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	if got := request(t, srv, http.MethodGet,
		"/v1/drops/greenhouse/datasets/readings/versions/1", "", true); got.Code != http.StatusNotFound {
		t.Fatalf("the deleted version is still readable: %d", got.Code)
	}
}

func TestListDatasetsEndpoint(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")
	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")
	publish(t, srv, "greenhouse", "calibration", "data.csv", "a,b\n1,2\n", "")

	rec := request(t, srv, http.MethodGet, "/v1/drops/greenhouse/datasets", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var response struct {
		Count    int                `json:"count"`
		Datasets []datadrop.Dataset `json:"datasets"`
	}
	decodeBody(t, rec, &response)
	if response.Count != 2 {
		t.Fatalf("count = %d, want 2", response.Count)
	}
}

func TestVersionPathMustBeAPositiveInteger(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	for _, raw := range []string{"abc", "0", "-1", "1.5"} {
		rec := request(t, srv, http.MethodGet,
			"/v1/drops/greenhouse/datasets/readings/versions/"+raw, "", true)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("version %q: status %d, want %d", raw, rec.Code, http.StatusBadRequest)
		}
	}
}

func TestHeadBlobRequiresAuth(t *testing.T) {
	srv := newTestServer(t)

	if rec := headRequest(t, srv, "/v1/blobs/"+sha256Of("x"), false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestHeadBlobRejectsMalformedDigest(t *testing.T) {
	srv := newTestServer(t)

	if rec := headRequest(t, srv, "/v1/blobs/not-a-digest", true); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestDatasetReadsRespectPublicRead(t *testing.T) {
	srv := newTestServer(t)

	if rec := request(t, srv, http.MethodPost, "/v1/drops",
		`{"name":"public","public_read":true}`, true); rec.Code != http.StatusCreated {
		t.Fatalf("create drop: %d", rec.Code)
	}
	publish(t, srv, "public", "readings", "data.csv", csvBody, "")

	if rec := request(t, srv, http.MethodGet,
		"/v1/drops/public/datasets/readings/versions/1/files/data.csv", "", false); rec.Code != http.StatusOK {
		t.Fatalf("unauthenticated read of a public drop's dataset: %d, want 200", rec.Code)
	}

	// Writes still require the token.
	if rec := upload(t, srv, "/v1/drops/public/datasets/readings/data?path=x.csv",
		csvBody, "text/csv", false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated write to a public drop: %d, want 401", rec.Code)
	}
}

func headRequest(t *testing.T, srv *Server, target string, authorized bool) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodHead, target, nil)
	if authorized {
		req.Header.Set("Authorization", "Bearer "+testToken)
	}

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func keysOf(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
