package server

import (
	"net/http"
	"strconv"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// CodeImmutable is returned when a request would modify a committed version.
const CodeImmutable = "VersionImmutable"

func (s *Server) handleListDatasets(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}
	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	datasets, err := s.store.ListDatasets(r.Context(), dropName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"drop":     dropName,
		"count":    len(datasets),
		"datasets": datasets,
	})
}

func (s *Server) handleGetDataset(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	dataset, err := s.store.GetDataset(r.Context(), dropName, datasetName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, dataset)
}

func (s *Server) handleOpenDatasetVersion(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleWriter, auth.ScopeDatasetsWrite); !ok {
		return
	}

	version, err := s.store.OpenDatasetVersion(auditContext(r), dropName, datasetName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusCreated, version)
}

func (s *Server) handleGetDatasetVersion(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	version, ok := s.resolveVersion(w, r, dropName, datasetName)
	if !ok {
		return
	}

	// includeDrafts is false: a reader must never observe a version that is
	// still being assembled.
	found, err := s.store.GetDatasetVersion(r.Context(), dropName, datasetName, version, false)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, found)
}

func (s *Server) handleCommitDatasetVersion(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleWriter, auth.ScopeDatasetsWrite); !ok {
		return
	}

	// A draft is being committed, so the literal "latest" is meaningless here —
	// it resolves over committed versions only.
	version, ok := s.parseVersionNumber(w, r)
	if !ok {
		return
	}

	var req datadrop.CommitVersionRequest
	if r.ContentLength != 0 {
		if !s.decodeJSON(w, r, &req) {
			return
		}
	}

	committed, err := s.store.CommitDatasetVersion(auditContext(r), dropName, datasetName, version, req)
	if err != nil {
		s.writeDatasetError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, committed)
}

func (s *Server) handleDeleteDatasetVersion(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	// Admin, not writer: deleting a published version destroys something other
	// people may already be citing, which is a different kind of act from
	// adding to the drop.
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleAdmin, auth.ScopeDatasetsWrite); !ok {
		return
	}
	version, ok := s.resolveVersion(w, r, dropName, datasetName)
	if !ok {
		return
	}

	if err := s.store.DeleteDatasetVersion(auditContext(r), dropName, datasetName, version); err != nil {
		s.writeDatasetError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"drop": dropName, "dataset": datasetName, "version": version, "deleted": true,
	})
}

// datasetPath validates the drop and dataset path parameters.
func (s *Server) datasetPath(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return "", "", false
	}
	datasetName, ok := pathName(w, r, "dataset", "dataset")
	if !ok {
		return "", "", false
	}
	return dropName, datasetName, true
}

// resolveVersion turns the {version} path element into a number, resolving the
// literal "latest" to the highest committed version.
func (s *Server) resolveVersion(
	w http.ResponseWriter, r *http.Request, drop, dataset string,
) (int, bool) {
	raw := r.PathValue("version")
	if raw == datadrop.LatestVersion {
		version, err := s.store.ResolveLatestVersion(r.Context(), drop, dataset)
		if err != nil {
			s.writeStoreError(w, r, err)
			return 0, false
		}
		return version, true
	}
	return s.parseVersionNumber(w, r)
}

// parseVersionNumber reads {version} strictly as a positive integer.
func (s *Server) parseVersionNumber(w http.ResponseWriter, r *http.Request) (int, bool) {
	raw := r.PathValue("version")

	version, err := strconv.Atoi(raw)
	if err != nil || version < 1 {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"invalid version "+strconv.Quote(raw)+": expected a positive integer")
		return 0, false
	}
	return version, true
}

// writeDatasetError adds the immutability sentinel to the standard store-error
// mapping. Attempting to modify a committed version is a conflict, not a
// generic failure, and clients branch on it.
func (s *Server) writeDatasetError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, store.ErrImmutable) {
		writeProblem(w, r, http.StatusConflict, CodeImmutable, err.Error())
		return
	}
	s.writeStoreError(w, r, err)
}
