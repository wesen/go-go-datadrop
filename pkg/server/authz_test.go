package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

const testExternalURL = "http://datadrop.localhost:7070"

// newOIDCServer builds a server in oidc mode with a root token still set, which
// is the compose stack's configuration and the one that exercises all three
// principal kinds in one process.
func newOIDCServer(t *testing.T) *Server {
	t.Helper()
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

	srv, err := New(Config{
		Addr:        "127.0.0.1:0",
		Auth:        AuthOIDC,
		Token:       testToken,
		ExternalURL: testExternalURL,
		OIDC: OIDCConfig{
			Issuer:   "http://zitadel.localhost:17070",
			ClientID: "test-client",
		},
	}, st, blobs)
	if err != nil {
		t.Fatalf("server.New: %v", err)
	}
	return srv
}

// signIn provisions a user and a session, returning the raw cookie value.
func signIn(t *testing.T, srv *Server, subject, email string) (datadrop.User, string) {
	t.Helper()
	ctx := context.Background()

	user, err := srv.store.UpsertUser(ctx, "https://idp.example/", subject, email, email)
	if err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	value, err := auth.NewSessionValue()
	if err != nil {
		t.Fatalf("NewSessionValue: %v", err)
	}
	if _, err := srv.store.CreateSession(ctx, value, user.ID, "", "", "", time.Hour); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	return user, value
}

func mintToken(t *testing.T, srv *Server, userID string, scopes ...auth.Scope) string {
	t.Helper()
	created, err := srv.store.CreateAPIToken(context.Background(), userID, "test", scopes, nil)
	if err != nil {
		t.Fatalf("CreateAPIToken: %v", err)
	}
	return created.Token
}

// credential describes how a request authenticates.
type credential struct {
	bearer string
	cookie string
}

func (c credential) apply(req *http.Request) {
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	if c.cookie != "" {
		req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: c.cookie})
		// A browser sends Origin on unsafe requests. Supplying it here means
		// these tests exercise the authorization rules rather than tripping
		// over the CSRF check; TestCSRF covers the check itself.
		req.Header.Set("Origin", testExternalURL)
	}
}

func do(t *testing.T, srv *Server, method, path string, c credential, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	c.apply(req)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestHTTPAuthorizationMatrix is guide §17.2 at the HTTP layer: the same rules
// the pure tests in pkg/auth cover, but reached through real handlers, real
// membership rows, and real credentials.
func TestHTTPAuthorizationMatrix(t *testing.T) {
	srv := newOIDCServer(t)
	ctx := context.Background()

	owner, ownerCookie := signIn(t, srv, "sub-owner", "owner@example.org")
	writer, writerCookie := signIn(t, srv, "sub-writer", "writer@example.org")
	reader, readerCookie := signIn(t, srv, "sub-reader", "reader@example.org")
	_, strangerCookie := signIn(t, srv, "sub-stranger", "stranger@example.org")

	for _, d := range []datadrop.Drop{
		{Name: "private", OwnerID: owner.ID},
		{Name: "open", OwnerID: owner.ID, PublicRead: true},
		{Name: "legacy"}, // unowned: what migration 0003 leaves behind
	} {
		if _, err := srv.store.CreateDrop(ctx, d); err != nil {
			t.Fatalf("create %q: %v", d.Name, err)
		}
	}
	if err := srv.store.SetMember(ctx, "private", writer.ID, auth.RoleWriter, owner.ID); err != nil {
		t.Fatalf("add writer: %v", err)
	}
	if err := srv.store.SetMember(ctx, "private", reader.ID, auth.RoleReader, owner.ID); err != nil {
		t.Fatalf("add reader: %v", err)
	}

	ownerReadToken := mintToken(t, srv, owner.ID, auth.ScopeDropsRead)
	ownerWriteToken := mintToken(t, srv, owner.ID, auth.ScopeDropsWrite)

	cases := []struct {
		name   string
		method string
		path   string
		cred   credential
		body   string
		want   int
	}{
		// Reads.
		{"owner reads private", "GET", "/v1/drops/private", credential{cookie: ownerCookie}, "", 200},
		{"writer reads private", "GET", "/v1/drops/private", credential{cookie: writerCookie}, "", 200},
		{"reader reads private", "GET", "/v1/drops/private", credential{cookie: readerCookie}, "", 200},
		{"stranger cannot read private", "GET", "/v1/drops/private", credential{cookie: strangerCookie}, "", 403},
		{"anonymous cannot read private", "GET", "/v1/drops/private", credential{}, "", 401},
		{"anonymous reads open", "GET", "/v1/drops/open", credential{}, "", 200},
		{"stranger reads open", "GET", "/v1/drops/open", credential{cookie: strangerCookie}, "", 200},

		// Unowned is not unprotected.
		{"stranger cannot read legacy", "GET", "/v1/drops/legacy", credential{cookie: strangerCookie}, "", 403},
		{"root reads legacy", "GET", "/v1/drops/legacy", credential{bearer: testToken}, "", 200},

		// Writes.
		{"writer appends", "POST", "/v1/drops/private/events", credential{cookie: writerCookie}, `{"t":1}`, 201},
		{"reader cannot append", "POST", "/v1/drops/private/events", credential{cookie: readerCookie}, `{"t":1}`, 403},
		{"stranger cannot append", "POST", "/v1/drops/private/events", credential{cookie: strangerCookie}, `{"t":1}`, 403},
		{"anonymous cannot append to open", "POST", "/v1/drops/open/events", credential{}, `{"t":1}`, 401},

		// DR-24: a credential narrows, it never grants.
		{"owner's read-only token cannot append", "POST", "/v1/drops/private/events",
			credential{bearer: ownerReadToken}, `{"t":1}`, 403},
		{"owner's write token appends", "POST", "/v1/drops/private/events",
			credential{bearer: ownerWriteToken}, `{"t":1}`, 201},

		// Admin-only operations.
		{"writer cannot delete a version", "DELETE", "/v1/drops/private/datasets/d/versions/1",
			credential{cookie: writerCookie}, "", 403},
		{"writer cannot change membership", "PUT", "/v1/drops/private/members/" + reader.ID,
			credential{cookie: writerCookie}, `{"role":"admin"}`, 403},
		{"owner changes membership", "PUT", "/v1/drops/private/members/" + reader.ID,
			credential{cookie: ownerCookie}, `{"role":"writer"}`, 204},

		// A nonexistent drop must not tell an anonymous caller it is missing.
		{"anonymous gets 401 for a nonexistent drop", "GET", "/v1/drops/nope", credential{}, "", 401},
		{"a user gets 404 for a nonexistent drop", "GET", "/v1/drops/nope",
			credential{cookie: strangerCookie}, "", 404},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := do(t, srv, c.method, c.path, c.cred, c.body)
			if rec.Code != c.want {
				t.Errorf("%s %s = %d, want %d\nbody: %s",
					c.method, c.path, rec.Code, c.want, rec.Body.String())
			}
		})
	}
}

func TestListDropsIsFilteredPerCaller(t *testing.T) {
	srv := newOIDCServer(t)
	ctx := context.Background()

	owner, ownerCookie := signIn(t, srv, "sub-lo", "lo@example.org")
	_, strangerCookie := signIn(t, srv, "sub-ls", "ls@example.org")

	for _, d := range []datadrop.Drop{
		{Name: "mine", OwnerID: owner.ID},
		{Name: "shared-openly", OwnerID: owner.ID, PublicRead: true},
	} {
		if _, err := srv.store.CreateDrop(ctx, d); err != nil {
			t.Fatalf("create %q: %v", d.Name, err)
		}
	}

	names := func(c credential) []string {
		rec := do(t, srv, "GET", "/v1/drops", c, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("list = %d: %s", rec.Code, rec.Body.String())
		}
		var body struct {
			Drops []datadrop.Drop `json:"drops"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		out := []string{}
		for _, d := range body.Drops {
			out = append(out, d.Name+":"+d.YourRole)
		}
		return out
	}

	if got := names(credential{cookie: ownerCookie}); len(got) != 2 {
		t.Errorf("owner sees %v, want both drops", got)
	}
	if got := names(credential{cookie: strangerCookie}); len(got) != 1 || got[0] != "shared-openly:reader" {
		t.Errorf("stranger sees %v, want only the public drop as reader", got)
	}
	if got := names(credential{}); len(got) != 1 || got[0] != "shared-openly:reader" {
		t.Errorf("anonymous sees %v, want only the public drop", got)
	}
}

// TestCSRFCoversEveryMutatingRoute enumerates the routes and fires each with a
// session cookie and a foreign Origin.
//
// A change-detector by design: the desired behaviour when someone adds a
// mutating endpoint that skips the check is that this test fails and a human
// looks. It is the control most likely to be forgotten (guide §8.5).
func TestCSRFCoversEveryMutatingRoute(t *testing.T) {
	srv := newOIDCServer(t)
	ctx := context.Background()

	owner, cookie := signIn(t, srv, "sub-csrf", "csrf@example.org")
	if _, err := srv.store.CreateDrop(ctx, datadrop.Drop{Name: "lab", OwnerID: owner.ID}); err != nil {
		t.Fatalf("create drop: %v", err)
	}

	routes := []struct{ method, path string }{
		{"POST", "/v1/drops"},
		{"POST", "/v1/drops/lab/events"},
		{"PUT", "/v1/drops/lab/schemas/events"},
		{"POST", "/v1/drops/lab/datasets/d/versions"},
		{"PUT", "/v1/drops/lab/datasets/d/data"},
		{"PUT", "/v1/drops/lab/datasets/d/versions/1/files/a.csv"},
		{"POST", "/v1/drops/lab/datasets/d/versions/1/commit"},
		{"POST", "/v1/drops/lab/datasets/d/versions/1/import"},
		{"DELETE", "/v1/drops/lab/datasets/d/versions/1"},
		{"POST", "/v1/blobs/gc"},
		{"POST", "/v1/me/tokens"},
		{"DELETE", "/v1/me/tokens/whatever"},
		{"DELETE", "/v1/me/sessions/whatever"},
		{"PUT", "/v1/drops/lab/members/usr_x"},
		{"DELETE", "/v1/drops/lab/members/usr_x"},
		{"POST", "/v1/drops/lab/claim"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader(`{}`))
			req.Header.Set("Content-Type", "application/json")
			req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: cookie})
			req.Header.Set("Origin", "https://evil.example")

			rec := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rec, req)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403\nbody: %s", rec.Code, rec.Body.String())
			}
			var problem Problem
			if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if problem.Code != CodeCrossOrigin {
				t.Fatalf("code = %q, want %q — this route reached its handler "+
					"without passing the origin check", problem.Code, CodeCrossOrigin)
			}
		})
	}
}

func TestCSRFDoesNotApplyToBearerCredentials(t *testing.T) {
	// A bearer token is not ambient: it has to be deliberately attached, so a
	// page on another site cannot cause one to be sent. Applying the origin
	// check to it would break every CLI and CI client for no gain.
	srv := newOIDCServer(t)
	ctx := context.Background()

	owner, _ := signIn(t, srv, "sub-bearer", "b@example.org")
	if _, err := srv.store.CreateDrop(ctx, datadrop.Drop{Name: "lab", OwnerID: owner.ID}); err != nil {
		t.Fatalf("create drop: %v", err)
	}
	token := mintToken(t, srv, owner.ID, auth.ScopeDropsWrite)

	req := httptest.NewRequest("POST", "/v1/drops/lab/events", strings.NewReader(`{"t":1}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "https://evil.example")

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
}

func TestCSRFDoesNotApplyToReads(t *testing.T) {
	srv := newOIDCServer(t)
	ctx := context.Background()
	owner, cookie := signIn(t, srv, "sub-read", "r@example.org")
	if _, err := srv.store.CreateDrop(ctx, datadrop.Drop{Name: "lab", OwnerID: owner.ID}); err != nil {
		t.Fatalf("create drop: %v", err)
	}

	req := httptest.NewRequest("GET", "/v1/drops/lab", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: cookie})
	req.Header.Set("Origin", "https://evil.example")

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	// A cross-origin GET cannot be *read* by the attacker's page anyway, and
	// blocking it would break ordinary top-level navigation to the workbench.
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestMeReportsThePrincipal(t *testing.T) {
	srv := newOIDCServer(t)
	user, cookie := signIn(t, srv, "sub-me", "me@example.org")

	decode := func(c credential) MeResponse {
		rec := do(t, srv, "GET", "/v1/me", c, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("/v1/me = %d: %s", rec.Code, rec.Body.String())
		}
		var body MeResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return body
	}

	// Anonymous gets an answer, not a 401: the sign-in screen needs this.
	anon := decode(credential{})
	if anon.Authenticated || anon.AuthMode != AuthOIDC || !anon.SignupEnabled {
		t.Errorf("anonymous /v1/me = %+v", anon)
	}
	if anon.Provider == nil || anon.Provider.SignUpURL == "" {
		t.Error("anonymous /v1/me carries no provider links, so the tile cannot render a signup button")
	}

	signed := decode(credential{cookie: cookie})
	if !signed.Authenticated || signed.Kind != "session" || signed.User == nil {
		t.Fatalf("signed-in /v1/me = %+v", signed)
	}
	if signed.User.ID != user.ID {
		t.Errorf("user id = %q, want %q", signed.User.ID, user.ID)
	}
	if signed.User.Subject != "" {
		t.Error("the OIDC subject was echoed to the client; nothing outside the server needs it")
	}

	tokenPrincipal := decode(credential{bearer: mintToken(t, srv, user.ID, auth.ScopeDropsRead)})
	if tokenPrincipal.Kind != "token" || tokenPrincipal.TokenID == "" {
		t.Errorf("token /v1/me = %+v", tokenPrincipal)
	}
}

func TestATokenCannotMintAToken(t *testing.T) {
	// Without this rule revocation stops working: revoke the leaked credential
	// and its offspring survive, with no way to enumerate what it created.
	srv := newOIDCServer(t)
	user, cookie := signIn(t, srv, "sub-mint", "mint@example.org")
	token := mintToken(t, srv, user.ID, auth.ScopeAdmin)

	body := `{"name":"child","scopes":["drops:read"]}`
	if rec := do(t, srv, "POST", "/v1/me/tokens", credential{bearer: token}, body); rec.Code != 403 {
		t.Fatalf("a token minted a token: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(t, srv, "POST", "/v1/me/tokens", credential{cookie: cookie}, body); rec.Code != 201 {
		t.Fatalf("a session could not mint a token: %d %s", rec.Code, rec.Body.String())
	}
}

func TestTokenListingNeverCarriesASecret(t *testing.T) {
	srv := newOIDCServer(t)
	user, cookie := signIn(t, srv, "sub-secret", "s@example.org")

	rec := do(t, srv, "POST", "/v1/me/tokens", credential{cookie: cookie},
		`{"name":"ci","scopes":["drops:write"],"expires_in":"90d"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("mint: %d %s", rec.Code, rec.Body.String())
	}
	var created datadrop.CreateTokenResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.HasPrefix(created.Token, auth.TokenPrefix) {
		t.Fatalf("mint response carried no usable token: %q", created.Token)
	}
	if created.ExpiresAt == nil {
		t.Error("expires_in was ignored")
	}

	// The one response that carries a secret has been consumed. No other may.
	listed := do(t, srv, "GET", "/v1/me/tokens", credential{cookie: cookie}, "")
	if strings.Contains(listed.Body.String(), auth.TokenPrefix) {
		t.Fatalf("a token secret appeared in a listing: %s", listed.Body.String())
	}
	if !strings.Contains(listed.Body.String(), created.ID) {
		t.Errorf("the listing does not mention the token id: %s", listed.Body.String())
	}
	_ = user
}

func TestClaimingAnUnownedDrop(t *testing.T) {
	srv := newOIDCServer(t)
	ctx := context.Background()
	_, firstCookie := signIn(t, srv, "sub-c1", "c1@example.org")
	_, secondCookie := signIn(t, srv, "sub-c2", "c2@example.org")

	if _, err := srv.store.CreateDrop(ctx, datadrop.Drop{Name: "legacy"}); err != nil {
		t.Fatalf("create: %v", err)
	}

	if rec := do(t, srv, "POST", "/v1/drops/legacy/claim", credential{cookie: firstCookie}, ""); rec.Code != 200 {
		t.Fatalf("first claim = %d: %s", rec.Code, rec.Body.String())
	}
	// The claimant can now read it; the other user still cannot.
	if rec := do(t, srv, "GET", "/v1/drops/legacy", credential{cookie: firstCookie}, ""); rec.Code != 200 {
		t.Errorf("claimant cannot read their own drop: %d", rec.Code)
	}
	if rec := do(t, srv, "GET", "/v1/drops/legacy", credential{cookie: secondCookie}, ""); rec.Code != 403 {
		t.Errorf("a claim leaked access to someone else: %d", rec.Code)
	}
	if rec := do(t, srv, "POST", "/v1/drops/legacy/claim", credential{cookie: secondCookie}, ""); rec.Code != 409 {
		t.Errorf("second claim = %d, want 409", rec.Code)
	}
}

func TestTokenModeIsUnchanged(t *testing.T) {
	// The pre-DATADROP-5 contract, still honoured: a server configured with
	// only a token behaves exactly as it did, and nothing about users, sessions
	// or membership intrudes. This is what keeps the CLI smoke tests free of a
	// browser dependency (DR-26).
	srv := newTestServer(t)
	if srv.cfg.Auth != AuthToken {
		t.Fatalf("auth mode = %q, want %q by inference from a configured token", srv.cfg.Auth, AuthToken)
	}

	if rec := do(t, srv, "POST", "/v1/drops", credential{bearer: testToken},
		`{"name":"lab"}`); rec.Code != 201 {
		t.Fatalf("create with the token = %d: %s", rec.Code, rec.Body.String())
	}
	if rec := do(t, srv, "POST", "/v1/drops", credential{}, `{"name":"nope"}`); rec.Code != 401 {
		t.Errorf("create without a credential = %d, want 401", rec.Code)
	}
	// A ddp_-shaped bearer is not even looked up in token mode: there are no
	// users, so there is nothing it could resolve to.
	if rec := do(t, srv, "POST", "/v1/drops", credential{bearer: "ddp_aaaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
		`{"name":"nope"}`); rec.Code != 401 {
		t.Errorf("create with a bogus ddp_ token = %d, want 401", rec.Code)
	}
}

func TestAuthNoneRejectsNothing(t *testing.T) {
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
	srv, err := New(Config{Addr: "127.0.0.1:0"}, st, blobs)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if srv.cfg.Auth != AuthNone {
		t.Fatalf("auth mode = %q, want %q with no token configured", srv.cfg.Auth, AuthNone)
	}
	if rec := do(t, srv, "POST", "/v1/drops", credential{}, `{"name":"lab"}`); rec.Code != 201 {
		t.Fatalf("open mode refused a write: %d %s", rec.Code, rec.Body.String())
	}
}

func TestNewRejectsTokenModeWithoutAToken(t *testing.T) {
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
	if _, err := New(Config{Auth: AuthToken}, st, blobs); err == nil {
		t.Fatal("token mode with no token was accepted; a server that degrades quietly to open is the worst outcome")
	}
	if _, err := New(Config{Auth: "sudo"}, st, blobs); err == nil {
		t.Fatal("an unknown auth mode was accepted")
	}
}

func TestPotentiallyTrustworthy(t *testing.T) {
	// Governs both the Secure cookie attribute and whether the browser will
	// expose crypto.subtle to the uploader, which is why it is one function.
	cases := map[string]bool{
		"https://datadrop.example":       true,
		"http://localhost:7070":          true,
		"http://datadrop.localhost:7070": true,
		"http://127.0.0.1:7070":          true,
		"http://192.168.1.10:7070":       false,
		"http://datadrop.example":        false,
	}
	for url, want := range cases {
		if got := PotentiallyTrustworthy(url); got != want {
			t.Errorf("PotentiallyTrustworthy(%q) = %v, want %v", url, got, want)
		}
	}
}
