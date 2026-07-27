package server

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()

	dir := t.TempDir()

	st, err := store.Open(context.Background(), filepath.Join(dir, "datadrop.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	// The blob store shares the temp directory, so it is on the same filesystem
	// as the database, which is what the atomic-rename publish requires.
	blobs, err := blob.Open(filepath.Join(dir, "blobs"))
	if err != nil {
		t.Fatalf("blob.Open: %v", err)
	}

	srv, err := New(Config{Addr: "127.0.0.1:0", Token: testToken}, st, blobs)
	if err != nil {
		t.Fatalf("server.New: %v", err)
	}
	return srv
}

func TestHealthz(t *testing.T) {
	srv := newTestServer(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var body struct {
		Status string `json:"status"`
		Time   string `json:"time"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
	if body.Status != "ok" {
		t.Fatalf("status field = %q, want %q", body.Status, "ok")
	}
	if _, err := store.ParseTime(body.Time); err != nil {
		t.Fatalf("time field %q is not a canonical timestamp: %v", body.Time, err)
	}
}

func TestNewRequiresItsDependencies(t *testing.T) {
	blobs, err := blob.Open(filepath.Join(t.TempDir(), "blobs"))
	if err != nil {
		t.Fatalf("blob.Open: %v", err)
	}

	if _, err := New(Config{}, nil, blobs); err == nil {
		t.Fatal("expected an error when the store is nil")
	}

	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "datadrop.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	if _, err := New(Config{}, st, nil); err == nil {
		t.Fatal("expected an error when the blob store is nil")
	}
}

func TestNewAppliesDefaults(t *testing.T) {
	dir := t.TempDir()

	st, err := store.Open(context.Background(), filepath.Join(dir, "datadrop.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	blobs, err := blob.Open(filepath.Join(dir, "blobs"))
	if err != nil {
		t.Fatalf("blob.Open: %v", err)
	}

	srv, err := New(Config{}, st, blobs)
	if err != nil {
		t.Fatalf("server.New: %v", err)
	}
	if srv.Addr() != ":8080" {
		t.Fatalf("Addr() = %q, want %q", srv.Addr(), ":8080")
	}
	if srv.cfg.MaxBodyBytes != DefaultMaxBodyBytes {
		t.Fatalf("MaxBodyBytes = %d, want %d", srv.cfg.MaxBodyBytes, DefaultMaxBodyBytes)
	}
	// The upload cap is separate from the body cap, and much larger.
	if srv.cfg.MaxUploadBytes != DefaultMaxUploadBytes {
		t.Fatalf("MaxUploadBytes = %d, want %d", srv.cfg.MaxUploadBytes, DefaultMaxUploadBytes)
	}
}

// Serve must bind, report its resolved address, and unwind cleanly when the
// context is cancelled — which is what SIGINT does in `datadrop serve`.
func TestServeShutsDownOnContextCancel(t *testing.T) {
	srv := newTestServer(t)

	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan string, 1)
	done := make(chan error, 1)

	go func() {
		done <- srv.Serve(ctx, func(addr net.Addr) { ready <- addr.String() })
	}()

	addr := <-ready
	resp, err := http.Get("http://" + addr + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	cancel()
	if err := <-done; err != nil {
		t.Fatalf("Serve returned %v, want nil after a clean shutdown", err)
	}
}
