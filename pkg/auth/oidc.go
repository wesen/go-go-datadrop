package auth

import (
	"context"
	"net/url"
	"strings"
	"time"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/pkg/errors"
	"golang.org/x/oauth2"
)

// Claims is what datadrop reads out of an ID token.
//
// Deliberately five fields. Everything else the provider knows about a person
// stays with the provider, because duplicating it here would make datadrop the
// second place a name lives and the first place it goes stale.
type Claims struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

// DisplayName picks the best available label. Never empty.
func (c Claims) DisplayName() string {
	if name := strings.TrimSpace(c.Name); name != "" {
		return name
	}
	if email := strings.TrimSpace(c.Email); email != "" {
		if local, _, found := strings.Cut(email, "@"); found && local != "" {
			return local
		}
		return email
	}
	return "(unnamed)"
}

// Provider is everything an OIDC relying party needs, in three methods.
//
// An interface rather than a concrete type because it is the only part of
// pkg/auth that touches the network. Behind it the package stays pure, and the
// server's tests substitute a fifteen-line fake — which is what makes the
// callback handler's failure paths (bad state, replayed state, wrong nonce,
// expired token, unverified email) worth testing at all. Every one of those is
// a security property, and none of them is reachable in a test that needs a
// real identity provider.
type Provider interface {
	// AuthCodeURL builds the redirect that starts a sign-in. signup asks the
	// provider to show its registration form instead of its login form.
	AuthCodeURL(state, nonce, verifier string, signup bool) string
	// Exchange redeems an authorization code, verifies the ID token, and
	// returns its claims plus the raw token (kept only as a logout hint).
	Exchange(ctx context.Context, code, verifier, nonce string) (Claims, string, error)
	// EndSessionURL is where to send a browser for RP-initiated logout, or ""
	// when the provider does not advertise one.
	EndSessionURL(idToken, postLogoutRedirect string) string
}

// oidcProvider is the real thing: discovery, JWKS verification, code exchange.
type oidcProvider struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    oauth2.Config
	// endSession is read out of the discovery document rather than assumed.
	// Zitadel serves it at /oidc/v1/end_session, but hard-coding a path is
	// exactly the coupling DR-18 exists to avoid.
	endSession string
}

var _ Provider = (*oidcProvider)(nil)

// DiscoverProvider fetches the issuer's discovery document and builds a relying
// party from it.
//
// Nothing here hard-codes an endpoint. That is what makes swapping Zitadel for
// Keycloak or Auth0 a configuration change (DR-18), and it is also how a wrong
// issuer URL is caught here, loudly, rather than three steps later at the token
// exchange:
//
//	oidc: issuer did not match the issuer returned by provider,
//	expected "http://zitadel-api:8080" got "http://zitadel.localhost:17070"
//
// If you see that, read guide §13.2 before reaching for
// oidc.InsecureIssuerURLContext — it fixes only the back channel, and the
// browser still has to reach the issuer's hostname.
func DiscoverProvider(
	ctx context.Context, issuer, clientID, clientSecret, redirectURL string, scopes []string,
) (Provider, error) {
	provider, err := oidc.NewProvider(ctx, strings.TrimRight(issuer, "/"))
	if err != nil {
		return nil, errors.Wrapf(err, "auth: OIDC discovery at %s", issuer)
	}

	var extra struct {
		EndSessionEndpoint string `json:"end_session_endpoint"`
	}
	if err := provider.Claims(&extra); err != nil {
		// Not fatal: without it, sign-out is local-only, which is a degraded
		// feature rather than a broken server.
		extra.EndSessionEndpoint = ""
	}

	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}

	return &oidcProvider{
		provider: provider,
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
		oauth: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  redirectURL,
			Scopes:       scopes,
		},
		endSession: extra.EndSessionEndpoint,
	}, nil
}

func (p *oidcProvider) AuthCodeURL(state, nonce, verifier string, signup bool) string {
	opts := []oauth2.AuthCodeOption{
		// PKCE on a confidential client. Not redundant: RFC 9700 recommends it
		// for every client, because it binds the code to the party that
		// requested it independently of the client secret.
		oauth2.S256ChallengeOption(verifier),
		oidc.Nonce(nonce),
	}
	if signup {
		// From the OIDC "Initiating User Registration" extension: show the
		// registration form rather than the login form. This one parameter is
		// the entire difference between signup and sign-in on our side, which
		// is the payoff for putting registration at the provider.
		opts = append(opts, oauth2.SetAuthURLParam("prompt", "create"))
	}
	return p.oauth.AuthCodeURL(state, opts...)
}

func (p *oidcProvider) Exchange(ctx context.Context, code, verifier, nonce string) (Claims, string, error) {
	token, err := p.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Claims{}, "", errors.Wrap(err, "auth: code exchange")
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return Claims{}, "", errors.New("auth: the token response carried no id_token")
	}

	// Verifies the signature against JWKS, plus iss, aud and exp.
	idToken, err := p.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return Claims{}, "", errors.Wrap(err, "auth: verify id token")
	}
	// Not covered by Verify: the nonce binds this token to THIS authentication,
	// which is what defeats replay of a previously issued one.
	if idToken.Nonce != nonce {
		return Claims{}, "", errors.New("auth: id token nonce does not match the request")
	}

	var claims struct {
		Email             string `json:"email"`
		EmailVerified     bool   `json:"email_verified"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return Claims{}, "", errors.Wrap(err, "auth: read id token claims")
	}

	name := claims.Name
	if name == "" {
		name = claims.PreferredUsername
	}

	return Claims{
		Issuer:        idToken.Issuer,
		Subject:       idToken.Subject,
		Email:         claims.Email,
		EmailVerified: claims.EmailVerified,
		Name:          name,
	}, rawIDToken, nil
}

func (p *oidcProvider) EndSessionURL(idToken, postLogoutRedirect string) string {
	if p.endSession == "" {
		return ""
	}
	params := url.Values{}
	if idToken != "" {
		params.Set("id_token_hint", idToken)
	}
	if postLogoutRedirect != "" {
		// The provider will refuse a redirect it does not have registered on
		// the application, which is a very common five-minute confusion. The
		// provisioning script registers it (guide §13.5).
		params.Set("post_logout_redirect_uri", postLogoutRedirect)
	}
	if len(params) == 0 {
		return p.endSession
	}
	return p.endSession + "?" + params.Encode()
}

// DiscoverWithRetry is DiscoverProvider with a bounded retry.
//
// The compose stack starts datadrop as soon as the provisioning job exits, and
// the identity provider may still be finishing its first-boot projections. A
// server that dies because discovery failed once would need a restart policy to
// paper over it; retrying for a minute is simpler and says what it is doing.
func DiscoverWithRetry(
	ctx context.Context, issuer, clientID, clientSecret, redirectURL string,
	scopes []string, attempts int, wait time.Duration,
) (Provider, error) {
	var lastErr error
	for i := 0; i < attempts; i++ {
		provider, err := DiscoverProvider(ctx, issuer, clientID, clientSecret, redirectURL, scopes)
		if err == nil {
			return provider, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(wait):
		}
	}
	return nil, lastErr
}
