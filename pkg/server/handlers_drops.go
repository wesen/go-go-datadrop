package server

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func (s *Server) handleCreateDrop(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, auth.ScopeDropsWrite)
	if !ok {
		return
	}

	var req datadrop.CreateDropRequest
	if !s.decodeJSON(w, r, &req) {
		return
	}

	if err := datadrop.ValidateName("drop", req.Name); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}
	if err := datadrop.ValidateRetention(req.Retention); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	// The creator owns it. This is the only way a drop acquires an owner other
	// than an explicit claim, and it is why every drop created from now on is
	// owned while every drop created before DATADROP-5 is not (DR-25).
	//
	// The root principal has no user id, so a drop created with the static
	// token is unowned — deliberately: attributing it to "root" would invent an
	// owner that no one can sign in as.
	d, err := s.store.CreateDrop(auditContext(r), datadrop.Drop{
		Name:       req.Name,
		Retention:  req.Retention,
		PublicRead: req.PublicRead,
		OwnerID:    p.UserID,
	})
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusCreated, d)
}

func (s *Server) handleListDrops(w http.ResponseWriter, r *http.Request) {
	// No authorize() call: a listing is not a single decision, it is a filter.
	// An anonymous caller sees the public_read drops and nothing else, which is
	// both useful and exactly what they could discover by guessing names.
	//
	// This is a behaviour change from v0.1, where listing required the token
	// unconditionally on the grounds that "which drops exist" is metadata about
	// every drop. With ownership that reasoning no longer holds: the answer is
	// now per-caller, so there is nothing global to protect.
	p := auth.FromContext(r.Context())
	if p.IsAuthenticated() && !p.Allowed(auth.ScopeDropsRead) {
		// Listing is deliberately available to anonymous callers for public drops,
		// but an authenticated credential with no drops:read scope must not use
		// the user's ownership or membership to reveal private drop metadata.
		p = auth.Anonymous()
	}

	drops, err := s.store.VisibleDrops(r.Context(), p)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	if err := s.annotateRoles(r, p, drops); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"count": len(drops),
		"drops": drops,
	})
}

// annotateRoles fills in Drop.YourRole for the calling principal.
//
// It exists so the UI can grey out an action it knows will 403 rather than
// offering it and failing — the same principle as a disabled menu entry showing
// the rule instead of hiding it. One ACL read per drop, which is acceptable for
// a listing the caller can already see in full.
func (s *Server) annotateRoles(r *http.Request, p auth.Principal, drops []datadrop.Drop) error {
	for i := range drops {
		acl, err := s.store.DropACL(r.Context(), drops[i].Name)
		if err != nil {
			return err
		}
		drops[i].YourRole = string(auth.EffectiveRole(p, acl))
	}
	return nil
}

func (s *Server) handleGetDrop(w http.ResponseWriter, r *http.Request) {
	name, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, name, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	stats, err := s.store.DropStats(r.Context(), name)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, stats)
}

// decodeJSON reads a JSON request body under the configured size cap.
//
// It rejects unknown fields: silently ignoring a misspelled "public_reed"
// would create a drop with the wrong policy and no indication of why.
func (s *Server) decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	body, ok := s.readBody(w, r)
	if !ok {
		return false
	}

	decoder := json.NewDecoder(bytesReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			errors.Wrap(err, "invalid request body").Error())
		return false
	}
	return true
}

// readBody reads the request body, enforcing MaxBodyBytes.
//
// http.MaxBytesReader is what makes the cap real: without it a client could
// stream an unbounded body and we would buffer all of it before noticing.
func (s *Server) readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	limited := http.MaxBytesReader(w, r.Body, s.cfg.MaxBodyBytes)

	body, err := io.ReadAll(limited)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeProblem(w, r, http.StatusRequestEntityTooLarge, CodePayloadTooLarge,
				"request body exceeds the configured maximum")
			return nil, false
		}
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			errors.Wrap(err, "could not read request body").Error())
		return nil, false
	}
	return body, true
}
