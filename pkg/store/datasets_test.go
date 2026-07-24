package store

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const testDigest = "sha256:" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func otherDigest(suffix string) string {
	base := strings.Repeat("a", 64-len(suffix)) + suffix
	return "sha256:" + base
}

// openDraft opens a draft version on a freshly created drop.
func openDraft(t *testing.T, st *Store, drop, dataset string) datadrop.DatasetVersion {
	t.Helper()

	v, err := st.OpenDatasetVersion(context.Background(), drop, dataset)
	if err != nil {
		t.Fatalf("OpenDatasetVersion: %v", err)
	}
	return v
}

func addFile(t *testing.T, st *Store, drop, dataset string, version int, path, digest string, size int64) {
	t.Helper()

	err := st.AddDatasetFile(context.Background(), drop, dataset, version, datadrop.DatasetFile{
		Path: path, Digest: digest, SizeBytes: size,
	})
	if err != nil {
		t.Fatalf("AddDatasetFile(%q): %v", path, err)
	}
}

func commit(t *testing.T, st *Store, drop, dataset string, version int, manifest string) datadrop.DatasetVersion {
	t.Helper()

	req := datadrop.CommitVersionRequest{}
	if manifest != "" {
		req.Manifest = json.RawMessage(manifest)
	}
	v, err := st.CommitDatasetVersion(context.Background(), drop, dataset, version, req)
	if err != nil {
		t.Fatalf("CommitDatasetVersion: %v", err)
	}
	return v
}

func TestOpenDatasetVersionIsMonotonic(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for want := 1; want <= 3; want++ {
		v := openDraft(t, st, "greenhouse", "readings")
		if v.Version != want {
			t.Fatalf("Version = %d, want %d", v.Version, want)
		}
		if v.State != datadrop.StateDraft {
			t.Fatalf("State = %q, want %q", v.State, datadrop.StateDraft)
		}
		commit(t, st, "greenhouse", "readings", v.Version, "")
	}

	// A deleted version must not have its number reused, or a citation to it
	// would silently start resolving to different content.
	if err := st.DeleteDatasetVersion(ctx, "greenhouse", "readings", 3); err != nil {
		t.Fatalf("DeleteDatasetVersion: %v", err)
	}
	next := openDraft(t, st, "greenhouse", "readings")
	if next.Version != 4 {
		t.Fatalf("version after deleting 3 = %d, want 4 (numbers are never reused)", next.Version)
	}
}

func TestOpenDatasetVersionRequiresAnExistingDrop(t *testing.T) {
	_, err := newTestStore(t).OpenDatasetVersion(context.Background(), "missing", "readings")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("returned %v, want ErrNotFound", err)
	}
}

func TestOpenDatasetVersionValidatesNames(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for _, name := range []string{"", "Not Valid", "has/slash", "-leading"} {
		if _, err := st.OpenDatasetVersion(ctx, "greenhouse", name); err == nil {
			t.Errorf("OpenDatasetVersion accepted dataset name %q", name)
		}
	}
}

// The commit boundary: a draft must be invisible to every reader.
func TestDraftVersionsAreInvisible(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	committedVersion := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", committedVersion.Version, "data.csv", testDigest, 100)
	commit(t, st, "greenhouse", "readings", committedVersion.Version, "")

	// Version 2 stays a draft.
	draft := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", draft.Version, "data.csv", otherDigest("bb"), 200)

	t.Run("ListDatasetVersions omits it", func(t *testing.T) {
		versions, err := st.ListDatasetVersions(ctx, "greenhouse", "readings")
		if err != nil {
			t.Fatalf("ListDatasetVersions: %v", err)
		}
		for _, v := range versions {
			if v.Version == draft.Version {
				t.Fatalf("a draft version appeared in the listing: %+v", v)
			}
		}
	})

	t.Run("GetDatasetVersion omits it", func(t *testing.T) {
		if _, err := st.GetDatasetVersion(ctx, "greenhouse", "readings", draft.Version, false); !errors.Is(err, ErrNotFound) {
			t.Fatalf("GetDatasetVersion returned %v for a draft, want ErrNotFound", err)
		}
	})

	t.Run("latest does not resolve to it", func(t *testing.T) {
		latest, err := st.ResolveLatestVersion(ctx, "greenhouse", "readings")
		if err != nil {
			t.Fatalf("ResolveLatestVersion: %v", err)
		}
		if latest != committedVersion.Version {
			t.Fatalf("latest = %d, want the committed %d (a draft must not shadow it)",
				latest, committedVersion.Version)
		}
	})

	t.Run("GetDatasetFile omits its files", func(t *testing.T) {
		if _, err := st.GetDatasetFile(ctx, "greenhouse", "readings", draft.Version, "data.csv"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("GetDatasetFile returned %v for a draft's file, want ErrNotFound", err)
		}
	})

	t.Run("GetDataset lists only committed versions", func(t *testing.T) {
		d, err := st.GetDataset(ctx, "greenhouse", "readings")
		if err != nil {
			t.Fatalf("GetDataset: %v", err)
		}
		if len(d.Versions) != 1 || d.Versions[0].Version != committedVersion.Version {
			t.Fatalf("GetDataset returned versions %+v, want only the committed one", d.Versions)
		}
	})
}

// Committed versions are immutable: that is what makes a version reference a
// stable citation.
func TestCommittedVersionsAreImmutable(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", v.Version, "data.csv", testDigest, 100)
	commit(t, st, "greenhouse", "readings", v.Version, "")

	err := st.AddDatasetFile(ctx, "greenhouse", "readings", v.Version, datadrop.DatasetFile{
		Path: "extra.csv", Digest: otherDigest("cc"), SizeBytes: 10,
	})
	if !errors.Is(err, ErrImmutable) {
		t.Fatalf("adding a file to a committed version returned %v, want ErrImmutable", err)
	}

	if _, err := st.CommitDatasetVersion(ctx, "greenhouse", "readings", v.Version,
		datadrop.CommitVersionRequest{}); !errors.Is(err, ErrImmutable) {
		t.Fatalf("re-committing returned %v, want ErrImmutable", err)
	}
}

// Replacing a file is a new version, not a mutation of the current one.
func TestDuplicatePathIsRejected(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", v.Version, "data.csv", testDigest, 100)

	err := st.AddDatasetFile(ctx, "greenhouse", "readings", v.Version, datadrop.DatasetFile{
		Path: "data.csv", Digest: otherDigest("dd"), SizeBytes: 200,
	})
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("adding a duplicate path returned %v, want ErrAlreadyExists", err)
	}
}

func TestAddDatasetFileValidatesPath(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")
	v := openDraft(t, st, "greenhouse", "readings")

	for _, path := range []string{
		"", "/absolute.csv", "../escape.csv", "a/../../escape.csv",
		"./relative.csv", "double//slash.csv", "back\\slash.csv",
	} {
		err := st.AddDatasetFile(ctx, "greenhouse", "readings", v.Version, datadrop.DatasetFile{
			Path: path, Digest: testDigest, SizeBytes: 1,
		})
		if err == nil {
			t.Errorf("AddDatasetFile accepted path %q", path)
		}
	}
}

func TestVersionCountersAccumulate(t *testing.T) {
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", v.Version, "a.csv", otherDigest("01"), 100)
	addFile(t, st, "greenhouse", "readings", v.Version, "b.csv", otherDigest("02"), 250)

	committed := commit(t, st, "greenhouse", "readings", v.Version, "")
	if committed.FileCount != 2 {
		t.Fatalf("FileCount = %d, want 2", committed.FileCount)
	}
	if committed.TotalBytes != 350 {
		t.Fatalf("TotalBytes = %d, want 350", committed.TotalBytes)
	}
	if committed.CommittedAt == nil {
		t.Fatal("CommittedAt is nil on a committed version")
	}
}

// The manifest is stored verbatim; only three fields are extracted.
func TestCommitExtractsManifestFields(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	manifest := `{"title":"Greenhouse readings","license":"CC-BY-4.0","row_count":18442,` +
		`"provenance":{"instrument":"DHT22"},"tags":["a","b"]}`

	committed := commit(t, st, "greenhouse", "readings", v.Version, manifest)

	// Everything survives, including the fields nothing interprets.
	for _, fragment := range []string{"provenance", "DHT22", "tags"} {
		if !strings.Contains(string(committed.Manifest), fragment) {
			t.Fatalf("the manifest lost %q: %s", fragment, committed.Manifest)
		}
	}

	// And the indexed fields are readable back through the store.
	read, err := st.GetDatasetVersion(ctx, "greenhouse", "readings", v.Version, false)
	if err != nil {
		t.Fatalf("GetDatasetVersion: %v", err)
	}
	parsed, err := datadrop.ParseManifest(read.Manifest)
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}
	if parsed.Title != "Greenhouse readings" || parsed.License != "CC-BY-4.0" {
		t.Fatalf("extracted fields wrong: %+v", parsed)
	}
	if parsed.RowCount == nil || *parsed.RowCount != 18442 {
		t.Fatalf("RowCount = %v, want 18442", parsed.RowCount)
	}
}

// Publishing must not require writing metadata first.
func TestCommitAcceptsAnEmptyManifest(t *testing.T) {
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	committed := commit(t, st, "greenhouse", "readings", v.Version, "")

	if string(committed.Manifest) != "{}" {
		t.Fatalf("Manifest = %s, want {}", committed.Manifest)
	}
}

func TestCommitRejectsMalformedManifest(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for name, manifest := range map[string]string{
		"not JSON":       `{"broken":`,
		"not an object":  `["a","b"]`,
		"bad row_count":  `{"row_count":"lots"}`,
		"negative rows":  `{"row_count":-1}`,
		"bad title type": `{"title":42}`,
	} {
		t.Run(name, func(t *testing.T) {
			v := openDraft(t, st, "greenhouse", "readings")
			_, err := st.CommitDatasetVersion(ctx, "greenhouse", "readings", v.Version,
				datadrop.CommitVersionRequest{Manifest: json.RawMessage(manifest)})
			if err == nil {
				t.Fatalf("commit accepted a manifest that is %s", name)
			}
		})
	}
}

func TestCommitStoresSchema(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	schema := `{"type":"object","required":["temperature"],"properties":{"temperature":{"type":"number","x-drop-unit":"Cel"}}}`

	if _, err := st.CommitDatasetVersion(ctx, "greenhouse", "readings", v.Version,
		datadrop.CommitVersionRequest{Schema: json.RawMessage(schema)}); err != nil {
		t.Fatalf("CommitDatasetVersion: %v", err)
	}

	read, err := st.GetDatasetVersion(ctx, "greenhouse", "readings", v.Version, false)
	if err != nil {
		t.Fatalf("GetDatasetVersion: %v", err)
	}
	if !strings.Contains(string(read.Schema), "x-drop-unit") {
		t.Fatalf("the schema round trip lost the extension keyword: %s", read.Schema)
	}
}

func TestListDatasets(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for _, name := range []string{"readings", "calibration"} {
		v := openDraft(t, st, "greenhouse", name)
		commit(t, st, "greenhouse", name, v.Version, "")
	}

	datasets, err := st.ListDatasets(ctx, "greenhouse")
	if err != nil {
		t.Fatalf("ListDatasets: %v", err)
	}
	if len(datasets) != 2 {
		t.Fatalf("got %d datasets, want 2", len(datasets))
	}
	// Name-ordered.
	if datasets[0].Name != "calibration" || datasets[1].Name != "readings" {
		t.Fatalf("datasets are not name-ordered: %+v", datasets)
	}
}

func TestResolveLatestWithNoCommittedVersion(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")
	openDraft(t, st, "greenhouse", "readings") // draft only

	if _, err := st.ResolveLatestVersion(ctx, "greenhouse", "readings"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ResolveLatestVersion returned %v with only a draft present, want ErrNotFound", err)
	}
}

// Deleting a version removes its file records but leaves blobs alone; the
// unreferenced ones are reclaimed by a sweep, which is what lets other versions
// keep sharing them.
func TestDeleteVersionLeavesBlobs(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	shared := otherDigest("ee")

	first := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", first.Version, "data.csv", shared, 100)
	commit(t, st, "greenhouse", "readings", first.Version, "")

	second := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", second.Version, "data.csv", shared, 100)
	commit(t, st, "greenhouse", "readings", second.Version, "")

	if err := st.DeleteDatasetVersion(ctx, "greenhouse", "readings", first.Version); err != nil {
		t.Fatalf("DeleteDatasetVersion: %v", err)
	}

	// The blob is still referenced by version 2, so it must remain in the
	// referenced set.
	referenced, err := st.ReferencedDigests(ctx)
	if err != nil {
		t.Fatalf("ReferencedDigests: %v", err)
	}
	if _, ok := referenced[shared]; !ok {
		t.Fatal("a digest still referenced by another version left the referenced set")
	}
}

func TestReferencedDigests(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", v.Version, "a.csv", otherDigest("11"), 1)
	addFile(t, st, "greenhouse", "readings", v.Version, "b.csv", otherDigest("22"), 2)

	referenced, err := st.ReferencedDigests(ctx)
	if err != nil {
		t.Fatalf("ReferencedDigests: %v", err)
	}
	if len(referenced) != 2 {
		t.Fatalf("got %d referenced digests, want 2", len(referenced))
	}

	// Draft files count as referenced. They must, or GC would delete bytes out
	// from under a version that is still being assembled.
	for _, digest := range []string{otherDigest("11"), otherDigest("22")} {
		if _, ok := referenced[digest]; !ok {
			t.Fatalf("digest %s from a draft is not in the referenced set", digest)
		}
	}
}

func TestDeleteMissingVersion(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if err := st.DeleteDatasetVersion(ctx, "greenhouse", "readings", 7); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting a missing version returned %v, want ErrNotFound", err)
	}
}

func TestGetDatasetNotFound(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.GetDataset(ctx, "greenhouse", "nosuch"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetDataset returned %v, want ErrNotFound", err)
	}
}

// Deleting a drop must take its datasets with it.
func TestDatasetsCascadeWithTheDrop(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	v := openDraft(t, st, "greenhouse", "readings")
	addFile(t, st, "greenhouse", "readings", v.Version, "data.csv", testDigest, 10)
	commit(t, st, "greenhouse", "readings", v.Version, "")

	if _, err := st.DB().ExecContext(ctx, `DELETE FROM drops WHERE name = ?`, "greenhouse"); err != nil {
		t.Fatalf("delete drop: %v", err)
	}

	var versions int
	if err := st.DB().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM dataset_versions`).Scan(&versions); err != nil {
		t.Fatalf("count versions: %v", err)
	}
	if versions != 0 {
		t.Fatalf("%d dataset versions survived the drop deletion, want 0", versions)
	}

	var files int
	if err := st.DB().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM dataset_files`).Scan(&files); err != nil {
		t.Fatalf("count files: %v", err)
	}
	if files != 0 {
		t.Fatalf("%d dataset files survived the drop deletion, want 0", files)
	}
}

func TestDatasetOperationsAreAudited(t *testing.T) {
	ctx := WithActor(context.Background(), "test-token")
	st := newTestStore(t)

	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "greenhouse"}); err != nil {
		t.Fatalf("CreateDrop: %v", err)
	}

	v, err := st.OpenDatasetVersion(ctx, "greenhouse", "readings")
	if err != nil {
		t.Fatalf("OpenDatasetVersion: %v", err)
	}
	if err := st.AddDatasetFile(ctx, "greenhouse", "readings", v.Version, datadrop.DatasetFile{
		Path: "data.csv", Digest: testDigest, SizeBytes: 10,
	}); err != nil {
		t.Fatalf("AddDatasetFile: %v", err)
	}
	if _, err := st.CommitDatasetVersion(ctx, "greenhouse", "readings", v.Version,
		datadrop.CommitVersionRequest{}); err != nil {
		t.Fatalf("CommitDatasetVersion: %v", err)
	}
	if err := st.DeleteDatasetVersion(ctx, "greenhouse", "readings", v.Version); err != nil {
		t.Fatalf("DeleteDatasetVersion: %v", err)
	}

	records, err := st.ListAudit(ctx, "greenhouse", 100)
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}

	seen := map[string]bool{}
	for _, rec := range records {
		seen[rec.Action] = true
	}
	for _, action := range []string{
		datadrop.ActionDatasetVersionOpen,
		datadrop.ActionDatasetFileAdd,
		datadrop.ActionDatasetVersionCommit,
		datadrop.ActionDatasetVersionDelete,
	} {
		if !seen[action] {
			t.Errorf("no audit record for %q", action)
		}
	}
}
