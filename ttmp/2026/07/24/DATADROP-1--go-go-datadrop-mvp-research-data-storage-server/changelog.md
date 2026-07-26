# Changelog

## 2026-07-24

- Initial workspace created


## 2026-07-24

Retrieved Open Source Wolfram Datadrop ChatGPT conversation (transcript + 5 artifacts) via surf and imported into sources/. Created DATADROP-1 ticket, wrote v0.1 MVP design (design/01-mvp-design.md) and investigation diary (reference/01-investigation-diary.md).

### Related Files

- /home/manuel/code/wesen/go-go-golems/go-go-datadrop/ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/sources/open-source-wolfram-datadrop-transcript.md — Source conversation retrieved via surf chatgpt transcript


## 2026-07-24

Added intern implementation guide (design/02) reconciling the OpenDrop design with both reference implementations, plus an implementation diary (reference/02). Guide documents the corrected SQLite schema, the sequence-reservation/hub/SSE patterns ported from opendrop-pod, the full HTTP+CLI API reference, and six open inconsistencies between the ticket's documents.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md — Intern-facing spec for the v0.1 MVP
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/reference/02-implementation-diary.md — Chronological implementation record


## 2026-07-24

Step 3 / MVP task 1 (commit 52e3950): datadrop skeleton — cmd/datadrop cobra tree with serve implemented and six client commands stubbed, net/http ServeMux with /healthz and graceful shutdown, and pkg/store with the full v0.1 SQLite schema behind a forward-only embedded migration runner. Verified: build, tests, golangci-lint 0 issues, logcopter-check, tmux smoke test.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/cmd/datadrop/main.go — New binary entry point per design 01 §5.4
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/server.go — HTTP surface and lifecycle
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/store/migrations/0001_init.sql — v0.1 schema with the corrected events.stream column and stream_heads allocator
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/store/store.go — SQLite open/migrate; pure-Go driver DSN pragmas per DR-2


## 2026-07-24

Step 4 / MVP task 2 (commit d7696da): store layer — pkg/datadrop domain types, AppendEvent with in-transaction per-(drop,stream) sequence reservation and idempotent replay, QueryEvents/EachEvent, immutable schema versions, audit log. Resolved DR-1/DR-3/binary-name decisions and removed cmd/go-go-datadrop.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/datadrop/event.go — Shared domain vocabulary
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/store/events.go — The core storage invariant


## 2026-07-24

Step 5 / MVP tasks 3-8 (commit a78f08e): v0.1 complete — JSON Schema validation (strict/permissive), ingest accepting both request shapes, query with cursors and time ranges, SSE hub with slow-subscriber eviction and Last-Event-ID resume, CSV/NDJSON/JSON export, bearer auth with public_read, and an end-to-end CLI acceptance test. golangci-lint clean; 83 tests passing.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/cmd/datadrop/smoke_test.go — v0.1 acceptance test
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/handlers_events.go — Ingest ordering: validate, commit, publish
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/handlers_stream.go — SSE replay-then-tail


## 2026-07-24

Step 6: closed the direct-test gap in pkg/datadrop, pkg/client, and pkg/cli (30 new tests). Corrected the test count in the ticket index from 83 to 125 (148 including subtests). The pkg/cli tests specify the key=value JSON heuristic that the README describes in prose.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/push_test.go — Specification of the key=value typing heuristic
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/client/client_test.go — Auth header, problem-document decoding, SSE parsing
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/datadrop/datadrop_test.go — Allowlist and query-normalization boundaries, incl. SQL-injection cases


## 2026-07-26

Closed: MVP server complete — storage, ingest, query and the CLI skeleton all landed and in use by every later ticket.

