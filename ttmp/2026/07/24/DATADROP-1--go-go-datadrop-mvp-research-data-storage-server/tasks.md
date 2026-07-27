# Tasks

## TODO

### MVP v0.1 — research data storage server

- [x] 1. Skeleton: `cmd/datadrop/main.go` with cobra `serve`/`create`/`push`/`tail`/`query`/`export` stubs; `net/http` ServeMux; SQLite open/close (see design/01 §7.1)
- [x] 2. Store: `pkg/store` with drops, events, schemas, audit tables + migrations (design/01 §5.1)
- [x] 3. Ingest: `POST /v1/drops/{name}/events`; CloudEvents envelope; ULID id; per-drop sequence; JSON Schema validation strict/permissive (design/01 §5.2, §5.3)
- [x] 4. Query: latest-N and time-range; `datadrop query`/`tail` (design/01 §5.4)
- [x] 5. Stream: SSE hub; `datadrop tail --follow`
- [x] 6. Export: CSV/NDJSON/JSON from query results
- [x] 7. Auth + audit: bearer token middleware; audit log writes (DR-3)
- [x] 8. Tests + docs: service/store tests (mirror tinyidp-opendrop test split); README quickstart; end-to-end CLI smoke test

### Decisions to confirm

- [x] DR-1: standalone binary vs. TinyIDP overlay (proposed: standalone)
- [x] DR-3: bearer token for v0.1, DPoP for v0.2 (proposed)
- [x] Binary name: `datadrop` vs `opendrop` (proposed: `datadrop`)

## DONE

- [x] Retrieve OpenDrop conversation transcript + artifacts via `surf` (see reference/01-investigation-diary.md)
- [x] Create docmgr ticket DATADROP-1 and import sources into `sources/`
- [x] Write MVP design doc mapping sources to v0.1 scope (design/01-mvp-design.md)
