package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const userColumns = `id, issuer, subject, email, name, created_at, last_seen_at, disabled`

// UpsertUser is just-in-time provisioning: it creates the local record for an
// OIDC subject on first sign-in, and refreshes the cached claims on every
// subsequent one.
//
// The key is (issuer, subject). Never email — people change addresses and
// providers reuse them, so an email-keyed upsert silently merges two accounts
// the first time someone's address is recycled.
//
// Claims are refreshed here and nowhere else. Between sign-ins a name change at
// the provider is invisible to us, which is acceptable staleness for a display
// string; the alternative is a userinfo round trip on the hot path of every
// request to keep a label fresh (guide §6.3, §6.4).
func (s *Store) UpsertUser(ctx context.Context, issuer, subject, email, name string) (datadrop.User, error) {
	if issuer == "" || subject == "" {
		return datadrop.User{}, errors.New("store: upsert user requires an issuer and a subject")
	}

	now := s.Now()
	existing, err := s.userBy(ctx, `issuer = ? AND subject = ?`, issuer, subject)
	switch {
	case err == nil:
		if _, err := s.db.ExecContext(ctx,
			`UPDATE users SET email = ?, name = ?, last_seen_at = ? WHERE id = ?`,
			nullableString(email), nullableString(name), FormatTime(now), existing.ID,
		); err != nil {
			return datadrop.User{}, errors.Wrapf(err, "store: refresh user %s", existing.ID)
		}
		existing.Email, existing.Name, existing.LastSeenAt = email, name, now
		return existing, nil
	case errors.Is(err, ErrNotFound):
		// fall through to the insert
	default:
		return datadrop.User{}, err
	}

	id, err := auth.NewUserID()
	if err != nil {
		return datadrop.User{}, errors.Wrap(err, "store: mint user id")
	}
	user := datadrop.User{
		ID: id, Issuer: issuer, Subject: subject, Email: email, Name: name,
		CreatedAt: now, LastSeenAt: now,
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO users(`+userColumns+`) VALUES(?, ?, ?, ?, ?, ?, ?, 0)`,
		user.ID, user.Issuer, user.Subject, nullableString(user.Email),
		nullableString(user.Name), FormatTime(now), FormatTime(now),
	); err != nil {
		if isUniqueViolation(err) {
			// Two concurrent first sign-ins for one subject. Re-read rather
			// than fail: the other request won and its row is the right one.
			return s.userBy(ctx, `issuer = ? AND subject = ?`, issuer, subject)
		}
		return datadrop.User{}, errors.Wrap(err, "store: create user")
	}

	if err := s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionUserCreate,
		Detail: jsonObject(map[string]any{"user": user.ID, "issuer": issuer}),
	}); err != nil {
		return datadrop.User{}, err
	}
	log.Info().Str("user", user.ID).Str("issuer", issuer).Msg("provisioned user")
	return user, nil
}

// GetUserBySubject reads a user by their provider identity.
//
// Used by the callback handler for exactly one thing: deciding whether this
// sign-in is the account's first, so a new user can be landed in the account
// workspace rather than wherever they were last. Nothing authorizes on it.
func (s *Store) GetUserBySubject(ctx context.Context, issuer, subject string) (datadrop.User, error) {
	return s.userBy(ctx, `issuer = ? AND subject = ?`, issuer, subject)
}

// GetUser reads one user by our own identifier.
func (s *Store) GetUser(ctx context.Context, id string) (datadrop.User, error) {
	return s.userBy(ctx, `id = ?`, id)
}

// FindUserByEmail supports adding a member, where a human knows an address and
// the API needs an id.
//
// This is an existence oracle over email addresses, which is why the handler
// restricts it to people who already administer a drop, audits it, and rate
// limits it (guide §12.4). It is emphatically NOT for authentication or for
// resolving the current user — those key on (issuer, subject).
func (s *Store) FindUserByEmail(ctx context.Context, email string) (datadrop.User, error) {
	if email == "" {
		return datadrop.User{}, errors.Wrap(ErrNotFound, "user")
	}
	// NOCASE-insensitive comparison via lower(): addresses are handed around by
	// people, who capitalise them inconsistently. Read up to two rows rather than
	// using QueryRow: email is not unique, and guessing among duplicates would
	// let a member invitation target the wrong OIDC identity.
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE lower(email) = lower(?) LIMIT 2`, email)
	if err != nil {
		return datadrop.User{}, errors.Wrap(err, "store: find user by email")
	}
	defer func() { _ = rows.Close() }()

	matches := []datadrop.User{}
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return datadrop.User{}, errors.Wrap(err, "store: scan user")
		}
		matches = append(matches, user)
	}
	if err := rows.Err(); err != nil {
		return datadrop.User{}, errors.Wrap(err, "store: find user by email")
	}
	switch len(matches) {
	case 0:
		return datadrop.User{}, errors.Wrap(ErrNotFound, "user")
	case 1:
		return matches[0], nil
	default:
		return datadrop.User{}, errors.Wrap(ErrConflict, "email matches multiple users")
	}
}

// SetUserDisabled locks or unlocks an account within datadrop, leaving the
// identity provider untouched.
func (s *Store) SetUserDisabled(ctx context.Context, id string, disabled bool) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE users SET disabled = ? WHERE id = ?`, boolToInt(disabled), id)
	if err != nil {
		return errors.Wrapf(err, "store: set user %s disabled", id)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return errors.Wrapf(ErrNotFound, "user %q", id)
	}
	return nil
}

func (s *Store) userBy(ctx context.Context, where string, args ...any) (datadrop.User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE `+where, args...)
	user, err := scanUser(row)
	if err != nil {
		if isNoRows(err) {
			return datadrop.User{}, errors.Wrap(ErrNotFound, "user")
		}
		return datadrop.User{}, errors.Wrap(err, "store: get user")
	}
	return user, nil
}

func scanUser(sc scanner) (datadrop.User, error) {
	var (
		u                     datadrop.User
		email, name           sql.NullString
		createdAt, lastSeenAt string
		disabled              int
	)
	if err := sc.Scan(&u.ID, &u.Issuer, &u.Subject, &email, &name,
		&createdAt, &lastSeenAt, &disabled); err != nil {
		return datadrop.User{}, err
	}
	var err error
	if u.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.User{}, err
	}
	if u.LastSeenAt, err = ParseTime(lastSeenAt); err != nil {
		return datadrop.User{}, err
	}
	u.Email, u.Name, u.Disabled = email.String, name.String, disabled != 0
	return u, nil
}

// usersByID fetches several users at once, for filling in Member.User without
// a query per row.
func (s *Store) usersByID(ctx context.Context, ids []string) (map[string]datadrop.User, error) {
	out := map[string]datadrop.User{}
	if len(ids) == 0 {
		return out, nil
	}
	// A placeholder list rather than a join: the caller already has the ids,
	// and this keeps the member queries readable.
	placeholders := make([]byte, 0, len(ids)*2)
	args := make([]any, len(ids))
	for i, id := range ids {
		if i > 0 {
			placeholders = append(placeholders, ',')
		}
		placeholders = append(placeholders, '?')
		args[i] = id
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE id IN (`+string(placeholders)+`)`, args...)
	if err != nil {
		return nil, errors.Wrap(err, "store: fetch users")
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan user")
		}
		out[u.ID] = u
	}
	return out, errors.Wrap(rows.Err(), "store: fetch users")
}

// nullableTime renders an optional deadline for storage.
func nullableTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return FormatTime(*t)
}

// parseNullableTime reads an optional timestamp column.
func parseNullableTime(v sql.NullString) (*time.Time, error) {
	if !v.Valid {
		return nil, nil
	}
	t, err := ParseTime(v.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
