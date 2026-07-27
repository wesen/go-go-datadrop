package server

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
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

// SessionCookieName is the browser's credential.
//
// Not prefixed with __Host-, which would be stricter but mandates Secure — and
// the local compose stack runs on plain HTTP. The Secure attribute is set from
// the configured external URL's scheme instead, and `serve` warns loudly when
// that is http on a host browsers do not treat as trustworthy (guide §8.4).
const SessionCookieName = "dd_session"

// FlowCookieName binds a browser to one pending sign-in.
const FlowCookieName = "dd_flow"

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
			// The principal, which is what turns an access log into something
			// questions can be asked of. Never the credential itself.
			Str("actor", auth.FromContext(r.Context()).Label()).
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

// principalMiddleware resolves the caller once and puts them in the context.
//
// It runs after requestIDMiddleware and before loggingMiddleware: a panic during
// resolution is still caught by recoverMiddleware and still carries a request
// id, while the completed access log can record the resolved actor. It never
// writes a response: rejection is a per-handler decision, because the required
// role and scope are per-handler facts. A resolver that wrote its own 401 would
// make /healthz and the SPA shell unreachable without special-casing.
func (s *Server) principalMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), s.resolve(r))))
	})
}

// resolve turns a request's credentials into a principal.
//
// Four properties are deliberate, and each is a place to get this wrong:
//
//   - A bearer beats a cookie. An explicit credential should win over an
//     ambient one, so a token-authenticated curl from a browser-logged-in
//     developer behaves as the token rather than as the human.
//   - An invalid credential resolves to anonymous, not to an error. A request
//     with a stale token to a public_read drop must still succeed, because the
//     drop is public; conflating "presented something invalid" with "denied"
//     breaks that and leaks whether a token id exists.
//   - The static token is compared first, and in constant time. It is
//     operator-chosen and may be anything, including something that begins
//     "ddp_", so a prefix switch before the comparison would be wrong.
//   - Nothing here writes to the response.
func (s *Server) resolve(r *http.Request) auth.Principal {
	if s.cfg.Auth == AuthNone {
		// Every request is the operator. `serve` warns about this at startup.
		return auth.Principal{Kind: auth.KindRoot, Scopes: auth.FullScopeSet()}
	}

	if presented, ok := bearerToken(r); ok {
		if s.cfg.Token != "" &&
			subtle.ConstantTimeCompare([]byte(presented), []byte(s.cfg.Token)) == 1 {
			return auth.Principal{Kind: auth.KindRoot, Scopes: auth.FullScopeSet()}
		}
		if s.cfg.Auth == AuthOIDC && auth.LooksLikeToken(presented) {
			if resolved, err := s.store.ResolveAPIToken(r.Context(), presented); err == nil {
				return auth.Principal{
					Kind:    auth.KindToken,
					UserID:  resolved.Token.UserID,
					Scopes:  resolved.Scopes,
					TokenID: resolved.Token.ID,
				}
			}
		}
		return auth.Anonymous()
	}

	if s.cfg.Auth == AuthOIDC {
		if cookie, err := r.Cookie(SessionCookieName); err == nil && cookie.Value != "" {
			if p, ok := s.resolveSession(r, cookie.Value); ok {
				return p
			}
		}
	}

	return auth.Anonymous()
}

func (s *Server) resolveSession(r *http.Request, value string) (auth.Principal, bool) {
	session, err := s.store.GetSession(r.Context(), value, s.cfg.OIDC.SessionIdle)
	if err != nil {
		return auth.Anonymous(), false
	}
	user, err := s.store.GetUser(r.Context(), session.UserID)
	if err != nil || user.Disabled {
		return auth.Anonymous(), false
	}

	// Advancing the idle clock keeps an active user signed in. It is a write
	// on the read path, which is acceptable because it is one indexed UPDATE
	// alongside a request that is already doing more work than that; if it ever
	// stops being acceptable, throttle it the way store.touchToken does.
	if err := s.store.TouchSession(r.Context(), session.ID); err != nil {
		log.Debug().Err(err).Msg("could not touch session")
	}

	return auth.Principal{
		Kind:   auth.KindSession,
		UserID: session.UserID,
		// A human at a browser acts with their full rights; a per-session
		// scope restriction is a feature nobody asked for.
		Scopes: auth.FullScopeSet(),
		// Carried so that sign-out and "revoke my other sessions" know which
		// session is the current one without re-hashing the cookie.
		SessionID: session.ID,
	}, true
}

// authorize gates an operation that is not about one drop: creating a drop,
// garbage collection, anything under /v1/me.
//
// It returns false and writes a problem document when the caller is not
// permitted, so handlers read:
//
//	p, ok := s.authorize(w, r, auth.ScopeDropsWrite)
//	if !ok { return }
func (s *Server) authorize(w http.ResponseWriter, r *http.Request, scope auth.Scope) (auth.Principal, bool) {
	p := auth.FromContext(r.Context())
	if !p.IsAuthenticated() {
		return p, s.denyUnauthenticated(w, r)
	}
	if !s.checkOrigin(w, r, p) {
		return p, false
	}
	if !p.Allowed(scope) {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"this credential does not carry the "+string(scope)+" scope")
		return p, false
	}
	return p, true
}

// authorizeDrop is the whole decision for an operation on one drop:
// membership, credential scope, and the cross-origin check for
// cookie-authenticated writes.
//
// The CSRF check lives INSIDE this function rather than beside it, so that
// there is no way to authorize a mutating request without passing through it.
// It is the control most likely to be forgotten on a new endpoint (guide §8.5).
func (s *Server) authorizeDrop(
	w http.ResponseWriter, r *http.Request, dropName string, required auth.Role, scope auth.Scope,
) (auth.Principal, bool) {
	p := auth.FromContext(r.Context())

	if !s.checkOrigin(w, r, p) {
		return p, false
	}

	acl, err := s.store.DropACL(r.Context(), dropName)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			// An unauthenticated caller must not learn whether a drop exists,
			// so they get the same 401 they would get for a private one. An
			// authenticated caller gets the honest 404.
			if !p.IsAuthenticated() {
				return p, s.denyUnauthenticated(w, r)
			}
			writeProblem(w, r, http.StatusNotFound, CodeNotFound,
				"drop \""+dropName+"\" does not exist")
			return p, false
		}
		s.writeStoreError(w, r, err)
		return p, false
	}

	if auth.Authorize(p, acl, required, scope) {
		return p, true
	}

	if !p.IsAuthenticated() {
		return p, s.denyUnauthenticated(w, r)
	}
	// 403, not 404: the caller is authenticated and has already been able to
	// learn the drop exists (creating one by that name would 409). Hiding it
	// buys nothing and costs a comprehensible error.
	writeProblem(w, r, http.StatusForbidden, CodeForbidden,
		"you do not have "+string(required)+" access to drop \""+dropName+"\"")
	return p, false
}

// denyUnauthenticated writes the 401 and always returns false, so callers can
// `return p, s.denyUnauthenticated(w, r)`.
func (s *Server) denyUnauthenticated(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("WWW-Authenticate", `Bearer realm="datadrop"`)
	writeProblem(w, r, http.StatusUnauthorized, CodeUnauthorized,
		"a valid credential is required")
	return false
}

// checkOrigin is the CSRF defence for cookie-authenticated writes.
//
// A session cookie is an ambient credential: the browser attaches it to any
// request to our origin, including one triggered by a page on another site. A
// bearer token is not ambient — it has to be deliberately attached — so
// bearer-authenticated requests skip this entirely.
//
// Origin rather than a double-submit token because it is sent by every browser
// on every unsafe cross-origin request, cannot be set or forged by page
// JavaScript, requires no state or token minting, and is one function with one
// test. SameSite=Lax on the cookie is defence in depth behind it, not the
// primary control.
func (s *Server) checkOrigin(w http.ResponseWriter, r *http.Request, p auth.Principal) bool {
	if p.Kind != auth.KindSession {
		return true
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return true
	}

	origin := r.Header.Get("Origin")
	if origin != "" && s.cfg.ExternalURL != "" && origin == s.cfg.ExternalURL {
		return true
	}

	// An absent Origin on a cookie-authenticated unsafe request has no
	// legitimate source: a browser always sends it on a cross-origin unsafe
	// request, and a non-browser client cannot hold our cookie ambiently.
	// Being strict here costs us nothing.
	log.Warn().
		Str("origin", origin).
		Str("expected", s.cfg.ExternalURL).
		Str("path", r.URL.Path).
		Msg("rejected a cookie-authenticated request from another origin")
	writeProblem(w, r, http.StatusForbidden, CodeCrossOrigin,
		"this request did not come from "+s.cfg.ExternalURL)
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
//
// The actor is the principal's label — "root", "user:usr_…", or
// "user:usr_… via token:…" — and never the credential. Before DATADROP-5 there
// was nothing else to say and every audit row read "token".
func auditContext(r *http.Request) context.Context {
	return store.WithActor(r.Context(), auth.FromContext(r.Context()).Label())
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
