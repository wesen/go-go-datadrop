// Package server exposes the datadrop HTTP surface.
//
// Per AGENT.md this uses net/http and *http.ServeMux only — no third-party
// router. Go 1.22+ pattern syntax ("POST /v1/drops/{name}/events") covers
// everything the v0.1 API needs.
//
// The v0.1 slice registers only /healthz; the drop, event, stream, schema and
// export routes land in subsequent MVP tasks. See
// ttmp/2026/07/24/DATADROP-1--*/design/02-intern-implementation-guide.md §10
// for the full endpoint reference and §12.5 for the middleware design.
package server

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/schema"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
	"github.com/go-go-golems/go-go-datadrop/pkg/stream"
)

// Config holds the knobs `datadrop serve` exposes.
type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string
	// Token is the static bearer token required by mutating endpoints.
	// Empty means "no authentication", which is only appropriate locally.
	Token string
	// MaxBodyBytes caps request bodies. Zero selects DefaultMaxBodyBytes.
	MaxBodyBytes int64

	// StreamBuffer is the per-SSE-subscriber channel depth. Zero selects the
	// hub's default. A subscriber that overflows it is disconnected and
	// expected to resume from its last sequence.
	StreamBuffer int
}

// DefaultMaxBodyBytes is the ingest body cap when Config.MaxBodyBytes is unset.
const DefaultMaxBodyBytes int64 = 1 << 20 // 1 MiB

// Server wires the store, the schema cache, and the live hub to the HTTP
// surface.
type Server struct {
	cfg     Config
	store   *store.Store
	schemas *schema.Cache
	hub     *stream.Hub
	http    *http.Server
}

// New builds a Server. It does not bind a socket; call Serve for that.
func New(cfg Config, st *store.Store) (*Server, error) {
	if st == nil {
		return nil, errors.New("server: store is required")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	if cfg.MaxBodyBytes <= 0 {
		cfg.MaxBodyBytes = DefaultMaxBodyBytes
	}

	s := &Server{
		cfg:     cfg,
		store:   st,
		schemas: schema.NewCache(),
		hub:     stream.NewHub(cfg.StreamBuffer),
	}
	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: SSE responses (a later MVP task) are long-lived by
		// design and a write deadline would sever them.
	}
	return s, nil
}

// Handler builds the routing tree. Exported so handler tests can exercise it
// without binding a socket.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)

	mux.HandleFunc("POST /v1/drops", s.handleCreateDrop)
	mux.HandleFunc("GET /v1/drops", s.handleListDrops)
	mux.HandleFunc("GET /v1/drops/{name}", s.handleGetDrop)

	mux.HandleFunc("POST /v1/drops/{name}/events", s.handleAppendEvent)
	mux.HandleFunc("GET /v1/drops/{name}/events", s.handleQueryEvents)
	mux.HandleFunc("GET /v1/drops/{name}/events/stream", s.handleStreamEvents)

	mux.HandleFunc("GET /v1/drops/{name}/export", s.handleExport)

	mux.HandleFunc("PUT /v1/drops/{name}/schemas/{stream}", s.handlePutSchema)
	mux.HandleFunc("GET /v1/drops/{name}/schemas/{stream}", s.handleGetSchema)

	// Outermost first: a panic in any handler must still produce a response
	// carrying the request ID that the log line will reference.
	return chain(mux,
		s.recoverMiddleware,
		s.requestIDMiddleware,
		s.loggingMiddleware,
	)
}

// Addr reports the configured listen address.
func (s *Server) Addr() string { return s.cfg.Addr }

// Serve binds the listen address and serves until ctx is cancelled, then
// drains in-flight requests. The returned error is nil on a clean shutdown.
//
// ready, when non-nil, is closed once the socket is bound and reports the
// resolved address — which matters when Addr uses port 0.
func (s *Server) Serve(ctx context.Context, ready func(net.Addr)) error {
	listener, err := net.Listen("tcp", s.cfg.Addr)
	if err != nil {
		return errors.Wrapf(err, "server: listen on %s", s.cfg.Addr)
	}

	log.Info().Str("addr", listener.Addr().String()).Msg("datadrop server listening")
	if ready != nil {
		ready(listener.Addr())
	}

	errCh := make(chan error, 1)
	go func() {
		if err := s.http.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- errors.Wrap(err, "server: serve")
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info().Msg("shutting down datadrop server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := s.http.Shutdown(shutdownCtx); err != nil {
			return errors.Wrap(err, "server: shutdown")
		}
		return <-errCh
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, r, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   store.FormatTime(s.store.Now()),
	})
}

// writeJSON serializes v as the response body. Encoding failures are logged
// rather than returned: the status line is already on the wire by then.
func writeJSON(w http.ResponseWriter, r *http.Request, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Warn().Err(err).Str("path", r.URL.Path).Msg("failed to write JSON response")
	}
}
