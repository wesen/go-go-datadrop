package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// The sign-in flow. See guide §8.2 for the sequence.
//
// Three endpoints, and between them exactly one back-channel call to the
// identity provider — the code exchange. Nothing else in the server ever talks
// to it, which is what makes "a provider outage affects only new sign-ins"
// true rather than aspirational.

// handleAuthLogin starts a sign-in.
//
// A navigation, not an API call: an OIDC redirect cannot be performed with
// fetch(), and trying is a standard afternoon lost to CORS.
func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if !s.oidcConfigured(w, r) {
		return
	}

	returnTo := safeReturnPath(r.URL.Query().Get("return"))
	signup := r.URL.Query().Get("intent") == "signup"

	state, err := auth.NewFlowValue()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	nonce, err := auth.NewFlowValue()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	verifier, err := auth.NewFlowValue()
	if err != nil {
		s.internalError(w, r, err)
		return
	}

	if err := s.store.CreateAuthFlow(r.Context(), datadrop.AuthFlow{
		State:    state,
		Nonce:    nonce,
		Verifier: verifier,
		ReturnTo: returnTo,
	}); err != nil {
		s.internalError(w, r, err)
		return
	}

	// The state also goes in a short-lived cookie. The row alone would let
	// anyone who observes a callback URL redeem it; requiring both means the
	// callback must arrive in the same browser that started the flow.
	s.setFlowCookie(w, state, int(s.cfg.OIDC.FlowMaxAge.Seconds()))

	http.Redirect(w, r, s.oidc.AuthCodeURL(state, nonce, verifier, signup), http.StatusFound)
}

// handleAuthCallback completes a sign-in.
//
// Every failure redirects to the SPA with an error code rather than rendering a
// page. That is both nicer and avoids reflecting provider-supplied text into an
// HTML response.
func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if !s.oidcConfigured(w, r) {
		return
	}
	s.clearFlowCookie(w)

	if providerError := r.URL.Query().Get("error"); providerError != "" {
		// The user cancelled, or the provider refused. Their words are not
		// echoed anywhere; only our own code is.
		log.Info().Str("error", providerError).Msg("sign-in was refused at the provider")
		s.redirectAuthError(w, r, "provider_refused")
		return
	}

	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie(FlowCookieName)
	if err != nil || cookie.Value == "" || state == "" || cookie.Value != state {
		// A callback for a flow this browser did not start. This is the check
		// that makes login itself un-CSRF-able.
		s.redirectAuthError(w, r, "state_mismatch")
		return
	}

	// Single use: TakeAuthFlow deletes the row inside the same transaction that
	// reads it, so a replayed callback finds nothing.
	flow, err := s.store.TakeAuthFlow(r.Context(), state, s.cfg.OIDC.FlowMaxAge)
	if err != nil {
		s.redirectAuthError(w, r, "state_expired")
		return
	}

	claims, rawIDToken, err := s.oidc.Exchange(
		r.Context(), r.URL.Query().Get("code"), flow.Verifier, flow.Nonce)
	if err != nil {
		log.Warn().Err(err).Msg("code exchange failed")
		s.redirectAuthError(w, r, "exchange_failed")
		return
	}

	if s.cfg.OIDC.RequireVerifiedEmail && !claims.EmailVerified {
		// The local compose stack turns this off, because it has no SMTP
		// service and a self-registered user could therefore never verify
		// (guide §13.6). The code default is on.
		log.Info().Str("subject", claims.Subject).Msg("refused a sign-in with an unverified email")
		s.redirectAuthError(w, r, "email_unverified")
		return
	}

	// Just-in-time provisioning: the first successful sign-in for a subject
	// creates the local record; every later one refreshes the cached claims.
	//
	// The probe before the upsert is only to learn whether this is a first
	// sign-in — UpsertUser cannot report that without returning a second value
	// that every other caller would ignore.
	_, lookupErr := s.store.GetUserBySubject(r.Context(), claims.Issuer, claims.Subject)
	firstSignIn := lookupErr != nil

	user, err := s.store.UpsertUser(
		auditContext(r), claims.Issuer, claims.Subject, claims.Email, claims.DisplayName())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if user.Disabled {
		// Locked out of datadrop without touching the identity provider. The
		// session is never created, so the account cannot act.
		s.redirectAuthError(w, r, "account_disabled")
		return
	}

	value, err := auth.NewSessionValue()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err := s.store.CreateSession(
		auditContext(r), value, user.ID, rawIDToken,
		r.UserAgent(), clientIP(r), s.cfg.OIDC.SessionLifetime,
	); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.setSessionCookie(w, value, int(s.cfg.OIDC.SessionLifetime.Seconds()))

	// The only thing the flow carries across: whether this user was just
	// created, so the SPA can land them in the account workspace rather than
	// wherever they were last. Passed as a query parameter and not stored,
	// because it is true exactly once.
	destination := flow.ReturnTo
	if firstSignIn {
		destination = appendQuery(destination, "first", "1")
	}
	http.Redirect(w, r, destination, http.StatusFound)
}

// handleAuthLogout ends a session.
//
// POST rather than GET specifically so that the CSRF origin check applies: a
// GET /logout can be triggered by any <img src> on any page on the internet,
// which is a real if petty nuisance.
func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	p := auth.FromContext(r.Context())
	if !s.checkOrigin(w, r, p) {
		return
	}

	global := r.URL.Query().Get("global") == "1"
	var idToken string

	if p.Kind == auth.KindSession {
		if session, err := s.store.GetSessionByID(r.Context(), p.SessionID); err == nil {
			idToken = session.IDToken
		}
		if err := s.store.DeleteSession(auditContext(r), p.SessionID); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	s.clearSessionCookie(w)

	// Local sign-out leaves the user signed in AT THE PROVIDER, so clicking
	// "sign in" signs them straight back in with no prompt. That is correct and
	// it surprises people, which is why the tile says so and why the global
	// variant exists.
	if global && s.oidc != nil {
		if target := s.oidc.EndSessionURL(idToken, s.cfg.ExternalURL+"/ui/"); target != "" {
			http.Redirect(w, r, target, http.StatusFound)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) oidcConfigured(w http.ResponseWriter, r *http.Request) bool {
	if s.cfg.Auth != AuthOIDC || s.oidc == nil {
		writeProblem(w, r, http.StatusNotFound, CodeNotFound,
			"this server is not configured for OIDC sign-in")
		return false
	}
	return true
}

// redirectAuthError sends the browser back to the SPA with a code it can render
// in its own words.
func (s *Server) redirectAuthError(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, appendQuery(webuiPath, "auth_error", code), http.StatusFound)
}

const webuiPath = "/ui/"

// safeReturnPath validates the post-sign-in destination.
//
// An unvalidated return parameter is an open redirect, and an open redirect on
// a login endpoint is a phishing primitive: an attacker sends a victim to our
// real sign-in page and receives them, authenticated, on their own site. So:
// a path on this origin, or nothing.
func safeReturnPath(raw string) string {
	if raw == "" {
		return webuiPath
	}
	// "//evil.example" is protocol-relative and parses as a host, and a value
	// containing a scheme is obviously off-origin. Both become the default,
	// silently — an invalid return is not worth an error page.
	if !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") {
		return webuiPath
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" {
		return webuiPath
	}
	return raw
}

func appendQuery(path, key, value string) string {
	separator := "?"
	if strings.Contains(path, "?") {
		separator = "&"
	}
	return path + separator + url.QueryEscape(key) + "=" + url.QueryEscape(value)
}

// clientIP records who signed in, for the "your sessions" list.
//
// Deliberately does NOT trust X-Forwarded-For: behind an untrusted proxy that
// header is attacker-controlled, and a session list that confidently shows a
// forged address is worse than one that shows the proxy's.
func clientIP(r *http.Request) string {
	host, _, found := strings.Cut(r.RemoteAddr, ":")
	if !found {
		return r.RemoteAddr
	}
	return host
}
