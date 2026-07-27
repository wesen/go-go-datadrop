package store

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const tokenColumns = `id, user_id, name, scopes, created_at, expires_at, last_used_at, revoked_at`

// CreateAPIToken mints a credential for a user.
//
// The returned CreateTokenResponse carries the only copy of the secret that
// will ever exist outside the caller's clipboard. The store keeps the hash.
func (s *Store) CreateAPIToken(
	ctx context.Context, userID, name string, scopes []auth.Scope, expiresAt *time.Time,
) (datadrop.CreateTokenResponse, error) {
	if err := datadrop.ValidateTokenName(name); err != nil {
		return datadrop.CreateTokenResponse{}, err
	}
	if err := auth.ValidateScopes(scopes); err != nil {
		return datadrop.CreateTokenResponse{}, err
	}

	minted, err := auth.MintToken()
	if err != nil {
		return datadrop.CreateTokenResponse{}, err
	}

	now := s.Now()
	set := auth.NewScopeSet(scopes...)
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO api_tokens(id, user_id, name, secret_hash, scopes, created_at, expires_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		minted.ID, userID, name, minted.SecretHash, set.String(),
		FormatTime(now), nullableTime(expiresAt),
	); err != nil {
		return datadrop.CreateTokenResponse{}, errors.Wrap(err, "store: create api token")
	}

	if err := s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionTokenCreate,
		// The id, never the secret. This is the row that answers "what did the
		// credential that leaked have permission to do".
		Detail: jsonObject(map[string]any{
			"token": minted.ID, "user": userID, "scopes": set.String(),
		}),
	}); err != nil {
		return datadrop.CreateTokenResponse{}, err
	}

	log.Info().Str("token", minted.ID).Str("user", userID).Msg("minted api token")
	return datadrop.CreateTokenResponse{
		APIToken: datadrop.APIToken{
			ID: minted.ID, UserID: userID, Name: name,
			Scopes: set.Slice(), CreatedAt: now, ExpiresAt: expiresAt,
		},
		Token: minted.String,
	}, nil
}

// ResolvedToken is what a presented credential resolves to.
type ResolvedToken struct {
	Token datadrop.APIToken
	// Scopes as a set, ready for Principal.
	Scopes auth.ScopeSet
}

// ResolveAPIToken verifies a presented credential.
//
// The check ordering is deliberate: the secret is compared BEFORE the revoked
// and expired checks. Reversing it turns the endpoint into an oracle for "does
// this token id exist and is it live", answerable without knowing the secret.
//
// Every failure returns the same ErrNotFound for the same reason.
func (s *Store) ResolveAPIToken(ctx context.Context, raw string) (ResolvedToken, error) {
	id, secret, err := auth.ParseToken(raw)
	if err != nil {
		return ResolvedToken{}, errors.Wrap(ErrNotFound, "api token")
	}

	var (
		secretHash string
		disabled   int
	)
	// One query rather than two: a token belonging to a locked account must not
	// authenticate, and finding that out should not cost a second round trip on
	// every request.
	row := s.db.QueryRowContext(ctx,
		`SELECT `+tokenColumnsQualified+`, t.secret_hash, u.disabled
		   FROM api_tokens t JOIN users u ON u.id = t.user_id
		  WHERE t.id = ?`, id)

	token, scopes, err := scanTokenWithExtras(row, &secretHash, &disabled)
	if err != nil {
		if isNoRows(err) {
			return ResolvedToken{}, errors.Wrap(ErrNotFound, "api token")
		}
		return ResolvedToken{}, errors.Wrap(err, "store: resolve api token")
	}

	if !auth.VerifySecret(secret, secretHash) {
		return ResolvedToken{}, errors.Wrap(ErrNotFound, "api token")
	}
	if !token.Live(s.Now()) {
		return ResolvedToken{}, errors.Wrap(ErrNotFound, "api token")
	}
	if disabled != 0 {
		return ResolvedToken{}, errors.Wrap(ErrNotFound, "api token")
	}

	s.touchToken(ctx, token.ID)
	return ResolvedToken{Token: token, Scopes: scopes}, nil
}

// The same columns, qualified for the join in ResolveAPIToken. Kept next to
// tokenColumns so the two cannot drift apart unnoticed.
const tokenColumnsQualified = `t.id, t.user_id, t.name, t.scopes, t.created_at, ` +
	`t.expires_at, t.last_used_at, t.revoked_at`

// ListAPITokens returns a user's tokens, newest first.
//
// includeRevoked is a parameter rather than a filter the caller applies,
// because a revoked token must remain visible somewhere: losing it loses the
// answer to "what did I revoke, and when".
func (s *Store) ListAPITokens(ctx context.Context, userID string, includeRevoked bool) ([]datadrop.APIToken, error) {
	query := `SELECT ` + tokenColumns + ` FROM api_tokens WHERE user_id = ?`
	if !includeRevoked {
		query += ` AND revoked_at IS NULL`
	}
	query += ` ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, errors.Wrap(err, "store: list api tokens")
	}
	defer func() { _ = rows.Close() }()

	tokens := []datadrop.APIToken{}
	for rows.Next() {
		token, _, err := scanToken(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan api token")
		}
		tokens = append(tokens, token)
	}
	return tokens, errors.Wrap(rows.Err(), "store: list api tokens")
}

// RevokeAPIToken marks a token dead. It is scoped to a user id so that one
// person cannot revoke another's credential by guessing an id.
func (s *Store) RevokeAPIToken(ctx context.Context, userID, tokenID string) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE api_tokens SET revoked_at = ?
		  WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
		FormatTime(s.Now()), tokenID, userID)
	if err != nil {
		return errors.Wrap(err, "store: revoke api token")
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return errors.Wrapf(ErrNotFound, "api token %q", tokenID)
	}

	log.Info().Str("token", tokenID).Str("user", userID).Msg("revoked api token")
	return s.audit(ctx, s.db, datadrop.AuditRecord{
		Action: datadrop.ActionTokenRevoke,
		Detail: jsonObject(map[string]any{"token": tokenID, "user": userID}),
	})
}

// touchToken records last_used_at, at most once a minute per token.
//
// Without the throttle a busy ingest loop turns one indexed read into one write
// per event, and SQLite writes serialise — so the credential check would become
// the bottleneck of the whole ingest path. Minute granularity is ample for the
// only question this column answers: "is anything still using this".
func (s *Store) touchToken(ctx context.Context, id string) {
	now := s.Now()
	if last, ok := s.tokenTouch.Load(id); ok {
		if t, fine := last.(time.Time); fine && now.Sub(t) < time.Minute {
			return
		}
	}
	s.tokenTouch.Store(id, now)

	if _, err := s.db.ExecContext(ctx,
		`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`, FormatTime(now), id); err != nil {
		// Not an error the caller cares about: the credential is valid either
		// way, and failing the request because a bookkeeping column could not
		// be written would be a poor trade.
		log.Debug().Err(err).Str("token", id).Msg("could not record token use")
	}
}

// tokenTouchCache is the throttle's state: token id -> when we last wrote
// last_used_at for it.
type tokenTouchCache = sync.Map

func scanToken(sc scanner) (datadrop.APIToken, auth.ScopeSet, error) {
	return scanTokenWithExtras(sc, nil, nil)
}

func scanTokenWithExtras(sc scanner, secretHash *string, disabled *int) (datadrop.APIToken, auth.ScopeSet, error) {
	var (
		t                                datadrop.APIToken
		scopes, createdAt                string
		expiresAt, lastUsedAt, revokedAt sql.NullString
	)
	dest := []any{&t.ID, &t.UserID, &t.Name, &scopes, &createdAt,
		&expiresAt, &lastUsedAt, &revokedAt}
	if secretHash != nil {
		dest = append(dest, secretHash)
	}
	if disabled != nil {
		dest = append(dest, disabled)
	}
	if err := sc.Scan(dest...); err != nil {
		return datadrop.APIToken{}, nil, err
	}

	var err error
	if t.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.APIToken{}, nil, err
	}
	if t.ExpiresAt, err = parseNullableTime(expiresAt); err != nil {
		return datadrop.APIToken{}, nil, err
	}
	if t.LastUsedAt, err = parseNullableTime(lastUsedAt); err != nil {
		return datadrop.APIToken{}, nil, err
	}
	if t.RevokedAt, err = parseNullableTime(revokedAt); err != nil {
		return datadrop.APIToken{}, nil, err
	}

	set, err := auth.ParseScopes(scopes)
	if err != nil {
		return datadrop.APIToken{}, nil, err
	}
	t.Scopes = set.Slice()
	return t, set, nil
}
