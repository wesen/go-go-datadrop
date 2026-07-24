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

