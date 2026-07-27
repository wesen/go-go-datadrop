package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
)

// fakeProvider is the identity provider, in fifteen lines.
//
// This is what the Provider interface exists for. Every failure path in the
// callback handler — a replayed state, a mismatched nonce, a refused exchange,
// an unverified email — is a security property, and not one of them is
// reachable in a test that needs a real provider running. With this, they are
// all one field assignment away.
type fakeProvider struct {
	claims auth.Claims
	// exchangeErr, when set, makes Exchange fail — a cancelled consent, an
	// expired code, a clock skew, all of which look the same from here.
	exchangeErr error
	// lastNonce and lastVerifier record what the login handler sent, so a test
	// can assert PKCE and the nonce are actually in play.
	lastState, lastNonce, lastVerifier string
	lastSignup                         bool
}

func (f *fakeProvider) AuthCodeURL(state, nonce, verifier string, signup bool) string {
	f.lastState, f.lastNonce, f.lastVerifier, f.lastSignup = state, nonce, verifier, signup
	params := url.Values{"state": {state}, "nonce": {nonce}}
	if signup {
		params.Set("prompt", "create")
	}
	return "https://idp.example/authorize?" + params.Encode()
}

func (f *fakeProvider) Exchange(_ context.Context, code, verifier, nonce string) (auth.Claims, string, error) {
	if f.exchangeErr != nil {
		return auth.Claims{}, "", f.exchangeErr
	}
	if code == "" {
		return auth.Claims{}, "", errors.New("no code")
	}
	// The real provider verifies these inside the ID token; the fake asserts
	// the handler actually passed through what it stored.
	if verifier != f.lastVerifier {
		return auth.Claims{}, "", errors.New("pkce verifier mismatch")
	}
	if nonce != f.lastNonce {
		return auth.Claims{}, "", errors.New("nonce mismatch")
	}
	return f.claims, "raw-id-token", nil
}

func (f *fakeProvider) EndSessionURL(idToken, postLogoutRedirect string) string {
	return "https://idp.example/end_session?id_token_hint=" + url.QueryEscape(idToken) +
		"&post_logout_redirect_uri=" + url.QueryEscape(postLogoutRedirect)
}

func newSignInServer(t *testing.T) (*Server, *fakeProvider) {
	t.Helper()
	srv := newOIDCServer(t)
	provider := &fakeProvider{claims: auth.Claims{
		Issuer:        "https://idp.example/",
		Subject:       "sub-ada",
		Email:         "ada@example.org",
		EmailVerified: true,
		Name:          "Ada Lovelace",
	}}
	srv.SetOIDCProvider(provider)
	return srv, provider
}

// startSignIn performs GET /v1/auth/login and returns the flow cookie.
func startSignIn(t *testing.T, srv *Server, query string) *http.Cookie {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/v1/auth/login"+query, nil))
	if rec.Code != http.StatusFound {
		t.Fatalf("login = %d, want 302: %s", rec.Code, rec.Body.String())
	}
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == FlowCookieName {
			return cookie
		}
	}
	t.Fatal("login set no flow cookie, so the callback cannot be bound to this browser")
	return nil
}

func callback(t *testing.T, srv *Server, query string, flow *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("GET", "/v1/auth/callback"+query, nil)
	if flow != nil {
		req.AddCookie(flow)
	}
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestSignInProvisionsAUserAndASession(t *testing.T) {
	srv, provider := newSignInServer(t)

	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	if rec.Code != http.StatusFound {
		t.Fatalf("callback = %d: %s", rec.Code, rec.Body.String())
	}
	location := rec.Header().Get("Location")
	if !strings.HasPrefix(location, "/ui/") {
		t.Errorf("landed at %q, want the workbench", location)
	}
	// A first sign-in and a signup are the same code path; the only thing that
	// crosses is this bit, so the SPA can land a new user in the account space.
	if !strings.Contains(location, "first=1") {
		t.Errorf("a first sign-in did not carry first=1: %q", location)
	}

	var session *http.Cookie
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == SessionCookieName && cookie.Value != "" {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("no session cookie was set")
	}
	if !session.HttpOnly {
		t.Error("the session cookie is readable by page JavaScript")
	}
	if session.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", session.SameSite)
	}

	// The user exists, keyed on (issuer, subject).
	user, err := srv.store.GetUserBySubject(context.Background(), "https://idp.example/", "sub-ada")
	if err != nil {
		t.Fatalf("the sign-in provisioned no user: %v", err)
	}
	if user.Email != "ada@example.org" || user.Name != "Ada Lovelace" {
		t.Errorf("claims were not stored: %+v", user)
	}

	// And the session actually authenticates.
	me := do(t, srv, "GET", "/v1/me", credential{cookie: session.Value}, "")
	if !strings.Contains(me.Body.String(), user.ID) {
		t.Errorf("the new session does not resolve: %s", me.Body.String())
	}
}

func TestSecondSignInDoesNotDuplicateOrClaimFirst(t *testing.T) {
	srv, provider := newSignInServer(t)

	flow := startSignIn(t, srv, "")
	callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	provider.claims.Name = "A. Lovelace"
	flow = startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=def&state="+provider.lastState, flow)

	if strings.Contains(rec.Header().Get("Location"), "first=1") {
		t.Error("a returning user was told they were new")
	}
	user, err := srv.store.GetUserBySubject(context.Background(), "https://idp.example/", "sub-ada")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if user.Name != "A. Lovelace" {
		t.Errorf("claims were not refreshed on the second sign-in: %+v", user)
	}
}

func TestSignupAsksTheProviderForRegistration(t *testing.T) {
	srv, provider := newSignInServer(t)
	startSignIn(t, srv, "?intent=signup")
	if !provider.lastSignup {
		t.Error("intent=signup did not reach the provider, so the login form shows instead of the register form")
	}
	startSignIn(t, srv, "")
	if provider.lastSignup {
		t.Error("a plain sign-in asked for the registration form")
	}
}

func TestCallbackRejectsAReplayedState(t *testing.T) {
	// A state that can be redeemed twice is a replayable authentication.
	srv, provider := newSignInServer(t)

	flow := startSignIn(t, srv, "")
	query := "?code=abc&state=" + provider.lastState
	if rec := callback(t, srv, query, flow); rec.Code != http.StatusFound ||
		strings.Contains(rec.Header().Get("Location"), "auth_error") {
		t.Fatalf("the first callback should succeed: %q", rec.Header().Get("Location"))
	}

	rec := callback(t, srv, query, flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=state_expired") {
		t.Fatalf("a replayed state was accepted: %q", rec.Header().Get("Location"))
	}
}

func TestCallbackRequiresTheFlowCookie(t *testing.T) {
	// The row alone would let anyone who observes a callback URL redeem it.
	// Requiring the cookie too means the callback must arrive in the browser
	// that started the flow — which is what makes login itself un-CSRF-able.
	srv, provider := newSignInServer(t)
	startSignIn(t, srv, "")

	rec := callback(t, srv, "?code=abc&state="+provider.lastState, nil)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=state_mismatch") {
		t.Fatalf("a callback with no flow cookie was accepted: %q", rec.Header().Get("Location"))
	}

	other := &http.Cookie{Name: FlowCookieName, Value: "someone-elses-state"}
	rec = callback(t, srv, "?code=abc&state="+provider.lastState, other)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=state_mismatch") {
		t.Fatalf("a callback with a foreign flow cookie was accepted: %q", rec.Header().Get("Location"))
	}
}

func TestCallbackSurfacesAProviderRefusal(t *testing.T) {
	srv, _ := newSignInServer(t)
	flow := startSignIn(t, srv, "")

	// The provider's own words are never echoed; only our code is.
	rec := callback(t, srv, "?error=access_denied&error_description=%3Cscript%3E", flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=provider_refused") {
		t.Fatalf("location = %q", rec.Header().Get("Location"))
	}
	if strings.Contains(rec.Header().Get("Location"), "script") {
		t.Error("provider-supplied text was reflected into the redirect")
	}
}

func TestCallbackRejectsAFailedExchange(t *testing.T) {
	srv, provider := newSignInServer(t)
	flow := startSignIn(t, srv, "")
	provider.exchangeErr = errors.New("id token signature invalid")

	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=exchange_failed") {
		t.Fatalf("location = %q", rec.Header().Get("Location"))
	}
	if len(rec.Result().Cookies()) > 0 {
		for _, cookie := range rec.Result().Cookies() {
			if cookie.Name == SessionCookieName && cookie.Value != "" {
				t.Fatal("a failed exchange set a session cookie")
			}
		}
	}
}

func TestUnverifiedEmailIsRefusedByDefault(t *testing.T) {
	srv, provider := newSignInServer(t)
	provider.claims.EmailVerified = false

	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=email_unverified") {
		t.Fatalf("location = %q", rec.Header().Get("Location"))
	}
	if _, err := srv.store.GetUserBySubject(
		context.Background(), "https://idp.example/", "sub-ada"); err == nil {
		t.Error("a refused sign-in still provisioned a user")
	}
}

func TestUnverifiedEmailOptOutAllowsSignIn(t *testing.T) {
	srv, provider := newSignInServer(t)
	provider.claims.EmailVerified = false

	// The local compose stack has no SMTP; this explicit opt-out is what lets a
	// self-registered user sign in there while exported server.Config remains
	// safe when the field is omitted.
	srv.cfg.OIDC.RequireVerifiedEmail = false
	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if strings.Contains(rec.Header().Get("Location"), "auth_error") {
		t.Fatalf("with the check off, the sign-in should proceed: %q", rec.Header().Get("Location"))
	}
}

func TestUnverifiedEmailIsRefusedWhenRequired(t *testing.T) {
	srv, provider := newSignInServer(t)
	srv.cfg.OIDC.RequireVerifiedEmail = true
	provider.claims.EmailVerified = false

	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=email_unverified") {
		t.Fatalf("location = %q", rec.Header().Get("Location"))
	}
	if _, err := srv.store.GetUserBySubject(
		context.Background(), "https://idp.example/", "sub-ada"); err == nil {
		t.Error("a refused sign-in still provisioned a user")
	}

	// And the local stack's escape hatch works, because the compose has no SMTP
	// and a self-registered user could otherwise never verify (guide §13.6).
	srv.cfg.OIDC.RequireVerifiedEmail = false
	flow = startSignIn(t, srv, "")
	rec = callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if strings.Contains(rec.Header().Get("Location"), "auth_error") {
		t.Fatalf("with the check off, the sign-in should proceed: %q", rec.Header().Get("Location"))
	}
}

func TestDisabledAccountCannotSignIn(t *testing.T) {
	srv, provider := newSignInServer(t)

	flow := startSignIn(t, srv, "")
	callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	user, err := srv.store.GetUserBySubject(context.Background(), "https://idp.example/", "sub-ada")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if err := srv.store.SetUserDisabled(context.Background(), user.ID, true); err != nil {
		t.Fatalf("disable: %v", err)
	}

	flow = startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)
	if !strings.Contains(rec.Header().Get("Location"), "auth_error=account_disabled") {
		t.Fatalf("a disabled account signed in: %q", rec.Header().Get("Location"))
	}
}

func TestReturnPathCannotLeaveTheOrigin(t *testing.T) {
	// An open redirect on a login endpoint is a phishing primitive: an attacker
	// sends a victim to our real sign-in page and receives them, authenticated,
	// on their own site.
	cases := map[string]string{
		"":                      "/ui/",
		"/ui/?space=account":    "/ui/?space=account",
		"//evil.example":        "/ui/",
		"https://evil.example":  "/ui/",
		"http://evil.example/x": "/ui/",
		"javascript:alert(1)":   "/ui/",
		"/\\evil.example":       "/\\evil.example", // a path, not a host
	}
	for input, want := range cases {
		if got := safeReturnPath(input); got != want {
			t.Errorf("safeReturnPath(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSignInHonoursTheReturnPath(t *testing.T) {
	srv, provider := newSignInServer(t)
	flow := startSignIn(t, srv, "?return=%2Fui%2F%3Fspace%3Daccount")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	if !strings.HasPrefix(rec.Header().Get("Location"), "/ui/?space=account") {
		t.Errorf("landed at %q", rec.Header().Get("Location"))
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	srv, provider := newSignInServer(t)
	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	var session string
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == SessionCookieName {
			session = cookie.Value
		}
	}

	out := do(t, srv, "POST", "/v1/auth/logout", credential{cookie: session}, "")
	if out.Code != http.StatusNoContent {
		t.Fatalf("logout = %d: %s", out.Code, out.Body.String())
	}

	// Deleting the row is what ends it. Clearing the cookie alone would leave a
	// working credential in the hands of anyone who had copied it.
	me := do(t, srv, "GET", "/v1/me", credential{cookie: session}, "")
	if strings.Contains(me.Body.String(), `"authenticated":true`) {
		t.Fatalf("the session still works after sign-out: %s", me.Body.String())
	}
}

func TestGlobalLogoutRedirectsToTheProvider(t *testing.T) {
	srv, provider := newSignInServer(t)
	flow := startSignIn(t, srv, "")
	rec := callback(t, srv, "?code=abc&state="+provider.lastState, flow)

	var session string
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == SessionCookieName {
			session = cookie.Value
		}
	}

	out := do(t, srv, "POST", "/v1/auth/logout?global=1", credential{cookie: session}, "")
	if out.Code != http.StatusFound {
		t.Fatalf("global logout = %d, want 302: %s", out.Code, out.Body.String())
	}
	location := out.Header().Get("Location")
	if !strings.Contains(location, "end_session") || !strings.Contains(location, "id_token_hint") {
		t.Errorf("location = %q; the id_token_hint is what lets the provider end its own session", location)
	}
}

func TestAuthEndpointsAreAbsentWithoutOIDC(t *testing.T) {
	// A token-mode server must not advertise a sign-in it cannot perform.
	srv := newTestServer(t)
	for _, path := range []string{"/v1/auth/login", "/v1/auth/callback"} {
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d, want 404 in token mode", path, rec.Code)
		}
	}
}
