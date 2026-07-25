package store

import (
	"context"
	"database/sql"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// DropACL reads everything EffectiveRole needs about one drop.
//
// One query for the drop plus one for its members, on every authorized request.
// Both are primary-key or indexed lookups against a single-connection SQLite
// database, which is the price of DR-24: rights are the intersection of
// membership and credential scope, computed per request rather than baked into
// the credential when it was minted. Caching this is exactly the optimisation
// that makes revoking membership stop revoking access.
func (s *Store) DropACL(ctx context.Context, dropName string) (auth.DropACL, error) {
	var (
		ownerID    sql.NullString
		publicRead int
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT owner_id, public_read FROM drops WHERE name = ?`, dropName,
	).Scan(&ownerID, &publicRead)
	if err != nil {
		if isNoRows(err) {
			return auth.DropACL{}, errors.Wrapf(ErrNotFound, "drop %q", dropName)
		}
		return auth.DropACL{}, errors.Wrapf(err, "store: read acl for %q", dropName)
	}

	acl := auth.DropACL{
		OwnerID:    ownerID.String,
		PublicRead: publicRead != 0,
		Members:    map[string]auth.Role{},
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT user_id, role FROM drop_members WHERE drop_name = ?`, dropName)
	if err != nil {
		return auth.DropACL{}, errors.Wrapf(err, "store: read members of %q", dropName)
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var userID, role string
		if err := rows.Scan(&userID, &role); err != nil {
			return auth.DropACL{}, errors.Wrap(err, "store: scan member")
		}
		// An unparseable role is dropped rather than fatal: a row written by a
		// newer version with a role this binary does not know must not deny
		// service to everyone else on the drop. EffectiveRole ignores an
		// invalid role anyway, so this is belt and braces.
		acl.Members[userID] = auth.Role(role)
	}
	return acl, errors.Wrapf(rows.Err(), "store: read members of %q", dropName)
}

// ListMembers returns a drop's access list with the users resolved, so the UI
// can show names without a query per row.
func (s *Store) ListMembers(ctx context.Context, dropName string) ([]datadrop.Member, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT drop_name, user_id, role, added_at, added_by
		   FROM drop_members WHERE drop_name = ? ORDER BY added_at`, dropName)
	if err != nil {
		return nil, errors.Wrapf(err, "store: list members of %q", dropName)
	}
	defer func() { _ = rows.Close() }()

	members := []datadrop.Member{}
	ids := []string{}
	for rows.Next() {
		var (
			m       datadrop.Member
			role    string
			addedAt string
			addedBy sql.NullString
		)
		if err := rows.Scan(&m.Drop, &m.UserID, &role, &addedAt, &addedBy); err != nil {
			return nil, errors.Wrap(err, "store: scan member")
		}
		if m.AddedAt, err = ParseTime(addedAt); err != nil {
			return nil, err
		}
		m.Role, m.AddedBy = auth.Role(role), addedBy.String
		members = append(members, m)
		ids = append(ids, m.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrapf(err, "store: list members of %q", dropName)
	}

	users, err := s.usersByID(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range members {
		if u, ok := users[members[i].UserID]; ok {
			user := u
			members[i].User = &user
		}
	}
	return members, nil
}

// SetMember adds a collaborator or changes their role.
//
// It refuses to touch the owner. An owner who could be demoted to reader on
// their own drop is an owner who can lock themselves out, and the recovery is
// a database edit.
func (s *Store) SetMember(ctx context.Context, dropName, userID string, role auth.Role, addedBy string) error {
	if !role.Valid() {
		return errors.Errorf("store: invalid role %q", role)
	}

	drop, err := s.GetDrop(ctx, dropName)
	if err != nil {
		return err
	}
	if drop.OwnerID != "" && drop.OwnerID == userID {
		return errors.Wrap(ErrConflict, "the owner's role cannot be changed")
	}
	if _, err := s.GetUser(ctx, userID); err != nil {
		return err
	}

	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO drop_members(drop_name, user_id, role, added_at, added_by)
		 VALUES(?, ?, ?, ?, ?)
		 ON CONFLICT(drop_name, user_id) DO UPDATE SET role = excluded.role`,
		dropName, userID, string(role), FormatTime(s.Now()), nullableString(addedBy),
	); err != nil {
		return errors.Wrapf(err, "store: set member %s on %q", userID, dropName)
	}

	return s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionMemberSet,
		Drop:   dropName,
		Detail: jsonObject(map[string]any{"user": userID, "role": string(role)}),
	})
}

// RemoveMember revokes a collaborator's access.
//
// Every token that user holds is narrowed by this, immediately and with nothing
// to hunt down, because rights are computed per request (DR-24).
func (s *Store) RemoveMember(ctx context.Context, dropName, userID string) error {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM drop_members WHERE drop_name = ? AND user_id = ?`, dropName, userID)
	if err != nil {
		return errors.Wrapf(err, "store: remove member %s from %q", userID, dropName)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return errors.Wrapf(ErrNotFound, "member %q of %q", userID, dropName)
	}

	return s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionMemberRemove,
		Drop:   dropName,
		Detail: jsonObject(map[string]any{"user": userID}),
	})
}

// ClaimDrop takes ownership of an unowned drop.
//
// The `owner_id IS NULL` predicate is the whole safety property: it makes the
// claim atomic, so two people racing for one drop cannot both win, and it makes
// claiming an already-owned drop a no-op rather than a theft.
func (s *Store) ClaimDrop(ctx context.Context, dropName, userID string) error {
	if _, err := s.GetDrop(ctx, dropName); err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx,
		`UPDATE drops SET owner_id = ? WHERE name = ? AND owner_id IS NULL`,
		userID, dropName)
	if err != nil {
		return errors.Wrapf(err, "store: claim drop %q", dropName)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return errors.Wrapf(ErrConflict, "drop %q already has an owner", dropName)
	}

	log.Info().Str("drop", dropName).Str("user", userID).Msg("drop claimed")
	return s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionDropClaim,
		Drop:   dropName,
		Detail: jsonObject(map[string]any{"user": userID}),
	})
}

// VisibleDrops lists the drops a principal may read.
//
// The filtering is done in SQL rather than by reading every drop and calling
// EffectiveRole, because a listing is the one place where the number of drops
// is unbounded. The predicate must stay in step with auth.EffectiveRole;
// TestVisibleDropsAgreesWithEffectiveRole is what keeps them honest.
func (s *Store) VisibleDrops(ctx context.Context, p auth.Principal) ([]datadrop.Drop, error) {
	if p.Kind == auth.KindRoot {
		return s.ListDrops(ctx)
	}
	if !p.IsAuthenticated() {
		return s.queryDrops(ctx, `WHERE public_read = 1 ORDER BY name`)
	}
	return s.queryDrops(ctx,
		`WHERE public_read = 1
		    OR owner_id = ?
		    OR EXISTS (SELECT 1 FROM drop_members m
		                WHERE m.drop_name = drops.name AND m.user_id = ?)
		 ORDER BY name`, p.UserID, p.UserID)
}
