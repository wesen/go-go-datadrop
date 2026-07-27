package webui

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mounted(t *testing.T, dir string) http.Handler {
	t.Helper()

	mux := http.NewServeMux()
	// A stand-in for the API, so the tests can prove the UI does not shadow it.
	mux.HandleFunc("GET /v1/drops", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"drops":[]}`))
	})
	Register(mux, dir)
	return mux
}

func get(t *testing.T, h http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, http.NoBody))
	return rec
}

func TestRootRedirectsToTheUI(t *testing.T) {
	rec := get(t, mounted(t, ""), "/")
	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want 302", rec.Code)
	}
	if location := rec.Header().Get("Location"); location != MountPath {
		t.Fatalf("Location = %q, want %q", location, MountPath)
	}
}

func TestShellServesIndex(t *testing.T) {
	rec := get(t, mounted(t, ""), MountPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<html") {
		t.Fatalf("body is not an HTML document: %q", rec.Body.String())
	}
}

// A hard refresh on a client-side route must return the shell, not a 404.
func TestUnknownUIRouteFallsBackToTheShell(t *testing.T) {
	rec := get(t, mounted(t, ""), MountPath+"chart/lab/temps")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<html") {
		t.Fatalf("body is not the shell: %q", rec.Body.String())
	}
}

// A missing asset must 404 rather than fall back to the shell. A stale cached
// page asking for a chunk from a previous build should fail loudly, not receive
// HTML and report an unrelated syntax error.
func TestMissingAssetIsNotFound(t *testing.T) {
	rec := get(t, mounted(t, ""), AssetPath+"assets/index-deadbeef.js")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %q)", rec.Code, rec.Body.String())
	}
}

// The API must keep its own 404s. This is the whole reason the SPA is mounted
// at /ui rather than at the root with a catch-all.
func TestTheUIDoesNotShadowTheAPI(t *testing.T) {
	handler := mounted(t, "")

	if rec := get(t, handler, "/v1/drops"); rec.Code != http.StatusOK {
		t.Fatalf("existing API route: status = %d, want 200", rec.Code)
	}
	rec := get(t, handler, "/v1/drop")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mistyped API route: status = %d, want 404", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "<html") {
		t.Fatalf("a mistyped API route returned the SPA shell: %q", rec.Body.String())
	}
}

func TestUIDirOverridesTheEmbeddedCopy(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"),
		[]byte("<html><body>from disk</body></html>"), 0o600); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"),
		[]byte("export const x = 1;\n"), 0o600); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	handler := mounted(t, dir)

	rec := get(t, handler, MountPath)
	if !strings.Contains(rec.Body.String(), "from disk") {
		t.Fatalf("shell came from the embedded copy: %q", rec.Body.String())
	}

	rec = get(t, handler, AssetPath+"assets/app.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("asset status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "export const x") {
		t.Fatalf("asset body = %q", rec.Body.String())
	}
}

func TestCleanRelativeRejectsEscapes(t *testing.T) {
	for input, want := range map[string]string{
		"":                 "",
		".":                "",
		"index.html":       "index.html",
		"/index.html":      "index.html",
		"a/../b.js":        "b.js",
		"../../etc/passwd": "etc/passwd",
		"./a.js":           "a.js",
	} {
		if got := cleanRelative(input); got != want {
			t.Errorf("cleanRelative(%q) = %q, want %q", input, got, want)
		}
	}
}
