package server

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func (s *Server) handleCreateDrop(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
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

	d, err := s.store.CreateDrop(auditContext(r), datadrop.Drop{
		Name:       req.Name,
		Retention:  req.Retention,
		PublicRead: req.PublicRead,
	})
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusCreated, d)
}

func (s *Server) handleListDrops(w http.ResponseWriter, r *http.Request) {
	// Listing reveals which drops exist, which is metadata about every drop
	// rather than about one — so it always requires the token, even when some
	// individual drops are public_read.
	if !s.authenticate(w, r) {
		return
	}

	drops, err := s.store.ListDrops(r.Context())
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"count": len(drops),
		"drops": drops,
	})
}

func (s *Server) handleGetDrop(w http.ResponseWriter, r *http.Request) {
	name, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, name) {
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
