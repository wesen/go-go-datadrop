package server

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// requestIDContextKey types the context value carrying the per-request ID.
type requestIDContextKey struct{}

// RequestIDFromContext returns the ID assigned by the requestID middleware.
func RequestIDFromContext(ctx context.Context) string {
	if id, ok := ctx.Value(requestIDContextKey{}).(string); ok {
		return id
	}
	return ""
}

// ActorLabel is the audit actor recorded for an authenticated caller.
//
// It is deliberately NOT the token. Tokens must never reach a log line, an
// audit row, or a response body; when auth is enabled every caller presents
// the same static credential anyway, so there is nothing to distinguish.
const ActorLabel = "token"

// chain applies middleware outermost-first: chain(h, a, b) runs a, then b,
// then h.
func chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// recoverMiddleware turns a handler panic into a logged 500 rather than a
// killed connection and a dead server.
func (s *Server) recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Error().
					Interface("panic", recovered).
					Str("path", r.URL.Path).
					Str("request_id", RequestIDFromContext(r.Context())).
					Msg("handler panicked")

				writeProblem(w, r, http.StatusInternalServerError, CodeInternal,
					"the server failed to handle this request")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requestIDMiddleware assigns each request an ID, echoes it in the
// X-Request-Id header, and puts it in the context so problem documents and log
// lines can be correlated.
func (s *Server) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := store.NewEventID(s.store.Now())
		if err != nil {
			// An ID is a nicety, not a precondition; degrade rather than fail.
			id = ""
		}
		if id != "" {
			w.Header().Set("X-Request-Id", id)
		}
		next.ServeHTTP(w, r.WithContext(
			context.WithValue(r.Context(), requestIDContextKey{}, id)))
	})
}

// loggingMiddleware records one line per completed request.
func (s *Server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(recorder, r)

		log.Debug().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", recorder.status).
			Dur("duration", time.Since(started)).
			Str("request_id", RequestIDFromContext(r.Context())).
			Msg("request")
	})
}

// statusRecorder captures the response status for the access log.
//
// It forwards Flush so that SSE handlers downstream can still stream; without
// this, wrapping the ResponseWriter would silently break the live endpoint.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if !r.written {
		r.status = status
		r.written = true
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	r.written = true
	return r.ResponseWriter.Write(b)
}

func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// authenticate checks the bearer token on a mutating request.
//
// It returns false and writes a problem document when the caller is not
// authorized, so handlers read:
//
//	if !s.authenticate(w, r) { return }
func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) bool {
	if s.cfg.Token == "" {
		// No token configured: the server is open. `serve` logs a warning at
		// startup so this is never a silent state.
		return true
	}

	presented, ok := bearerToken(r)
	if !ok || subtle.ConstantTimeCompare([]byte(presented), []byte(s.cfg.Token)) != 1 {
		w.Header().Set("WWW-Authenticate", `Bearer realm="datadrop"`)
		writeProblem(w, r, http.StatusUnauthorized, CodeUnauthorized,
			"a valid bearer token is required")
		return false
	}
	return true
}

// authorizeRead applies the read policy: a drop marked public_read is readable
// without a token, everything else needs one.
//
// This is done per-handler rather than in middleware because the decision
// depends on the target drop, which middleware would have to look up — and a
// drop-aware auth middleware is more surprising than an explicit call.
func (s *Server) authorizeRead(w http.ResponseWriter, r *http.Request, dropName string) bool {
	if s.cfg.Token == "" {
		return true
	}

	// A valid token always grants read access, without touching the database.
	if presented, ok := bearerToken(r); ok &&
		subtle.ConstantTimeCompare([]byte(presented), []byte(s.cfg.Token)) == 1 {
		return true
	}

	if dropName != "" {
		d, err := s.store.GetDrop(r.Context(), dropName)
		if err == nil && d.PublicRead {
			return true
		}
	}

	w.Header().Set("WWW-Authenticate", `Bearer realm="datadrop"`)
	writeProblem(w, r, http.StatusUnauthorized, CodeUnauthorized,
		"a valid bearer token is required")
	return false
}

// bearerToken extracts the credential from an Authorization header.
func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	return strings.TrimSpace(header[len(prefix):]), true
}

// auditContext tags the request context with the actor for audit attribution.
func auditContext(r *http.Request) context.Context {
	return store.WithActor(r.Context(), ActorLabel)
}

// pathName reads a {name}-style path parameter and validates it before it
// reaches the database.
func pathName(w http.ResponseWriter, r *http.Request, kind, param string) (string, bool) {
	value := r.PathValue(param)
	if err := datadrop.ValidateName(kind, value); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return "", false
	}
	return value, true
}
