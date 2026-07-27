// Package auth holds the identity model: who is making a request, and what
// they are permitted to do.
//
// The package is deliberately pure — no HTTP, no SQL, no network — with the
// single exception of oidc.go, which is confined behind the Provider interface.
// Everything else takes values and returns values, so the authorization rules
// can be tested exhaustively with literals rather than with a server and a
// database. Authorization tests that need a fixture nobody writes exhaustively,
// and exhaustively is the only way worth writing them.
//
// See ttmp/2026/07/25/DATADROP-5--*/design/01-*.md §6 for the identity model
// and §7 for the authorization rules.
package auth

import "context"

// Kind names how a request was authenticated.
type Kind uint8

const (
	// KindAnonymous means no credential was presented, or the one presented
	// did not resolve. These are the same thing on purpose: conflating
	// "presented something invalid" with "denied" would break reads of a
	// public_read drop by a client with a stale token, and it would leak
	// whether a token id exists.
	KindAnonymous Kind = iota
	// KindRoot is the static --token: unlimited, and unattributed to a person.
	KindRoot
	// KindSession is a browser session cookie.
	KindSession
	// KindToken is a datadrop API token (ddp_…).
	KindToken
)

func (k Kind) String() string {
	switch k {
	case KindRoot:
		return "root"
	case KindSession:
		return "session"
	case KindToken:
		return "token"
	case KindAnonymous:
		return "anonymous"
	default:
		return "anonymous"
	}
}

// Principal is the answer to "who is making this request".
//
// It is computed once per request by the resolver middleware and carried in the
// context. Handlers never re-derive it and never read headers themselves.
type Principal struct {
	Kind Kind
	// UserID is empty for KindAnonymous and KindRoot.
	UserID string
	// Scopes is what the *credential* permits. It never grants: the effective
	// right is the intersection of this and the user's membership, computed per
	// request. See Allowed and guide §7.2 / DR-24.
	Scopes ScopeSet
	// TokenID is the public half of an API token. It is safe to log and is
	// exactly what you need when told a credential leaked and asked what it did.
	TokenID string
	// SessionID identifies the current browser session — the SHA-256 of its
	// cookie, never the cookie. Carried so that sign-out and "revoke my other
	// sessions" know which one is current without re-deriving it.
	SessionID string
}

// Anonymous is the principal for a request carrying no credential, or one that
// did not resolve.
//
// It carries ScopeDropsRead rather than nothing. That looks surprising until
// you remember what a scope is: a limit on the *credential*, not a grant. An
// anonymous caller's credential permits reading; whether there is anything to
// read is decided entirely by EffectiveRole, which gives anonymous a role only
// on a public_read drop. Giving Anonymous an empty scope set instead would make
// Authorize deny every anonymous read and silently break public_read — which is
// exactly the bug this comment exists to stop someone reintroducing.
//
// A function rather than a package var because ScopeSet is a map, and a shared
// mutable map that every anonymous request holds is a bad thing to leave lying
// around.
func Anonymous() Principal {
	return Principal{Kind: KindAnonymous, Scopes: NewScopeSet(ScopeDropsRead)}
}

// IsAuthenticated reports whether any credential resolved.
func (p Principal) IsAuthenticated() bool { return p.Kind != KindAnonymous }

// Label is the audit actor string for this principal.
//
// It is never the credential. pkg/server/middleware.go has recorded that rule
// since v0.1 ("tokens must never reach a log line, an audit row, or a response
// body"); before this package existed there was simply nothing else to say, so
// every row read "token". Now there is.
func (p Principal) Label() string {
	switch p.Kind {
	case KindRoot:
		return "root"
	case KindSession:
		return "user:" + p.UserID
	case KindToken:
		return "user:" + p.UserID + " via token:" + p.TokenID
	case KindAnonymous:
		return ""
	default:
		return ""
	}
}

// Allowed reports whether this principal's *credential* permits an operation
// needing scope.
//
// This is only half of an authorization decision; the other half is membership
// on the target drop, and EffectiveRole is where the two meet. Calling Allowed
// alone is a bug, which is why no handler calls it directly — Server.authorize
// does.
func (p Principal) Allowed(scope Scope) bool {
	if p.Kind == KindRoot {
		return true
	}
	return p.Scopes.Has(scope)
}

type principalContextKey struct{}

// WithPrincipal returns a context carrying p.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

// FromContext returns the principal the resolver put in ctx, or Anonymous.
//
// Anonymous rather than an error: a context with no principal is a context that
// never passed through the resolver, and the safe reading of that is "nobody"
// rather than a panic in a handler.
func FromContext(ctx context.Context) Principal {
	if p, ok := ctx.Value(principalContextKey{}).(Principal); ok {
		return p
	}
	return Anonymous()
}
