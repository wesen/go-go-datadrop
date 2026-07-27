package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/schema"
)

// handlePutSchema registers a new schema version for a stream.
//
// The document is compiled here, at registration time, so a malformed schema is
// a 400 the author sees immediately rather than a 500 on somebody else's next
// ingest.
func (s *Server) handlePutSchema(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleWriter, auth.ScopeDropsWrite); !ok {
		return
	}
	streamName, ok := pathName(w, r, "stream", "stream")
	if !ok {
		return
	}

	mode, err := datadrop.ParseMode(r.URL.Query().Get("mode"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	body, ok := s.readBody(w, r)
	if !ok {
		return
	}

	if _, err := schema.Compile(body); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeSchemaInvalid, err.Error())
		return
	}

	registered, err := s.store.PutSchema(auditContext(r), datadrop.Schema{
		Drop:   dropName,
		Stream: streamName,
		Mode:   mode,
		Spec:   json.RawMessage(body),
	})
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusCreated, datadrop.PutSchemaResult{
		Drop:    registered.Drop,
		Stream:  registered.Stream,
		Version: registered.Version,
		Mode:    registered.Mode,
	})
}

// handleGetSchema returns the active (highest-versioned) schema for a stream.
func (s *Server) handleGetSchema(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	streamName, ok := pathName(w, r, "stream", "stream")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	active, err := s.store.ActiveSchema(r.Context(), dropName, streamName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, active)
}
