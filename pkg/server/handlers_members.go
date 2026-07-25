package server

import (
	"net/http"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	// Reader, not admin: knowing who else can see a drop you can see is not a
	// privilege, and hiding it makes "why can they read this" unanswerable
	// without asking an administrator.
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	members, err := s.store.ListMembers(r.Context(), dropName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	drop, err := s.store.GetDrop(r.Context(), dropName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"drop":    dropName,
		"owner":   drop.OwnerID,
		"count":   len(members),
		"members": members,
	})
}

func (s *Server) handleSetMember(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	p, ok := s.authorizeDrop(w, r, dropName, auth.RoleAdmin, auth.ScopeAdmin)
	if !ok {
		return
	}

	var req datadrop.SetMemberRequest
	if !s.decodeJSON(w, r, &req) {
		return
	}
	role, err := auth.ParseRole(string(req.Role))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	if err := s.store.SetMember(
		auditContext(r), dropName, r.PathValue("userId"), role, p.UserID,
	); err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleAdmin, auth.ScopeAdmin); !ok {
		return
	}

	if err := s.store.RemoveMember(auditContext(r), dropName, r.PathValue("userId")); err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleClaimDrop takes ownership of an unowned drop — one created before
// DATADROP-5, or by the root principal.
//
// Deliberately NOT gated on authorizeDrop: an unowned private drop gives an
// ordinary user no role at all, so requiring a role here would make it
// unclaimable by anyone but root, and the whole point is that the person who
// has been using it can adopt it. What bounds it instead is the store's atomic
// `WHERE owner_id IS NULL`: the first claim wins, a second gets a 409, and an
// owned drop can never be taken.
func (s *Server) handleClaimDrop(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	p, ok := s.authorize(w, r, auth.ScopeDropsWrite)
	if !ok {
		return
	}
	if p.UserID == "" {
		writeProblem(w, r, http.StatusForbidden, CodeForbidden,
			"only a signed-in user can own a drop")
		return
	}

	if err := s.store.ClaimDrop(auditContext(r), dropName, p.UserID); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	drop, err := s.store.GetDrop(r.Context(), dropName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	drop.YourRole = string(auth.RoleAdmin)
	writeJSON(w, r, http.StatusOK, drop)
}
