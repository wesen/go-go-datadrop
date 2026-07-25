package server

import (
	"net/http"
	"strings"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// MeResponse is what GET /v1/me returns.
//
// The SPA calls this on every load to decide which shell to render, so it
// carries the deployment's shape as well as the caller's identity: a client
// must not have to probe a protected endpoint and interpret a 401 to find out
// whether sign-in is even a thing here.
type MeResponse struct {
	AuthMode      string         `json:"auth_mode"`
	Authenticated bool           `json:"authenticated"`
	Kind          string         `json:"kind"`
	User          *datadrop.User `json:"user,omitempty"`
	Scopes        []auth.Scope   `json:"scopes"`
	TokenID       string         `json:"token_id,omitempty"`
	SignupEnabled bool           `json:"signup_enabled"`
	Provider      *ProviderLinks `json:"provider,omitempty"`
}

// ProviderLinks points the profile tile at the identity provider for the things
// datadrop deliberately does not own: password, MFA, email, display name.
type ProviderLinks struct {
	Issuer     string `json:"issuer"`
	AccountURL string `json:"account_url"`
	SignInURL  string `json:"sign_in_url"`
	SignUpURL  string `json:"sign_up_url"`
}

// handleMe reports the current principal.
//
// It never returns 401. An anonymous caller gets an anonymous answer, because
// "you are not signed in" is information the sign-in screen needs rather than
// an error — and a 401 here would make the very first request of every page
// load look like a failure in the console.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	p := auth.FromContext(r.Context())

	response := MeResponse{
		AuthMode:      s.cfg.Auth,
		Authenticated: p.IsAuthenticated(),
		Kind:          p.Kind.String(),
		Scopes:        p.Scopes.Slice(),
		TokenID:       p.TokenID,
		SignupEnabled: s.cfg.Auth == AuthOIDC,
	}
	if s.cfg.Auth == AuthOIDC && s.cfg.OIDC.Issuer != "" {
		issuer := strings.TrimRight(s.cfg.OIDC.Issuer, "/")
		response.Provider = &ProviderLinks{
			Issuer: issuer,
			// Derived from the issuer rather than configured separately: one
			// fewer thing to get out of step, and it is correct for any
			// deployment of the provider.
			AccountURL: issuer + "/ui/console/users/me",
			SignInURL:  "/v1/auth/login",
			SignUpURL:  "/v1/auth/login?intent=signup",
		}
	}

	if p.UserID != "" {
		if user, err := s.store.GetUser(r.Context(), p.UserID); err == nil {
			// The subject and issuer are omitted from the wire type's zero
			// value only by accident of JSON tags, so blank them explicitly:
			// nothing outside this server needs the provider's identifier for
			// a person, and echoing it invites something to key on it.
			user.Subject = ""
			response.User = &user
		}
	}

	writeJSON(w, r, http.StatusOK, response)
}

// handleListTokens returns the caller's API tokens.
//
// Never a secret: this is the response people paste into issues and
// screenshots, and TokenResponse structurally cannot carry one.
func (s *Server) handleListTokens(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}
	if p.UserID == "" {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"the root principal has no tokens; sign in as a user")
		return
	}

	includeRevoked := r.URL.Query().Get("include_revoked") == "true"
	tokens, err := s.store.ListAPITokens(r.Context(), p.UserID, includeRevoked)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"count":  len(tokens),
		"tokens": tokens,
	})
}

// handleCreateToken mints an API token.
//
// It requires a SESSION, not merely authentication. A token must not be able to
// mint another token: without that rule, revocation stops working — revoke the
// leaked credential and its offspring survive, with no way to enumerate what it
// created.
func (s *Server) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}
	if p.Kind != auth.KindSession {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"minting a token requires a signed-in browser session: "+
				"a token may not mint another token")
		return
	}

	var req datadrop.CreateTokenRequest
	if !s.decodeJSON(w, r, &req) {
		return
	}
	if err := auth.ValidateScopes(req.Scopes); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	expiresAt, err := datadrop.ParseExpiresIn(req.ExpiresIn, s.store.Now())
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	created, err := s.store.CreateAPIToken(
		auditContext(r), p.UserID, req.Name, req.Scopes, expiresAt)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	// The one response in the entire API that carries a token secret.
	writeJSON(w, r, http.StatusCreated, created)
}

func (s *Server) handleRevokeToken(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}
	if p.UserID == "" {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"the root principal has no tokens")
		return
	}

	// Scoped to the caller's user id in the store, so one person cannot revoke
	// another's credential by guessing an id.
	if err := s.store.RevokeAPIToken(auditContext(r), p.UserID, r.PathValue("id")); err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}
	if p.Kind != auth.KindSession {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"listing sessions requires a signed-in browser session")
		return
	}

	sessions, err := s.store.ListSessions(r.Context(), p.UserID)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	// A wire shape rather than the store type, so that the ID token — which is
	// PII and is only there for RP-initiated logout — cannot escape by someone
	// later adding a JSON tag to it.
	type sessionView struct {
		ID         string `json:"id"`
		Current    bool   `json:"current"`
		CreatedAt  string `json:"created_at"`
		LastSeenAt string `json:"last_seen_at"`
		ExpiresAt  string `json:"expires_at"`
		UserAgent  string `json:"user_agent,omitempty"`
		IP         string `json:"ip,omitempty"`
	}
	views := make([]sessionView, 0, len(sessions))
	for _, session := range sessions {
		views = append(views, sessionView{
			ID:         session.ID,
			Current:    session.ID == p.SessionID,
			CreatedAt:  store.FormatTime(session.CreatedAt),
			LastSeenAt: store.FormatTime(session.LastSeenAt),
			ExpiresAt:  store.FormatTime(session.ExpiresAt),
			UserAgent:  session.UserAgent,
			IP:         session.IP,
		})
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"count":    len(views),
		"sessions": views,
	})
}

// handleDeleteSession revokes one session, or every other one when {id} is
// "others".
func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}
	if p.Kind != auth.KindSession {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"revoking sessions requires a signed-in browser session")
		return
	}

	id := r.PathValue("id")
	if id == "others" {
		if _, err := s.store.DeleteOtherSessions(auditContext(r), p.UserID, p.SessionID); err != nil {
			s.writeStoreError(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Only the caller's own sessions. Without this check the id is enough to
	// sign anybody out, and session ids are visible to whoever holds one.
	sessions, err := s.store.ListSessions(r.Context(), p.UserID)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	for _, session := range sessions {
		if session.ID == id {
			if err := s.store.DeleteSession(auditContext(r), id); err != nil {
				s.writeStoreError(w, r, err)
				return
			}
			if id == p.SessionID {
				s.clearSessionCookie(w)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeProblem(w, r, http.StatusNotFound, CodeNotFound, "no such session")
}

// handleLookupUser resolves an email address to a user id, so that a person who
// knows a colleague's address can add them to a drop.
//
// This is an existence oracle over email addresses. Three things bound it: the
// caller must already administer at least one drop, the response carries only
// an id and a display name, and every call is logged. An invite flow keyed on
// the address — resolved when the invitee first signs in — is the better answer
// and is deliberately deferred (guide §12.4).
func (s *Server) handleLookupUser(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsRead)
	if !ok {
		return
	}

	admins, err := s.administersAnything(r, p)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	if !admins {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"looking up a user requires administering at least one drop")
		return
	}

	email := strings.TrimSpace(r.URL.Query().Get("email"))
	log.Info().Str("actor", p.Label()).Msg("user lookup by email")

	user, err := s.store.FindUserByEmail(r.Context(), email)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, map[string]any{
		"id":   user.ID,
		"name": user.DisplayName(),
	})
}

// administersAnything reports whether p is an admin on at least one drop.
func (s *Server) administersAnything(r *http.Request, p auth.Principal) (bool, error) {
	if p.Kind == auth.KindRoot {
		return true, nil
	}
	drops, err := s.store.VisibleDrops(r.Context(), p)
	if err != nil {
		return false, err
	}
	for _, drop := range drops {
		acl, err := s.store.DropACL(r.Context(), drop.Name)
		if err != nil {
			return false, err
		}
		if auth.EffectiveRole(p, acl).AtLeast(auth.RoleAdmin) {
			return true, nil
		}
	}
	return false, nil
}
