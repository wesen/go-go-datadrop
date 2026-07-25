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
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/schema"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
	"github.com/go-go-golems/go-go-datadrop/pkg/stream"
	"github.com/go-go-golems/go-go-datadrop/pkg/webui"
)

// Authentication modes. See guide §7.4 and DR-26.
const (
	// AuthNone requires no credential for anything. Local development only;
	// `serve` warns at startup.
	AuthNone = "none"
	// AuthToken makes the static --token the only credential — the behaviour
	// of every release before DATADROP-5.
	AuthToken = "token"
	// AuthOIDC enables browser sessions and per-user API tokens. A --token may
	// still be set alongside, as an operator break-glass and a test fixture.
	AuthOIDC = "oidc"
)

// OIDCConfig configures the relying party.
type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	// Scopes requested from the provider. These are OAuth scopes, not datadrop
	// scopes; the two never mix.
	Scopes []string
	// RequireVerifiedEmail refuses a sign-in whose email_verified claim is
	// false. Defaults to true in code: the safe value belongs where it applies
	// to every deployment that does not explicitly opt out.
	RequireVerifiedEmail bool
	// SessionLifetime is absolute and is never extended by activity.
	SessionLifetime time.Duration
	// SessionIdle expires a session that has not been used. A non-positive
	// value disables the check, which is why New fills in a default rather
	// than letting a zero value mean "forever".
	SessionIdle time.Duration
	// FlowMaxAge bounds how long a sign-in redirect may take.
	FlowMaxAge time.Duration
}

// Config holds the knobs `datadrop serve` exposes.
type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string

	// Auth selects the authentication mode: AuthNone, AuthToken or AuthOIDC.
	// Empty is resolved by New: AuthToken when a Token is set, else AuthNone —
	// which is exactly the behaviour every caller had before this field
	// existed.
	Auth string

	// Token is the static bearer token. In AuthToken mode it is the only
	// credential; in AuthOIDC mode it additionally grants the root principal.
	Token string

	// ExternalURL is the origin a browser reaches this server on, e.g.
	// "http://datadrop.localhost:7070".
	//
	// It is NOT cosmetic. It determines the OIDC redirect URI, the Secure
	// attribute on the session cookie, and the Origin value the CSRF check
	// compares against — so getting it wrong produces three failures that look
	// unrelated to each other and to the cause.
	ExternalURL string

	// OIDC is used only when Auth is AuthOIDC.
	OIDC OIDCConfig
	// MaxBodyBytes caps request bodies. Zero selects DefaultMaxBodyBytes.
	MaxBodyBytes int64

	// StreamBuffer is the per-SSE-subscriber channel depth. Zero selects the
	// hub's default. A subscriber that overflows it is disconnected and
	// expected to resume from its last sequence.
	StreamBuffer int

	// DisableUI leaves the /ui and /static routes unregistered. Mounting them
	// is free when the assets are missing, but an operator running a headless
	// ingest node may prefer the routes gone entirely.
	DisableUI bool

	// UIDir serves the frontend from a directory instead of from the embedded
	// copy, so a developer can point a running server at a fresh build.
	UIDir string

	// MaxUploadBytes caps a dataset file upload. Zero selects
	// DefaultMaxUploadBytes.
	//
	// This is deliberately separate from MaxBodyBytes. Conflating them would
	// either cripple uploads or strip the small-body protection from every
	// other endpoint.
	MaxUploadBytes int64
}

// DefaultMaxBodyBytes is the ingest body cap when Config.MaxBodyBytes is unset.
const DefaultMaxBodyBytes int64 = 1 << 20 // 1 MiB

// DefaultMaxUploadBytes is the dataset upload cap when Config.MaxUploadBytes is
// unset. It is a policy choice rather than a technical limit, and it is the
// only thing standing between a public deployment and a filled disk.
const DefaultMaxUploadBytes int64 = 5 << 30 // 5 GiB

// Server wires the store, the schema cache, and the live hub to the HTTP
// surface.
type Server struct {
	cfg     Config
	store   *store.Store
	blobs   *blob.Store
	schemas *schema.Cache
	hub     *stream.Hub
	http    *http.Server

	// oidc is nil unless Auth is AuthOIDC and SetOIDCProvider has been called.
	// An interface, so the callback handler's failure paths are testable with a
	// fake rather than only against a live identity provider.
	oidc auth.Provider
}

// SetOIDCProvider installs the relying party.
//
// Separate from New because discovery is a network call and New is not allowed
// to make one: a server that cannot be constructed without reaching the
// identity provider is a server whose tests need one.
func (s *Server) SetOIDCProvider(p auth.Provider) { s.oidc = p }

// RedirectURI is the callback URL to register on the OIDC application.
//
// Derived from ExternalURL rather than configured separately, because a
// mismatch of a single character produces a provider-side error page rather
// than a datadrop error — and having one source for it means the provisioning
// script and the server cannot disagree.
func (c Config) RedirectURI() string { return c.ExternalURL + "/v1/auth/callback" }

// New builds a Server. It does not bind a socket; call Serve for that.
func New(cfg Config, st *store.Store, blobs *blob.Store) (*Server, error) {
	if st == nil {
		return nil, errors.New("server: store is required")
	}
	if blobs == nil {
		return nil, errors.New("server: blob store is required")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	if cfg.MaxBodyBytes <= 0 {
		cfg.MaxBodyBytes = DefaultMaxBodyBytes
	}
	if cfg.MaxUploadBytes <= 0 {
		cfg.MaxUploadBytes = DefaultMaxUploadBytes
	}
	if cfg.Auth == "" {
		// Preserve the pre-DATADROP-5 contract for every caller that does not
		// know about modes: a token means token auth, no token means open.
		cfg.Auth = AuthNone
		if cfg.Token != "" {
			cfg.Auth = AuthToken
		}
	}
	switch cfg.Auth {
	case AuthNone, AuthToken, AuthOIDC:
	default:
		return nil, errors.Errorf("server: unknown auth mode %q (want none, token or oidc)", cfg.Auth)
	}
	if cfg.Auth == AuthToken && cfg.Token == "" {
		return nil, errors.New("server: auth mode \"token\" requires a token")
	}
	// Defaults for the session deadlines. Filled in here rather than left zero
	// because a zero SessionIdle disables the idle check entirely, and a
	// fail-open default should not be reachable by forgetting a field.
	if cfg.OIDC.SessionLifetime <= 0 {
		cfg.OIDC.SessionLifetime = 12 * time.Hour
	}
	if cfg.OIDC.SessionIdle <= 0 {
		cfg.OIDC.SessionIdle = 2 * time.Hour
	}
	if cfg.OIDC.FlowMaxAge <= 0 {
		cfg.OIDC.FlowMaxAge = 5 * time.Minute
	}
	cfg.ExternalURL = strings.TrimRight(cfg.ExternalURL, "/")

	s := &Server{
		cfg:     cfg,
		store:   st,
		blobs:   blobs,
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

	// Tables: any source projected into the shape a chart consumes
	// (DATADROP-3). Reads only — the web UI never mutates.
	mux.HandleFunc("GET /v1/drops/{name}/streams", s.handleListStreams)
	mux.HandleFunc("GET /v1/drops/{name}/table", s.handleStreamTable)

	mux.HandleFunc("PUT /v1/drops/{name}/schemas/{stream}", s.handlePutSchema)
	mux.HandleFunc("GET /v1/drops/{name}/schemas/{stream}", s.handleGetSchema)

	// Datasets: large, finite, immutable bodies of data (DATADROP-2).
	mux.HandleFunc("GET /v1/drops/{name}/datasets", s.handleListDatasets)
	mux.HandleFunc("GET /v1/drops/{name}/datasets/{dataset}", s.handleGetDataset)
	mux.HandleFunc("PUT /v1/drops/{name}/datasets/{dataset}/data", s.handlePutDatasetData)
	mux.HandleFunc("POST /v1/drops/{name}/datasets/{dataset}/versions", s.handleOpenDatasetVersion)
	mux.HandleFunc("GET /v1/drops/{name}/datasets/{dataset}/versions/{version}", s.handleGetDatasetVersion)
	mux.HandleFunc("DELETE /v1/drops/{name}/datasets/{dataset}/versions/{version}", s.handleDeleteDatasetVersion)
	mux.HandleFunc("POST /v1/drops/{name}/datasets/{dataset}/versions/{version}/commit", s.handleCommitDatasetVersion)
	mux.HandleFunc("GET /v1/drops/{name}/datasets/{dataset}/versions/{version}/archive", s.handleDatasetArchive)
	mux.HandleFunc("POST /v1/drops/{name}/datasets/{dataset}/versions/{version}/import", s.handleImportDataset)
	mux.HandleFunc("GET /v1/drops/{name}/datasets/{dataset}/versions/{version}/table", s.handleDatasetTable)
	// {path...} is a trailing wildcard, so logical paths containing slashes work.
	mux.HandleFunc("PUT /v1/drops/{name}/datasets/{dataset}/versions/{version}/files/{path...}", s.handleUploadDatasetFile)
	mux.HandleFunc("GET /v1/drops/{name}/datasets/{dataset}/versions/{version}/files/{path...}", s.handleDownloadDatasetFile)

	// Accounts (DATADROP-5).
	mux.HandleFunc("GET /v1/auth/login", s.handleAuthLogin)
	mux.HandleFunc("GET /v1/auth/callback", s.handleAuthCallback)
	mux.HandleFunc("POST /v1/auth/logout", s.handleAuthLogout)

	mux.HandleFunc("GET /v1/me", s.handleMe)
	mux.HandleFunc("GET /v1/me/tokens", s.handleListTokens)
	mux.HandleFunc("POST /v1/me/tokens", s.handleCreateToken)
	mux.HandleFunc("DELETE /v1/me/tokens/{id}", s.handleRevokeToken)
	mux.HandleFunc("GET /v1/me/sessions", s.handleListSessions)
	mux.HandleFunc("DELETE /v1/me/sessions/{id}", s.handleDeleteSession)
	mux.HandleFunc("GET /v1/users/lookup", s.handleLookupUser)

	mux.HandleFunc("GET /v1/drops/{name}/members", s.handleListMembers)
	mux.HandleFunc("PUT /v1/drops/{name}/members/{userId}", s.handleSetMember)
	mux.HandleFunc("DELETE /v1/drops/{name}/members/{userId}", s.handleRemoveMember)
	mux.HandleFunc("POST /v1/drops/{name}/claim", s.handleClaimDrop)

	mux.HandleFunc("HEAD /v1/blobs/{digest}", s.handleHeadBlob)
	mux.HandleFunc("POST /v1/blobs/gc", s.handleGarbageCollect)

	// The web UI, mounted last so that it is visibly subordinate to the API.
	// It claims /ui, /static and the bare root; nothing under /v1.
	if !s.cfg.DisableUI {
		webui.Register(mux, s.cfg.UIDir)
	}

	// Outermost first: a panic in any handler must still produce a response
	// carrying the request ID that the log line will reference.
	return chain(mux,
		s.recoverMiddleware,
		s.requestIDMiddleware,
		s.loggingMiddleware,
		// Innermost, so a panic while resolving a credential is still caught
		// and still carries a request id. It never rejects; see resolve.
		s.principalMiddleware,
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

	if s.cfg.Auth == AuthOIDC {
		go s.sweepAuth(ctx)
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

// sweepAuth deletes expired sessions and abandoned sign-in flows.
//
// Hygiene, not enforcement: GetSession and TakeAuthFlow both check their own
// deadlines, so a paused or crashed sweeper cannot become an authorization
// bypass. It runs once at startup and then every five minutes.
func (s *Server) sweepAuth(ctx context.Context) {
	const interval = 5 * time.Minute

	sweep := func() {
		sessions, flows, err := s.store.SweepAuth(ctx, s.cfg.OIDC.FlowMaxAge)
		if err != nil {
			log.Warn().Err(err).Msg("auth sweep failed")
			return
		}
		if sessions > 0 || flows > 0 {
			log.Debug().Int64("sessions", sessions).Int64("flows", flows).Msg("swept auth state")
		}
	}

	sweep()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweep()
		}
	}
}
