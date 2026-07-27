package auth_test

import (
	"context"
	"strings"
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
)

func TestMintAndParseToken(t *testing.T) {
	minted, err := auth.MintToken()
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	if !strings.HasPrefix(minted.String, auth.TokenPrefix) {
		t.Errorf("minted token %q lacks the %q prefix that makes a leak greppable",
			minted.String, auth.TokenPrefix)
	}

	id, secret, err := auth.ParseToken(minted.String)
	if err != nil {
		t.Fatalf("parse a token we just minted: %v", err)
	}
	if id != minted.ID {
		t.Errorf("id round trip: got %q want %q", id, minted.ID)
	}
	if !auth.VerifySecret(secret, minted.SecretHash) {
		t.Error("the secret we just minted does not verify against its own hash")
	}
}

func TestTokenSecretIsNotRecoverableFromTheHash(t *testing.T) {
	minted, err := auth.MintToken()
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	// Stated as a test because it is the property the whole one-time-display
	// design rests on: what we persist must not contain the credential.
	if strings.Contains(minted.SecretHash, minted.Secret) {
		t.Fatal("the stored hash contains the secret verbatim")
	}
	if auth.VerifySecret("not-the-secret", minted.SecretHash) {
		t.Fatal("a wrong secret verified")
	}
}

func TestTokensAreDistinct(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 256; i++ {
		minted, err := auth.MintToken()
		if err != nil {
			t.Fatalf("mint %d: %v", i, err)
		}
		if seen[minted.ID] {
			t.Fatalf("duplicate token id %q after %d mints", minted.ID, i)
		}
		seen[minted.ID] = true
	}
}

func TestParseTokenRejectsMalformed(t *testing.T) {
	good, err := auth.MintToken()
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	id, secret, _ := auth.ParseToken(good.String)

	cases := map[string]string{
		"empty":             "",
		"no prefix":         id + "_" + secret,
		"wrong prefix":      "ghp_" + id + "_" + secret,
		"no separator":      auth.TokenPrefix + id + secret,
		"id only":           auth.TokenPrefix + id,
		"short id":          auth.TokenPrefix + "abc_" + secret,
		"short secret":      auth.TokenPrefix + id + "_abc",
		"non base32 id":     auth.TokenPrefix + strings.Repeat("1", 13) + "_" + secret,
		"non base32 secret": auth.TokenPrefix + id + "_" + strings.Repeat("1", 32),
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, err := auth.ParseToken(raw); err == nil {
				t.Errorf("parsed %q, expected an error", raw)
			}
		})
	}
}

func TestParseTokenIsCaseInsensitive(t *testing.T) {
	minted, err := auth.MintToken()
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	// Base32 was chosen partly so that a credential survives being read aloud
	// or pasted through something that changes case.
	upper := auth.TokenPrefix + strings.ToUpper(strings.TrimPrefix(minted.String, auth.TokenPrefix))
	_, secret, err := auth.ParseToken(upper)
	if err != nil {
		t.Fatalf("parse uppercased token: %v", err)
	}
	if !auth.VerifySecret(secret, minted.SecretHash) {
		t.Error("an uppercased token did not verify")
	}
}

func TestScopeAdminImplies(t *testing.T) {
	admin := auth.NewScopeSet(auth.ScopeAdmin)
	for _, scope := range auth.AllScopes {
		if !admin.Has(scope) {
			t.Errorf("admin does not imply %s; a token labelled admin would do the least", scope)
		}
	}
}

func TestScopeRoundTrip(t *testing.T) {
	set := auth.NewScopeSet(auth.ScopeDatasetsWrite, auth.ScopeDropsRead)
	// Stable order, weakest first, regardless of insertion order.
	if got := set.String(); got != "drops:read datasets:write" {
		t.Errorf("String() = %q", got)
	}
	parsed, err := auth.ParseScopes(set.String())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if parsed.String() != set.String() {
		t.Errorf("round trip: %q != %q", parsed.String(), set.String())
	}
}

func TestParseScopesPreservesUnknown(t *testing.T) {
	// A scope written by a newer version and read by an older one must not be
	// silently dropped: dropping it would widen the token by forgetting what it
	// was limited to.
	parsed, err := auth.ParseScopes("drops:read future:scope")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !parsed.Has("future:scope") {
		t.Error("an unknown scope was dropped on parse")
	}
	if parsed.Has(auth.ScopeDropsWrite) {
		t.Error("an unknown scope was treated as a grant")
	}
}

func TestParseScopesRejectsEmpty(t *testing.T) {
	if _, err := auth.ParseScopes("   "); err == nil {
		t.Error("an empty scope string parsed; a credential that can do nothing is a bug in whatever wrote it")
	}
}

func TestValidateScopesRejectsTypos(t *testing.T) {
	if err := auth.ValidateScopes([]auth.Scope{"drops:wrote"}); err == nil {
		t.Error("a typo'd scope was accepted at mint time")
	}
	if err := auth.ValidateScopes(nil); err == nil {
		t.Error("minting with no scopes was accepted")
	}
	if err := auth.ValidateScopes(auth.AllScopes); err != nil {
		t.Errorf("every known scope should validate: %v", err)
	}
}

func TestRoleOrdering(t *testing.T) {
	cases := []struct {
		have, required auth.Role
		want           bool
	}{
		{auth.RoleAdmin, auth.RoleReader, true},
		{auth.RoleAdmin, auth.RoleAdmin, true},
		{auth.RoleWriter, auth.RoleReader, true},
		{auth.RoleWriter, auth.RoleAdmin, false},
		{auth.RoleReader, auth.RoleWriter, false},
		{auth.RoleNone, auth.RoleReader, false},
		// RoleNone is the absence of a role, so it satisfies nothing — not even
		// itself. Without the rank > 0 guard, AtLeast(RoleNone) would be true
		// for a stranger and every read would open.
		{auth.RoleNone, auth.RoleNone, false},
	}
	for _, c := range cases {
		if got := c.have.AtLeast(c.required); got != c.want {
			t.Errorf("Role(%q).AtLeast(%q) = %v, want %v", c.have, c.required, got, c.want)
		}
	}
}

// The fixture for the authorization matrix, mirroring guide §17.2.
//
//	alpha  owns drop A, and is a stranger to nothing
//	beta   writer on A
//	gamma  reader on A
//	delta  no relationship to anything
const (
	alpha = "usr_alpha"
	beta  = "usr_beta"
	gamma = "usr_gamma"
	delta = "usr_delta"
)

func dropA() auth.DropACL {
	return auth.DropACL{
		OwnerID: alpha,
		Members: map[string]auth.Role{beta: auth.RoleWriter, gamma: auth.RoleReader},
	}
}

// dropB is public_read and owned. dropC is unowned and private — every drop
// that predates this ticket.
func dropB() auth.DropACL { return auth.DropACL{OwnerID: alpha, PublicRead: true} }
func dropC() auth.DropACL { return auth.DropACL{} }

func session(user string) auth.Principal {
	return auth.Principal{Kind: auth.KindSession, UserID: user, Scopes: auth.FullScopeSet()}
}

func token(user string, scopes ...auth.Scope) auth.Principal {
	return auth.Principal{
		Kind: auth.KindToken, UserID: user, TokenID: "tok_1",
		Scopes: auth.NewScopeSet(scopes...),
	}
}

func root() auth.Principal {
	return auth.Principal{Kind: auth.KindRoot, Scopes: auth.FullScopeSet()}
}

func TestAuthorizationMatrix(t *testing.T) {
	cases := []struct {
		name      string
		principal auth.Principal
		acl       auth.DropACL
		role      auth.Role
		scope     auth.Scope
		want      bool
	}{
		{"owner appends", session(alpha), dropA(), auth.RoleWriter, auth.ScopeDropsWrite, true},
		{"owner deletes a version", session(alpha), dropA(), auth.RoleAdmin, auth.ScopeDropsWrite, true},
		{"writer appends", session(beta), dropA(), auth.RoleWriter, auth.ScopeDropsWrite, true},
		{"writer cannot delete a version", session(beta), dropA(), auth.RoleAdmin, auth.ScopeDropsWrite, false},
		{"reader reads", session(gamma), dropA(), auth.RoleReader, auth.ScopeDropsRead, true},
		{"reader cannot append", session(gamma), dropA(), auth.RoleWriter, auth.ScopeDropsWrite, false},
		{"stranger cannot read a private drop", session(delta), dropA(), auth.RoleReader, auth.ScopeDropsRead, false},

		{"stranger reads a public drop", session(delta), dropB(), auth.RoleReader, auth.ScopeDropsRead, true},
		{"anonymous reads a public drop", auth.Anonymous(), dropB(), auth.RoleReader, auth.ScopeDropsRead, true},
		{"anonymous cannot read a private drop", auth.Anonymous(), dropA(), auth.RoleReader, auth.ScopeDropsRead, false},
		{"anonymous cannot write a public drop", auth.Anonymous(), dropB(), auth.RoleWriter, auth.ScopeDropsWrite, false},

		// Unowned is not unprotected. This is the row that would silently
		// invert if someone "helpfully" made a NULL owner mean "anyone".
		{"stranger cannot read an unowned drop", session(delta), dropC(), auth.RoleReader, auth.ScopeDropsRead, false},
		{"root reads an unowned drop", root(), dropC(), auth.RoleReader, auth.ScopeDropsRead, true},
		{"root does anything", root(), dropA(), auth.RoleAdmin, auth.ScopeAdmin, true},

		// DR-24: the credential narrows, it never grants.
		{"owner's read-only token cannot append", token(alpha, auth.ScopeDropsRead), dropA(), auth.RoleWriter, auth.ScopeDropsWrite, false},
		{"owner's write token appends", token(alpha, auth.ScopeDropsWrite), dropA(), auth.RoleWriter, auth.ScopeDropsWrite, true},
		{"a stranger's admin-scoped token is still a stranger", token(delta, auth.ScopeAdmin), dropA(), auth.RoleReader, auth.ScopeDropsRead, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := auth.Authorize(c.principal, c.acl, c.role, c.scope); got != c.want {
				t.Errorf("Authorize = %v, want %v (effective role %q)",
					got, c.want, auth.EffectiveRole(c.principal, c.acl))
			}
		})
	}
}

func TestRemovingAMemberNarrowsTheirTokensImmediately(t *testing.T) {
	// DR-24 stated as a test. This is the property an optimiser breaks by
	// caching rights on the token at mint time, at which point revoking
	// membership stops revoking access.
	betaToken := token(beta, auth.ScopeDropsWrite)

	before := dropA()
	if !auth.Authorize(betaToken, before, auth.RoleWriter, auth.ScopeDropsWrite) {
		t.Fatal("a writer's token should be able to append before removal")
	}

	after := dropA()
	delete(after.Members, beta)
	if auth.Authorize(betaToken, after, auth.RoleWriter, auth.ScopeDropsWrite) {
		t.Error("the same token still appends after the member was removed")
	}
}

func TestOwnerCannotBeDemotedByAMembersRow(t *testing.T) {
	acl := dropA()
	acl.Members[alpha] = auth.RoleReader
	if got := auth.EffectiveRole(session(alpha), acl); got != auth.RoleAdmin {
		t.Errorf("owner's effective role = %q, want admin; an owner must not be demotable out of their own drop", got)
	}
}

func TestLabelNeverContainsACredential(t *testing.T) {
	minted, err := auth.MintToken()
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	p := auth.Principal{Kind: auth.KindToken, UserID: alpha, TokenID: minted.ID}
	label := p.Label()
	if strings.Contains(label, minted.Secret) || strings.Contains(label, minted.String) {
		t.Fatalf("audit label %q contains the credential", label)
	}
	if !strings.Contains(label, minted.ID) {
		t.Errorf("audit label %q omits the token id, which is what makes an incident answerable", label)
	}
	if auth.Anonymous().Label() != "" {
		t.Error("anonymous should have an empty audit label")
	}
}

func TestPrincipalContextRoundTrip(t *testing.T) {
	p := session(alpha)
	ctx := auth.WithPrincipal(context.Background(), p)
	if got := auth.FromContext(ctx); got.UserID != alpha || got.Kind != auth.KindSession {
		t.Errorf("round trip lost the principal: %+v", got)
	}
	// A context that never passed the resolver reads as nobody, not as a panic
	// and not as a privileged default.
	if got := auth.FromContext(context.Background()); got.IsAuthenticated() {
		t.Errorf("a bare context yielded an authenticated principal: %+v", got)
	}
}
