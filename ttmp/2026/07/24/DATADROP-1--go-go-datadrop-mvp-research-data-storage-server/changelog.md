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

