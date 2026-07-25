package server

import (
	"net/http"
	"net/url"
	"strings"
)

// Cookie handling, in one place.
//
// Both cookies are HttpOnly and SameSite=Lax, and neither is readable by page
// JavaScript. Lax rather than Strict because the navigation *back* from the
// identity provider is a top-level cross-site GET, and Strict would drop the
// cookie on exactly that request — signing the user out at the moment they
// signed in. Lax is not the CSRF defence; checkOrigin is (guide §8.5).

// clearSessionCookie ends a browser's credential.
//
// The setters that install these cookies land in phase 3 alongside the sign-in
// handlers that use them; clearing is needed sooner, because revoking your own
// session from the profile tile must also drop the cookie.
func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.secureCookies(),
		SameSite: http.SameSiteLaxMode,
		// Negative, not zero: MaxAge=0 means "omit the attribute", which leaves
		// a session cookie in place for the life of the tab.
		MaxAge: -1,
	})
}

// secureCookies reports whether the Secure attribute should be set.
//
// Driven by the configured external URL's scheme rather than by the request,
// because a request arriving over plain HTTP behind a TLS-terminating proxy
// would otherwise drop the attribute on every cookie in production.
func (s *Server) secureCookies() bool {
	return strings.HasPrefix(s.cfg.ExternalURL, "https://")
}

// PotentiallyTrustworthy reports whether a browser treats origin as a secure
// context despite plain HTTP.
//
// This governs two unrelated-looking things, which is why it is one function:
// whether a Secure cookie would work at all, and whether the upload tile can
// reach crypto.subtle to hash files before sending them. The list is from the
// W3C secure-contexts definition: loopback, and anything under .localhost.
func PotentiallyTrustworthy(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if parsed.Scheme == "https" {
		return true
	}
	host := parsed.Hostname()
	return host == "localhost" || strings.HasSuffix(host, ".localhost") ||
		host == "127.0.0.1" || host == "::1"
}
