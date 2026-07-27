package server

import (
	"net/http"
	"testing"
)

type gcResponse struct {
	Scanned    int   `json:"scanned"`
	Referenced int   `json:"referenced"`
	Deleted    int   `json:"deleted"`
	FreedBytes int64 `json:"freed_bytes"`
	MinAge     int   `json:"min_age_seconds"`
}

func TestGarbageCollectRequiresAuth(t *testing.T) {
	srv := newTestServer(t)

	if rec := request(t, srv, http.MethodPost, "/v1/blobs/gc", "", false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// The whole point of the grace period: a sweep must not delete bytes that were
// just uploaded, because a draft's metadata row may not exist yet.
func TestGarbageCollectRespectsTheGracePeriod(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")
	request(t, srv, http.MethodDelete, "/v1/drops/greenhouse/datasets/readings/versions/1", "", true)

	// The blob is now unreferenced, but it was written seconds ago.
	rec := request(t, srv, http.MethodPost, "/v1/blobs/gc", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}

	var result gcResponse
	decodeBody(t, rec, &result)
	if result.Deleted != 0 {
		t.Fatalf("deleted %d recently written blob(s), want 0", result.Deleted)
	}

	// And the bytes are still retrievable.
	if head := headRequest(t, srv, "/v1/blobs/"+sha256Of(csvBody), true); head.Code != http.StatusOK {
		t.Fatalf("HEAD blob after GC = %d, want 200", head.Code)
	}
}

// A blob still referenced by another version must survive a sweep.
func TestGarbageCollectKeepsSharedBlobs(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	publish(t, srv, "greenhouse", "readings", "data.csv", csvBody, "")

	// Version 2 mounts the same bytes.
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	mount(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/2/files/data.csv?digest="+sha256Of(csvBody))
	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions/2/commit", "", true)

	// Deleting version 1 leaves the bytes referenced by version 2.
	request(t, srv, http.MethodDelete, "/v1/drops/greenhouse/datasets/readings/versions/1", "", true)

	rec := request(t, srv, http.MethodPost, "/v1/blobs/gc?min_age_seconds=1", "", true)
	var result gcResponse
	decodeBody(t, rec, &result)

	if result.Referenced != 1 {
		t.Fatalf("referenced = %d, want 1", result.Referenced)
	}
	if head := headRequest(t, srv, "/v1/blobs/"+sha256Of(csvBody), true); head.Code != http.StatusOK {
		t.Fatalf("a blob still referenced by version 2 was deleted: HEAD = %d", head.Code)
	}
}

// Draft files count as referenced. They must, or a sweep would delete bytes out
// from under a version that is still being assembled.
func TestGarbageCollectKeepsDraftBlobs(t *testing.T) {
	srv := newTestServer(t)
	seedDrop(t, srv, "greenhouse")

	request(t, srv, http.MethodPost, "/v1/drops/greenhouse/datasets/readings/versions", "", true)
	upload(t, srv, "/v1/drops/greenhouse/datasets/readings/versions/1/files/data.csv",
		csvBody, "text/csv", true)
	// Deliberately not committed.

	rec := request(t, srv, http.MethodPost, "/v1/blobs/gc?min_age_seconds=1", "", true)
	var result gcResponse
	decodeBody(t, rec, &result)

	if result.Referenced != 1 {
		t.Fatalf("referenced = %d, want 1 — a draft's files must count as referenced", result.Referenced)
	}
	if result.Deleted != 0 {
		t.Fatalf("deleted %d blob(s) belonging to a draft, want 0", result.Deleted)
	}
}

func TestGarbageCollectRejectsBadMinAge(t *testing.T) {
	srv := newTestServer(t)

	for _, raw := range []string{"abc", "-1", "1.5"} {
		rec := request(t, srv, http.MethodPost, "/v1/blobs/gc?min_age_seconds="+raw, "", true)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("min_age_seconds=%q: status %d, want %d", raw, rec.Code, http.StatusBadRequest)
		}
	}
}

// Zero must select the default rather than disabling the check, so the unsafe
// behaviour cannot be requested over HTTP at all.
func TestGarbageCollectZeroMinAgeUsesTheDefault(t *testing.T) {
	srv := newTestServer(t)

	rec := request(t, srv, http.MethodPost, "/v1/blobs/gc?min_age_seconds=0", "", true)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	var result gcResponse
	decodeBody(t, rec, &result)
	if result.MinAge <= 0 {
		t.Fatalf("min_age_seconds = %d, want the default grace period", result.MinAge)
	}
}
