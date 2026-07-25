package auth

import "github.com/pkg/errors"

// Role is what a user may do to one drop.
//
// The unit of sharing is the drop, because pkg/datadrop/drop.go has called it
// "the unit of naming, sharing, and export" since v0.1 and this ticket takes
// that at its word: there is no per-dataset or per-stream role.
type Role string

const (
	// RoleNone is the absence of a role. It is not stored; it is what
	// EffectiveRole returns when a principal has no relationship to a drop.
	RoleNone   Role = ""
	RoleReader Role = "reader"
	RoleWriter Role = "writer"
	RoleAdmin  Role = "admin"
)

// AssignableRoles is what may appear in drop_members, weakest first.
var AssignableRoles = []Role{RoleReader, RoleWriter, RoleAdmin}

// rank orders roles so that "at least this role" is a comparison.
func (r Role) rank() int {
	switch r {
	case RoleReader:
		return 1
	case RoleWriter:
		return 2
	case RoleAdmin:
		return 3
	default:
		return 0
	}
}

// AtLeast reports whether r is required or stronger.
func (r Role) AtLeast(required Role) bool { return r.rank() >= required.rank() && r.rank() > 0 }

// Valid reports whether r may be stored in drop_members.
func (r Role) Valid() bool {
	for _, known := range AssignableRoles {
		if known == r {
			return true
		}
	}
	return false
}

// ParseRole validates a role coming from a request body or a database column.
func ParseRole(raw string) (Role, error) {
	r := Role(raw)
	if !r.Valid() {
		return RoleNone, errors.Errorf(
			"auth: unknown role %q (known: reader, writer, admin)", raw)
	}
	return r, nil
}

// DropACL is what EffectiveRole needs to know about a drop. It is an argument
// rather than a store lookup so that the decision function stays pure and every
// row of the authorization matrix can be written as a literal.
type DropACL struct {
	// OwnerID is empty for an unowned drop — every drop that predates this
	// ticket. Unowned is not unprotected: see EffectiveRole.
	OwnerID string
	// PublicRead exempts reads from authentication, exactly as it has since
	// v0.1.
	PublicRead bool
	// Members maps user id to role.
	Members map[string]Role
}

// EffectiveRole is the role a principal holds on a drop.
//
// This is one half of an authorization decision. The other half is the
// credential's scope, and Authorize is where the two meet. Keeping them
// separate is what makes DR-24 expressible: a token narrows its owner's rights
// and never carries rights of its own.
func EffectiveRole(p Principal, acl DropACL) Role {
	switch p.Kind {
	case KindRoot:
		// The operator break-glass. Audited as "root", so it is always
		// distinguishable in the audit trail from a real user.
		return RoleAdmin
	case KindAnonymous:
		if acl.PublicRead {
			return RoleReader
		}
		return RoleNone
	}

	// An owner is an implicit admin and cannot be demoted out of their own
	// drop; the members table is not consulted for them.
	if acl.OwnerID != "" && acl.OwnerID == p.UserID {
		return RoleAdmin
	}
	if role, ok := acl.Members[p.UserID]; ok && role.Valid() {
		return role
	}
	// Falling through to public_read rather than returning none: a member with
	// no row on a public drop is still a reader, like everyone else.
	if acl.PublicRead {
		return RoleReader
	}
	// Note what does NOT happen here: an unowned drop does not become readable
	// by any authenticated user. Ownership is claimed explicitly (DR-25);
	// until then only the root principal, or public_read, opens it.
	return RoleNone
}

// Authorize is the whole decision: membership AND credential scope.
//
// Both halves are required, and the intersection is computed here rather than
// baked into the credential when it was minted. That is what makes removing a
// member instantly narrow every token they hold, with nothing to hunt down
// (DR-24).
func Authorize(p Principal, acl DropACL, required Role, scope Scope) bool {
	if !EffectiveRole(p, acl).AtLeast(required) {
		return false
	}
	return p.Allowed(scope)
}
