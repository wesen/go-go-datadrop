package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// HashSessionValue is how a cookie value becomes a primary key.
//
// SHA-256 for the same reason as an API token secret: the value is 256 bits
// from crypto/rand, so it is not guessable and a slow KDF would only add
// latency to every authenticated request. What this buys is that a dump of the
// database — a backup, a copied file, a support bundle — contains no usable
// session credential.
func HashSessionValue(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

const sessionColumns = `id, user_id, created_at, last_seen_at, expires_at, id_token, user_agent, ip`

// CreateSession records a signed-in browser. raw is the cookie value; only its
// hash is stored.
func (s *Store) CreateSession(
	ctx context.Context, raw, userID, idToken, userAgent, ip string, lifetime time.Duration,
) (datadrop.Session, error) {
	now := s.Now()
	session := datadrop.Session{
		ID:         HashSessionValue(raw),
		UserID:     userID,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now.Add(lifetime),
		IDToken:    idToken,
		UserAgent:  userAgent,
		IP:         ip,
	}

	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions(`+sessionColumns+`) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		session.ID, session.UserID, FormatTime(session.CreatedAt),
		FormatTime(session.LastSeenAt), FormatTime(session.ExpiresAt),
		nullableString(session.IDToken), nullableString(session.UserAgent),
		nullableString(session.IP),
	); err != nil {
		return datadrop.Session{}, errors.Wrap(err, "store: create session")
	}

	if err := s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionSessionCreate,
		Detail: jsonObject(map[string]any{"user": userID}),
	}); err != nil {
		return datadrop.Session{}, err
	}
	return session, nil
}

// GetSession resolves a cookie value.
//
// It returns ErrNotFound for an unknown, expired or idle session — the caller
// must not be able to distinguish those, and neither must an attacker.
// Expiry is enforced here, not only by the sweeper: a sweeper that is also the
// enforcement mechanism means a paused process is an authorization bypass.
func (s *Store) GetSession(ctx context.Context, raw string, idle time.Duration) (datadrop.Session, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+sessionColumns+` FROM sessions WHERE id = ?`, HashSessionValue(raw))

	session, err := scanSession(row)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Session{}, errors.Wrap(ErrNotFound, "session")
		}
		return datadrop.Session{}, errors.Wrap(err, "store: get session")
	}
	if session.Expired(s.Now(), idle) {
		return datadrop.Session{}, errors.Wrap(ErrNotFound, "session")
	}
	return session, nil
}

// GetSessionByID reads a session by its stored id — the hash — rather than by
// a cookie value.
//
// Only for a request that has ALREADY authenticated as that session, which is
// why it does no expiry check: the caller holds a principal that the resolver
// produced, and re-deciding validity here would be a second opinion on a
// question already answered.
func (s *Store) GetSessionByID(ctx context.Context, id string) (datadrop.Session, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+sessionColumns+` FROM sessions WHERE id = ?`, id)
	session, err := scanSession(row)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Session{}, errors.Wrap(ErrNotFound, "session")
		}
		return datadrop.Session{}, errors.Wrap(err, "store: get session")
	}
	return session, nil
}

// TouchSession advances the idle clock. The absolute deadline is never
// extended: extending it on activity is how a session becomes immortal.
func (s *Store) TouchSession(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE sessions SET last_seen_at = ? WHERE id = ?`, FormatTime(s.Now()), id)
	return errors.Wrap(err, "store: touch session")
}

// ListSessions returns a user's live sessions, newest first, for the profile
// tile.
func (s *Store) ListSessions(ctx context.Context, userID string) ([]datadrop.Session, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+sessionColumns+` FROM sessions
		 WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`,
		userID, FormatTime(s.Now()))
	if err != nil {
		return nil, errors.Wrap(err, "store: list sessions")
	}
	defer func() { _ = rows.Close() }()

	sessions := []datadrop.Session{}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan session")
		}
		sessions = append(sessions, session)
	}
	return sessions, errors.Wrap(rows.Err(), "store: list sessions")
}

// DeleteSession signs one browser out. Deleting the row is what actually ends
// the session; clearing the cookie alone would leave a working credential in
// anyone's hands who had already copied it.
func (s *Store) DeleteSession(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id); err != nil {
		return errors.Wrap(err, "store: delete session")
	}
	return s.audit(ctx, s.db, datadrop.AuditRecord{Action: datadrop.ActionSessionDelete})
}

// DeleteOtherSessions signs out every session of a user except keepID.
func (s *Store) DeleteOtherSessions(ctx context.Context, userID, keepID string) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userID, keepID)
	if err != nil {
		return 0, errors.Wrap(err, "store: delete other sessions")
	}
	affected, _ := result.RowsAffected()
	return affected, s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionSessionDelete,
		Detail: jsonObject(map[string]any{"scope": "others", "count": affected}),
	})
}

func scanSession(sc scanner) (datadrop.Session, error) {
	var (
		s                                datadrop.Session
		createdAt, lastSeenAt, expiresAt string
		idToken, userAgent, ip           sql.NullString
	)
	if err := sc.Scan(&s.ID, &s.UserID, &createdAt, &lastSeenAt, &expiresAt,
		&idToken, &userAgent, &ip); err != nil {
		return datadrop.Session{}, err
	}
	var err error
	if s.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.Session{}, err
	}
	if s.LastSeenAt, err = ParseTime(lastSeenAt); err != nil {
		return datadrop.Session{}, err
	}
	if s.ExpiresAt, err = ParseTime(expiresAt); err != nil {
		return datadrop.Session{}, err
	}
	s.IDToken, s.UserAgent, s.IP = idToken.String, userAgent.String, ip.String
	return s, nil
}

// --- the sign-in flow -------------------------------------------------------

// CreateAuthFlow records a redirect in progress.
func (s *Store) CreateAuthFlow(ctx context.Context, flow datadrop.AuthFlow) error {
	if flow.CreatedAt.IsZero() {
		flow.CreatedAt = s.Now()
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO auth_flows(state, nonce, verifier, return_to, created_at)
		 VALUES(?, ?, ?, ?, ?)`,
		flow.State, flow.Nonce, flow.Verifier, flow.ReturnTo, FormatTime(flow.CreatedAt))
	return errors.Wrap(err, "store: create auth flow")
}

// TakeAuthFlow reads and deletes a pending flow, atomically.
//
// Single use is the whole point: `state` binds a callback to the request that
// started it, and a state that can be redeemed twice is a replayable
// authentication. The delete-then-check ordering below is what makes it atomic
// without a transaction — RowsAffected on the DELETE tells us whether we were
// the one who took it.
func (s *Store) TakeAuthFlow(ctx context.Context, state string, maxAge time.Duration) (datadrop.AuthFlow, error) {
	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return datadrop.AuthFlow{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var (
		flow      datadrop.AuthFlow
		createdAt string
	)
	err = tx.QueryRowContext(ctx,
		`SELECT state, nonce, verifier, return_to, created_at FROM auth_flows WHERE state = ?`,
		state,
	).Scan(&flow.State, &flow.Nonce, &flow.Verifier, &flow.ReturnTo, &createdAt)
	if err != nil {
		if isNoRows(err) {
			return datadrop.AuthFlow{}, errors.Wrap(ErrNotFound, "auth flow")
		}
		return datadrop.AuthFlow{}, errors.Wrap(err, "store: take auth flow")
	}
	if flow.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.AuthFlow{}, err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_flows WHERE state = ?`, state); err != nil {
		return datadrop.AuthFlow{}, errors.Wrap(err, "store: consume auth flow")
	}
	if err := tx.Commit(); err != nil {
		return datadrop.AuthFlow{}, errors.Wrap(err, "store: commit auth flow")
	}

	// Checked after consuming, so that a stale state is still burned rather
	// than left for a second attempt.
	if maxAge > 0 && s.Now().Sub(flow.CreatedAt) > maxAge {
		return datadrop.AuthFlow{}, errors.Wrap(ErrNotFound, "auth flow expired")
	}
	return flow, nil
}

// SweepAuth deletes expired sessions and abandoned sign-in flows.
//
// Hygiene, not enforcement — GetSession and TakeAuthFlow both check deadlines
// themselves. It returns the counts so the caller can log something meaningful
// rather than "swept".
func (s *Store) SweepAuth(ctx context.Context, flowMaxAge time.Duration) (int64, int64, error) {
	now := s.Now()

	result, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`, FormatTime(now))
	if err != nil {
		return 0, 0, errors.Wrap(err, "store: sweep sessions")
	}
	sessions, _ := result.RowsAffected()

	result, err = s.db.ExecContext(ctx,
		`DELETE FROM auth_flows WHERE created_at <= ?`, FormatTime(now.Add(-flowMaxAge)))
	if err != nil {
		return sessions, 0, errors.Wrap(err, "store: sweep auth flows")
	}
	flows, _ := result.RowsAffected()
	return sessions, flows, nil
}
