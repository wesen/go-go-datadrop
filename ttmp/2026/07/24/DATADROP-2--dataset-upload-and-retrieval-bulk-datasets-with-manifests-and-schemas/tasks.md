# Tasks

## TODO

- [x] 1. pkg/blob: content-addressed store — streaming Put with hashing, atomic rename, dedup, Open/Stat/Exists, GC with grace period, temp sweep (guide §6) <!-- t:lqvq -->
- [x] 2. Migration 0002 + domain types: blobs/datasets/dataset_versions/dataset_files tables; Manifest parsing; logical path validation (guide §7, §8) <!-- t:6zen -->
- [x] 3. pkg/store/datasets.go: draft→committed state machine, version monotonicity, immutability, ResolveLatest, ReferencedDigests (guide §7) <!-- t:2nn4 -->
- [x] 4. Upload endpoints: open draft, PUT file streaming + digest mount fast path, commit with manifest validation (guide §9) <!-- t:6vgf -->
- [x] 5. Download endpoints: http.ServeContent with Range/ETag, latest resolution, HEAD /v1/blobs/{digest} (guide §10) <!-- t:4bx3 -->
- [x] 6. Listing and inspection: datasets, versions, file lists (guide §12.1) <!-- t:wowd -->
- [x] 7. Archive: streaming tar of manifest + schema + files (guide §10.3) <!-- t:330p -->
- [x] 8. CLI: dataset push/list/show/get/rm/gc with local hashing and digest verification (guide §12.3) <!-- t:tynj -->
- [x] 9. Import: materialize CSV/NDJSON rows into a stream with provenance meta (guide §11) <!-- t:qop1 -->
- [x] 10. Deletion and GC endpoints + command <!-- t:lgwu -->
- [x] 11. Tests + docs: blob/store/handler tests, end-to-end smoke (dedup republish, ranged download, import), README <!-- t:k7xc -->
