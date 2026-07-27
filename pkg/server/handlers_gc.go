package server

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
)

// handleGarbageCollect deletes stored bytes that no dataset file references.
//
// The referenced set comes from the metadata database and the sweep happens in
// the blob store, which is why the blob store does not need to know what a
// dataset is.
//
// The grace period is a correctness requirement rather than a tuning knob: a
// blob written moments ago for a draft whose dataset_files row has not been
// inserted yet is momentarily unreferenced, and deleting it would destroy an
// in-flight upload. `min_age_seconds=0` selects the default rather than
// disabling the check, so there is no way to request the unsafe behaviour over
// HTTP.
func (s *Server) handleGarbageCollect(w http.ResponseWriter, r *http.Request) {
	// Instance-wide: this deletes unreferenced bytes across every drop, so
	// there is no per-drop sense in which a member may perform it.
	if _, ok := s.authorize(w, r, auth.ScopeAdmin); !ok {
		return
	}

	minAge := blob.DefaultGCMinAge
	if raw := r.URL.Query().Get("min_age_seconds"); raw != "" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds < 0 {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
				"invalid min_age_seconds "+strconv.Quote(raw)+
					": expected a non-negative integer")
			return
		}
		if seconds > 0 {
			minAge = time.Duration(seconds) * time.Second
		}
	}

	referenced, err := s.store.ReferencedDigests(r.Context())
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	digests := make(map[blob.Digest]struct{}, len(referenced))
	for digest := range referenced {
		digests[blob.Digest(digest)] = struct{}{}
	}

	result, err := s.blobs.GC(r.Context(), digests, minAge)
	if err != nil {
		s.internalError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusOK, map[string]any{
		"scanned":         result.Scanned,
		"referenced":      len(digests),
		"deleted":         result.Deleted,
		"freed_bytes":     result.FreedBytes,
		"min_age_seconds": int(minAge.Seconds()),
	})
}
