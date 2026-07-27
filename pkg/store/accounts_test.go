package store

import (
	"context"
	"testing"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const testIssuer = "https://idp.example/"

func newTestUser(t *testing.T, st *Store, subject, email, name string) datadrop.User {
	t.Helper()
	u, err := st.UpsertUser(context.Background(), testIssuer, subject, email, name)
	if err != nil {
		t.Fatalf("UpsertUser(%q): %v", subject, err)
	}
	return u
}

func TestUpsertUserProvisionsThenRefreshes(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	first, err := st.UpsertUser(ctx, testIssuer, "sub-1", "ada@example.org", "Ada Lovelace")
	if err != nil {
		t.Fatalf("first sign-in: %v", err)
	}
	if first.ID == "" {
		t.Fatal("no local id was minted")
	}

	// A second sign-in with changed claims must refresh, not duplicate.
	second, err := st.UpsertUser(ctx, testIssuer, "sub-1", "ada@newmail.example", "A. Lovelace")
	if err != nil {
		t.Fatalf("second sign-in: %v", err)
	}
	if second.ID != first.ID {
		t.Errorf("a second sign-in minted a new user: %q then %q", first.ID, second.ID)
	}
	if second.Email != "ada@newmail.example" || second.Name != "A. Lovelace" {
		t.Errorf("claims were not refreshed: %+v", second)
	}
	if !second.LastSeenAt.After(first.CreatedAt) && !second.LastSeenAt.Equal(first.CreatedAt) {
		t.Errorf("last_seen_at went backwards: %v then %v", first.CreatedAt, second.LastSeenAt)
	}
}

func TestUpsertUserKeysOnIssuerAndSubject(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	// The same `sub` at a different issuer is a different person. Keying on
	// subject alone would silently merge two accounts the first time a
	// deployment is pointed at a second provider.
	a, err := st.UpsertUser(ctx, "https://idp-a.example/", "shared-sub", "x@a", "A")
	if err != nil {
		t.Fatalf("upsert a: %v", err)
	}
	b, err := st.UpsertUser(ctx, "https://idp-b.example/", "shared-sub", "x@b", "B")
	if err != nil {
		t.Fatalf("upsert b: %v", err)
	}
	if a.ID == b.ID {
		t.Fatal("the same subject at two issuers resolved to one user")
	}

	// And the same address at two providers must NOT merge either.
	c, err := st.UpsertUser(ctx, "https://idp-c.example/", "other-sub", "x@a", "C")
	if err != nil {
		t.Fatalf("upsert c: %v", err)
	}
	if c.ID == a.ID {
		t.Fatal("two users sharing an email address were merged; email must never be a key")
	}
}

func TestFindUserByEmailRefusesAmbiguousMatches(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	if _, err := st.UpsertUser(ctx, "https://idp-a.example/", "sub-a", "shared@example.org", "A"); err != nil {
		t.Fatalf("upsert a: %v", err)
	}
	if _, err := st.UpsertUser(ctx, "https://idp-b.example/", "sub-b", "shared@example.org", "B"); err != nil {
		t.Fatalf("upsert b: %v", err)
	}

	if _, err := st.FindUserByEmail(ctx, "shared@example.org"); !errors.Is(err, ErrConflict) {
		t.Fatalf("FindUserByEmail returned %v, want ErrConflict for duplicate email", err)
	}
}

func TestUserDisplayNameNeverEmpty(t *testing.T) {
	cases := []struct {
		user datadrop.User
		want string
	}{
		{datadrop.User{Name: "Ada Lovelace"}, "Ada Lovelace"},
		{datadrop.User{Email: "ada@example.org"}, "ada"},
		{datadrop.User{Name: "  ", Email: "ada@example.org"}, "ada"},
		{datadrop.User{}, "(unnamed)"},
	}
	for _, c := range cases {
		if got := c.user.DisplayName(); got != c.want {
			t.Errorf("DisplayName(%+v) = %q, want %q", c.user, got, c.want)
		}
	}
}

func TestDeletingAUserRevokesTheirTokens(t *testing.T) {
	// Foreign keys are only enforced when PRAGMA foreign_keys is on. If the DSN
	// ever loses it, every ON DELETE CASCADE in migration 0003 becomes
	// documentation rather than behaviour — and a deleted account's tokens keep
	// authenticating. That is what this test exists to catch.
	st := newTestStore(t)
	ctx := context.Background()

	user := newTestUser(t, st, "sub-doomed", "d@example.org", "Doomed")
	minted, err := st.CreateAPIToken(ctx, user.ID, "ci", []auth.Scope{auth.ScopeDropsRead}, nil)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); err != nil {
		t.Fatalf("the token should resolve before the user is deleted: %v", err)
	}

	if _, err := st.DB().ExecContext(ctx, `DELETE FROM users WHERE id = ?`, user.ID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a deleted user's token still resolved (err = %v)", err)
	}
}

func TestAPITokenLifecycle(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-tok", "t@example.org", "Tok")

	minted, err := st.CreateAPIToken(ctx, user.ID, "ci ingest",
		[]auth.Scope{auth.ScopeDropsWrite}, nil)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	resolved, err := st.ResolveAPIToken(ctx, minted.Token)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.Token.UserID != user.ID {
		t.Errorf("resolved to user %q, want %q", resolved.Token.UserID, user.ID)
	}
	if !resolved.Scopes.Has(auth.ScopeDropsWrite) || resolved.Scopes.Has(auth.ScopeAdmin) {
		t.Errorf("scopes = %v", resolved.Scopes)
	}

	// The listing must never carry a secret: it is the response people paste
	// into issues and screenshots.
	listed, err := st.ListAPITokens(ctx, user.ID, false)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != minted.ID {
		t.Fatalf("listed = %+v", listed)
	}

	if err := st.RevokeAPIToken(ctx, user.ID, minted.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a revoked token still resolved (err = %v)", err)
	}

	// Revoked is a soft delete: the audit trail must still resolve the id.
	withRevoked, err := st.ListAPITokens(ctx, user.ID, true)
	if err != nil {
		t.Fatalf("list including revoked: %v", err)
	}
	if len(withRevoked) != 1 || withRevoked[0].RevokedAt == nil {
		t.Fatalf("revoked token was lost or not marked: %+v", withRevoked)
	}
	if hidden, _ := st.ListAPITokens(ctx, user.ID, false); len(hidden) != 0 {
		t.Errorf("a revoked token appeared in the default listing: %+v", hidden)
	}
}

func TestRevokeIsScopedToTheOwner(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	mine := newTestUser(t, st, "sub-mine", "m@example.org", "Mine")
	theirs := newTestUser(t, st, "sub-theirs", "th@example.org", "Theirs")

	minted, err := st.CreateAPIToken(ctx, theirs.ID, "theirs", []auth.Scope{auth.ScopeDropsRead}, nil)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if err := st.RevokeAPIToken(ctx, mine.ID, minted.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("one user revoked another's token (err = %v)", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); err != nil {
		t.Fatalf("the token should still work: %v", err)
	}
}

func TestExpiredTokenDoesNotResolve(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-exp", "e@example.org", "Exp")

	past := time.Now().Add(-time.Hour)
	minted, err := st.CreateAPIToken(ctx, user.ID, "expired", []auth.Scope{auth.ScopeDropsRead}, &past)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an expired token resolved (err = %v)", err)
	}
}

func TestDisabledUserCannotAuthenticate(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-dis", "d@example.org", "Dis")

	minted, err := st.CreateAPIToken(ctx, user.ID, "tok", []auth.Scope{auth.ScopeDropsRead}, nil)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if err := st.SetUserDisabled(ctx, user.ID, true); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if _, err := st.ResolveAPIToken(ctx, minted.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a disabled user's token resolved (err = %v)", err)
	}
}

func TestSessionLifecycle(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-sess", "s@example.org", "Sess")

	raw, err := auth.NewSessionValue()
	if err != nil {
		t.Fatalf("new session value: %v", err)
	}
	session, err := st.CreateSession(ctx, raw, user.ID, "id-token", "curl/8", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// The cookie value must not be recoverable from the database.
	var stored string
	if err := st.DB().QueryRowContext(ctx,
		`SELECT id FROM sessions WHERE user_id = ?`, user.ID).Scan(&stored); err != nil {
		t.Fatalf("read session row: %v", err)
	}
	if stored == raw {
		t.Fatal("the session cookie value was stored verbatim")
	}
	if stored != HashSessionValue(raw) {
		t.Fatal("the stored id is not the hash of the cookie value")
	}

	if _, err := st.GetSession(ctx, raw, time.Hour); err != nil {
		t.Fatalf("get: %v", err)
	}
	if err := st.DeleteSession(ctx, session.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := st.GetSession(ctx, raw, time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a deleted session still resolved (err = %v)", err)
	}
}

func TestExpiryIsEnforcedWithoutTheSweeper(t *testing.T) {
	// A sweeper that is also the enforcement mechanism means a paused process
	// is an authorization bypass. Nothing is swept in this test.
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-old", "o@example.org", "Old")

	raw, _ := auth.NewSessionValue()
	if _, err := st.CreateSession(ctx, raw, user.ID, "", "", "", -time.Minute); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := st.GetSession(ctx, raw, time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an expired session resolved (err = %v)", err)
	}

	// And the idle deadline, separately from the absolute one: a session well
	// inside its absolute lifetime but untouched for too long must not resolve.
	//
	// Backdating last_seen_at rather than passing a negative idle: a non-positive
	// idle means "no idle limit" (see Session.Expired), so a negative value would
	// have tested nothing — as the first draft of this test discovered.
	idled, _ := auth.NewSessionValue()
	if _, err := st.CreateSession(ctx, idled, user.ID, "", "", "", time.Hour); err != nil {
		t.Fatalf("create idled: %v", err)
	}
	if _, err := st.DB().ExecContext(ctx,
		`UPDATE sessions SET last_seen_at = ? WHERE id = ?`,
		FormatTime(time.Now().Add(-2*time.Hour)), HashSessionValue(idled),
	); err != nil {
		t.Fatalf("backdate last_seen_at: %v", err)
	}
	if _, err := st.GetSession(ctx, idled, time.Minute); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an idle session resolved (err = %v)", err)
	}
	// The same session, with the idle check disabled, still resolves — which is
	// what makes the assertion above about idleness rather than about expiry.
	if _, err := st.GetSession(ctx, idled, 0); err != nil {
		t.Fatalf("idle=0 should disable the idle check: %v", err)
	}
}

func TestAuthFlowIsSingleUse(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	flow := datadrop.AuthFlow{State: "state-1", Nonce: "n", Verifier: "v", ReturnTo: "/ui/"}
	if err := st.CreateAuthFlow(ctx, flow); err != nil {
		t.Fatalf("create: %v", err)
	}

	taken, err := st.TakeAuthFlow(ctx, "state-1", time.Minute)
	if err != nil {
		t.Fatalf("take: %v", err)
	}
	if taken.Nonce != "n" || taken.Verifier != "v" || taken.ReturnTo != "/ui/" {
		t.Errorf("round trip lost data: %+v", taken)
	}

	// A state that can be redeemed twice is a replayable authentication.
	if _, err := st.TakeAuthFlow(ctx, "state-1", time.Minute); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a state was redeemed twice (err = %v)", err)
	}
}

func TestStaleAuthFlowIsBurnedNotReusable(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()

	// Backdated, rather than redeemed with a negative maxAge: non-positive means
	// "no age limit", so that would have tested nothing.
	if err := st.CreateAuthFlow(ctx, datadrop.AuthFlow{
		State: "old", Nonce: "n", Verifier: "v", ReturnTo: "/ui/",
		CreatedAt: time.Now().Add(-time.Hour),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Expired: rejected. And consumed anyway, so a second attempt cannot
	// succeed by racing a clock change.
	if _, err := st.TakeAuthFlow(ctx, "old", time.Minute); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a stale flow was accepted (err = %v)", err)
	}
	if _, err := st.TakeAuthFlow(ctx, "old", time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatal("a rejected stale flow was left redeemable")
	}
}

func TestSweepIsHygieneOnly(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	user := newTestUser(t, st, "sub-sweep", "sw@example.org", "Sweep")

	raw, _ := auth.NewSessionValue()
	if _, err := st.CreateSession(ctx, raw, user.ID, "", "", "", -time.Minute); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := st.CreateAuthFlow(ctx, datadrop.AuthFlow{
		State: "s", Nonce: "n", Verifier: "v", ReturnTo: "/ui/",
		CreatedAt: time.Now().Add(-time.Hour),
	}); err != nil {
		t.Fatalf("create flow: %v", err)
	}

	sessions, flows, err := st.SweepAuth(ctx, 5*time.Minute)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if sessions != 1 || flows != 1 {
		t.Errorf("swept %d sessions and %d flows, want 1 and 1", sessions, flows)
	}
}

func TestDropOwnershipAndMembership(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	owner := newTestUser(t, st, "sub-owner", "own@example.org", "Owner")
	friend := newTestUser(t, st, "sub-friend", "fr@example.org", "Friend")

	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "lab", OwnerID: owner.ID}); err != nil {
		t.Fatalf("create drop: %v", err)
	}

	acl, err := st.DropACL(ctx, "lab")
	if err != nil {
		t.Fatalf("acl: %v", err)
	}
	if acl.OwnerID != owner.ID {
		t.Errorf("owner = %q, want %q", acl.OwnerID, owner.ID)
	}
	if role := auth.EffectiveRole(sessionOf(owner.ID), acl); role != auth.RoleAdmin {
		t.Errorf("owner's role = %q, want admin", role)
	}
	if role := auth.EffectiveRole(sessionOf(friend.ID), acl); role != auth.RoleNone {
		t.Errorf("stranger's role = %q, want none", role)
	}

	if err := st.SetMember(ctx, "lab", friend.ID, auth.RoleWriter, owner.ID); err != nil {
		t.Fatalf("set member: %v", err)
	}
	acl, _ = st.DropACL(ctx, "lab")
	if role := auth.EffectiveRole(sessionOf(friend.ID), acl); role != auth.RoleWriter {
		t.Errorf("member's role = %q, want writer", role)
	}

	members, err := st.ListMembers(ctx, "lab")
	if err != nil {
		t.Fatalf("list members: %v", err)
	}
	if len(members) != 1 || members[0].User == nil || members[0].User.Email != "fr@example.org" {
		t.Fatalf("members = %+v; the user should be resolved for the UI", members)
	}

	if err := st.RemoveMember(ctx, "lab", friend.ID); err != nil {
		t.Fatalf("remove member: %v", err)
	}
	acl, _ = st.DropACL(ctx, "lab")
	if role := auth.EffectiveRole(sessionOf(friend.ID), acl); role != auth.RoleNone {
		t.Errorf("removed member's role = %q, want none", role)
	}
}

func TestOwnerCannotBeGivenAMemberRow(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	owner := newTestUser(t, st, "sub-o", "o@example.org", "O")
	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "lab", OwnerID: owner.ID}); err != nil {
		t.Fatalf("create drop: %v", err)
	}
	// An owner demotable to reader on their own drop is an owner who can lock
	// themselves out, and the recovery is a database edit.
	if err := st.SetMember(ctx, "lab", owner.ID, auth.RoleReader, owner.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("demoting the owner was allowed (err = %v)", err)
	}
}

func TestClaimIsAtomicAndOnlyOnce(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	first := newTestUser(t, st, "sub-1st", "1@example.org", "First")
	second := newTestUser(t, st, "sub-2nd", "2@example.org", "Second")

	// An unowned drop: exactly what migration 0003 leaves behind.
	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "legacy"}); err != nil {
		t.Fatalf("create drop: %v", err)
	}

	if err := st.ClaimDrop(ctx, "legacy", first.ID); err != nil {
		t.Fatalf("claim: %v", err)
	}
	if err := st.ClaimDrop(ctx, "legacy", second.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("a second claim succeeded (err = %v)", err)
	}

	drop, _ := st.GetDrop(ctx, "legacy")
	if drop.OwnerID != first.ID {
		t.Errorf("owner = %q, want %q — the first claim must win", drop.OwnerID, first.ID)
	}
}

func TestUnownedDropIsNotUnprotected(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	stranger := newTestUser(t, st, "sub-str", "s@example.org", "Stranger")
	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "legacy"}); err != nil {
		t.Fatalf("create drop: %v", err)
	}

	acl, err := st.DropACL(ctx, "legacy")
	if err != nil {
		t.Fatalf("acl: %v", err)
	}
	if role := auth.EffectiveRole(sessionOf(stranger.ID), acl); role != auth.RoleNone {
		t.Errorf("an arbitrary user got role %q on an unowned drop", role)
	}
	if role := auth.EffectiveRole(auth.Principal{Kind: auth.KindRoot}, acl); role != auth.RoleAdmin {
		t.Errorf("root got role %q on an unowned drop, want admin", role)
	}
}

func TestVisibleDropsAgreesWithEffectiveRole(t *testing.T) {
	// VisibleDrops filters in SQL for the unbounded case; EffectiveRole decides
	// per drop. Two implementations of one rule drift, so this asserts they
	// agree over every combination in the fixture.
	st := newTestStore(t)
	ctx := context.Background()
	owner := newTestUser(t, st, "sub-vo", "vo@example.org", "VO")
	member := newTestUser(t, st, "sub-vm", "vm@example.org", "VM")
	stranger := newTestUser(t, st, "sub-vs", "vs@example.org", "VS")

	for _, d := range []datadrop.Drop{
		{Name: "owned", OwnerID: owner.ID},
		{Name: "shared", OwnerID: owner.ID},
		{Name: "public", OwnerID: owner.ID, PublicRead: true},
		{Name: "legacy"},
	} {
		if _, err := st.CreateDrop(ctx, d); err != nil {
			t.Fatalf("create %q: %v", d.Name, err)
		}
	}
	if err := st.SetMember(ctx, "shared", member.ID, auth.RoleReader, owner.ID); err != nil {
		t.Fatalf("set member: %v", err)
	}

	principals := map[string]auth.Principal{
		"owner":     sessionOf(owner.ID),
		"member":    sessionOf(member.ID),
		"stranger":  sessionOf(stranger.ID),
		"anonymous": auth.Anonymous(),
		"root":      {Kind: auth.KindRoot, Scopes: auth.FullScopeSet()},
	}

	for name, p := range principals {
		visible, err := st.VisibleDrops(ctx, p)
		if err != nil {
			t.Fatalf("VisibleDrops(%s): %v", name, err)
		}
		got := map[string]bool{}
		for _, d := range visible {
			got[d.Name] = true
		}

		all, _ := st.ListDrops(ctx)
		for _, d := range all {
			acl, err := st.DropACL(ctx, d.Name)
			if err != nil {
				t.Fatalf("acl %q: %v", d.Name, err)
			}
			want := auth.EffectiveRole(p, acl).AtLeast(auth.RoleReader)
			if got[d.Name] != want {
				t.Errorf("%s: VisibleDrops says %v for %q, EffectiveRole says %v",
					name, got[d.Name], d.Name, want)
			}
		}
	}
}

func sessionOf(userID string) auth.Principal {
	return auth.Principal{Kind: auth.KindSession, UserID: userID, Scopes: auth.FullScopeSet()}
}
