# Changelog

## 2026-07-24

- Initial workspace created


## 2026-07-24

Created DATADROP-2 with an intern-facing specification for dataset upload and retrieval: content-addressed blob storage, immutable versioned datasets with manifests and schemas, a three-phase streaming upload protocol with a digest precheck, Range-capable download, and materialization of dataset rows into v0.1 event streams with provenance. Eleven-task plan.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/24/DATADROP-2--dataset-upload-and-retrieval-bulk-datasets-with-manifests-and-schemas/design/01-intern-implementation-guide.md — The specification


## 2026-07-24

Tasks 1-3 (commits 7174ee6, d30c44c): content-addressed blob store with atomic publish and GC grace period; migration 0002 with blobs/datasets/dataset_versions/dataset_files; dataset store with the draft→committed state machine. A test caught version-number reuse after deletion; fixed with a next_version counter, the same pattern stream_heads uses for event sequences.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/blob/store.go — Content-addressed store
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/store/datasets.go — Draft/committed state machine and version allocation


## 2026-07-24

Tasks 4-7 (commit 8e25f80): the dataset HTTP surface — staged upload with a digest-precheck mount fast path, single-shot PUT, http.ServeContent download with Range/ETag/304, listing, and a streaming tar archive. Fixed two bugs found by manual testing: client-default Content-Type being recorded as fact into an immutable version, and a test that lowered the JSON body cap before its own JSON setup.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/handlers_blobs.go — Upload, download, archive
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/handlers_datasets.go — Dataset metadata endpoints


## 2026-07-24

Tasks 8-11 (commits fad864a, 2e93cab, 59f13ae, 1d4b314): client and CLI with the staged push, materialization of dataset rows into streams with provenance and deterministic identifiers, blob garbage collection, and end-to-end acceptance tests. DATADROP-2 complete: 213 tests, golangci-lint clean. Measured dedup: republishing with one changed file transferred 71 B instead of 645 KB.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/cmd/datadrop/dataset_smoke_test.go — Acceptance tests
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/dataset.go — Dataset CLI
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/handlers_import.go — Materialization with provenance


## 2026-07-26

Closed: bulk dataset upload, manifests and schemas complete; the dataset verbs are the surface DATADROP-9 now converts to Glazed commands.

