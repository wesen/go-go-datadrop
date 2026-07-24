---
Title: Implementation diary
Ticket: DATADROP-1
Status: active
Topics:
    - backend
    - mvp
    - server
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://pkg/cli/root.go
      Note: Cobra root, exit-code contract, logcopter logging setup (commit 52e3950)
    - Path: repo://pkg/cli/serve.go
      Note: signal.NotifyContext -> store.Open -> server.New -> errgroup wiring (commit 52e3950)
    - Path: repo://pkg/server/server.go
      Note: net/http ServeMux surface, /healthz, context-driven graceful shutdown; WriteTimeout deliberately unset for SSE (commit 52e3950)
    - Path: repo://pkg/store/migrations/0001_init.sql
      Note: Full v0.1 schema incl. the corrected events.stream column and stream_heads allocator (commit 52e3950)
    - Path: repo://pkg/store/store.go
      Note: SQLite Open/Close + forward-only embedded migrations; driver-specific DSN pragmas (commit 52e3950)
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/01-mvp-design.md
      Note: The v0.1 scope and decision records this implementation follows
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md
      Note: Intern-facing guide produced in Step 2; the spec the code is written against
ExternalSources:
    - sources/opendrop-design.md
    - sources/opendrop-pod-mvp.zip
    - sources/tinyidp-opendrop-source.tar.gz
Summary: 'Chronological record of implementing the go-go-datadrop v0.1 MVP: orientation across the OpenDrop sources, the intern guide, and the first implementation slices.'
LastUpdated: 2026-07-24T00:00:00Z
WhatFor: Record what was built, what failed, and what a reviewer should check while implementing DATADROP-1.
WhenToUse: Read before resuming DATADROP-1 implementation; append a step after every meaningful change.
---


# Implementation diary

## Goal

Capture the implementation of the `go-go-datadrop` v0.1 MVP described in
`design/01-mvp-design.md`: a single binary that accepts append-only events over
HTTP and CLI, stores them in SQLite, validates them against JSON Schema, serves
latest-N / time-range queries, streams new events over SSE, and exports open
formats.

This diary is the continuation record. The prior diary
(`reference/01-investigation-diary.md`) covers how the source artifacts were
retrieved and how the v0.1 scope was decided; it stops before any code was
written.

---

## Step 1: Orientation — read every ticket document and both reference implementations

The ticket arrived with a scoped design (`design/01-mvp-design.md`), an
investigation diary, and five imported source artifacts totalling ~7,700 lines of
Markdown plus two Go codebases. Before writing a line of code I read the full
chain — index → design → investigation diary → the OpenDrop design document's
MVP-relevant sections → both reference Go implementations — so that the guide and
the implementation would be grounded in what already exists rather than in a
re-derived design.

The most valuable discovery was that the ticket ships **two** working Go
reference implementations, not one. The design doc mentions
`tinyidp-opendrop-source.tar.gz` prominently as "the reference slice", but
`opendrop-pod-mvp.zip` is the more useful model for v0.1: it is a *standalone*
binary with its own `go.mod`, `cmd/opendrop-pod` server, `cmd/dropctl` CLI,
`internal/store` (SQLite + migrations), `internal/realtime/hub.go` (fan-out), and
`internal/server/feed.go` (resumable streaming). DR-1 chose "standalone binary",
so the pod — not the TinyIDP overlay — is the closest structural precedent.

### Prompt Context

**User prompt (verbatim):** "Impelment the docmgr ticket DATADROP-1. First, familiarize yourself with all the documents, then Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then, implement the first MVP ticket. Keep a detailed frequent diary (see skill for format), and tell your subagents if necessary to do the same, and ensure they use the right format. Commit at appropriate intervals."

**Assistant interpretation:** Read the entire DATADROP-1 document set (ticket docs plus the imported OpenDrop sources), write a long-form, technically precise onboarding/implementation guide aimed at a new intern — prose, bullets, pseudocode, diagrams, API references, file references — store it as a docmgr document in the ticket, and upload it to reMarkable. Then implement the first MVP task from the ticket's task list, keeping a diary in the `diary` skill's strict format and committing at sensible boundaries.

**Inferred user intent:** Turn the accumulated design work into (a) a durable, teachable artifact that lets someone new pick up the project without re-reading 7,700 lines of source material, and (b) actual running code, so DATADROP-1 stops being a design ticket and becomes a working MVP. The diary requirement means the *process* must be reviewable, not just the result.

### What I did

- Read `docmgr list tickets`, `docmgr task list --ticket DATADROP-1` (11 open, 3 done), the ticket `index.md`, `design/01-mvp-design.md`, and `reference/01-investigation-diary.md`.
- Read `sources/opendrop-design.md` selectively but completely for the MVP-relevant sections: §6 principles, §7 conceptual model, §8 CLI UX, §10 event model, §11 schema/semantic layer, §12 ingestion, §13 query, §14 real-time, §18 API design, §19 authorization, §20 architecture, §21 database model, §22 retention/export, §29 technology choices, §30 repository structure, §32 roadmap, §33 first-release cut line, §34 acceptance criteria.
- Extracted both archives into the session scratchpad and read the load-bearing files:
  - `opendrop-pod/internal/store/open.go` — SQLite DSN construction, `SetMaxOpenConns(1)`, migration entry point, file-permission hardening.
  - `opendrop-pod/internal/store/streams.go` — `AppendEvent` with the `stream_heads` sequence-reservation pattern inside a transaction.
  - `opendrop-pod/internal/realtime/hub.go` — subscribe/publish fan-out with bounded buffers and drop-slow-subscriber semantics.
  - `opendrop-pod/internal/server/feed.go` — history replay from a durable cursor, then live tail, with heartbeats and a `reset` frame for slow consumers.
  - Archive manifests for `tinyidp-opendrop-source.tar.gz` (service/store split, `hub.go`, `stream.go`, `dpop.go`).
- Inspected the current repo: `go-go-datadrop` is an empty go-go-golems template — `cmd/go-go-datadrop/main.go` has an empty `main()`, `pkg/` holds only `doc.go` and generated `logcopter.go`, and `go.mod` has no dependencies beyond `logcopter`.
- Confirmed the repo is a git repository with `origin` → `go-go-golems/go-go-datadrop` and three commits, the most recent being the ticket import.
- Created two new ticket documents: `reference/02-implementation-diary.md` (this file) and `design/02-intern-implementation-guide.md`.

### Why

The ticket's own instruction ("familiarize yourself with all the documents") is
load-bearing: `design/01-mvp-design.md` is a *scope* document, not a
specification. It says "port the hub/broadcaster pattern" and "port the
store/stream model" without saying what those patterns are. Those answers live
only in the two archives, and an intern handed the design doc alone would have to
repeat the same extraction. Reading the references first is what makes the guide
worth writing.

### What worked

- `docmgr task list --ticket DATADROP-1` gave an immediately actionable ordered
  task list (tasks 1–8 are the phased plan from design §7; tasks 9–11 are open
  decision records). Task 1 is the MVP slice to implement.
- Reading the design doc by heading index (`grep -n '^## \|^### '`) rather than
  linearly kept the read to ~1,400 of 2,530 lines while covering every
  MVP-relevant section.
- The `opendrop-pod` archive turned out to be a near-exact structural template
  for the standalone binary DR-1 calls for, down to having both a server `cmd/`
  and a CLI `cmd/`.

### What didn't work

- `docmgr doc add --doc-type design-doc` created the file under a **new
  `design-doc/` directory**, not the ticket's existing `design/` directory, which
  already held `01-mvp-design.md`. docmgr derives the subdirectory from the
  doc-type slug (`design-doc`), while the ticket had been seeded with a `design/`
  directory. Fixed by moving the file to
  `design/02-intern-implementation-guide.md` and removing the empty
  `design-doc/`; `DocType: design-doc` stays in the frontmatter, so indexing is
  unaffected (docmgr reads the type from frontmatter, not the path).

### What I learned

- **There are two reference implementations with different trust models.**
  `tinyidp-opendrop` is an *overlay* on `go-go-golems/tiny-idp` with OAuth →
  DPoP; `opendrop-pod` is *standalone* with its own `internal/oauth` introspector
  and DPoP layer. DR-1 (standalone) plus DR-3 (bearer token only in v0.1) means
  v0.1 is roughly "opendrop-pod minus identity, minus scripts, minus sites".
- **The sequence-reservation pattern is the core storage invariant.** Both
  references reserve the next per-stream sequence inside the same transaction as
  the event insert, via an upsert into a `stream_heads` table
  (`INSERT ... ON CONFLICT DO NOTHING`, `SELECT sequence`, `sequence++`,
  `UPDATE`). Combined with `db.SetMaxOpenConns(1)` this makes monotonicity
  trivially correct on SQLite. The design doc's `UNIQUE(drop_name, seq)` is the
  belt to that suspenders.
- **The realtime hub is deliberately unreliable.** `opendrop-pod`'s hub comment
  is explicit: "Persistence and resumption come from the changes table; the hub
  is only a low-latency hint." A slow subscriber is *disconnected* (channel
  closed) rather than buffered without bound, and the client resumes from its last
  durable cursor. That is the design doc §14.3 backpressure rule made concrete,
  and it is the single most important thing to copy correctly.
- **The design's schema modes are four (`open`/`suggest`/`warn`/`strict`,
  §11.2), but `design/01-mvp-design.md` §3.1 describes them as three
  (`strict`/`permissive`/`observed`) and scopes v0.1 to `strict` + `permissive`.**
  These vocabularies do not line up. The MVP design's `permissive` is the design
  doc's `warn`. Flagged in the guide and below.

### What was tricky to build

Nothing was built in this step. The tricky part was *reconciliation*: the four
documents use overlapping but non-identical vocabularies for the same concepts.

- The OpenDrop design models `Drop → Streams → Events` with organizations above
  drops. `design/01-mvp-design.md` §5.1 flattens this: the `events` table has a
  `drop_name` and a `seq` but **no `stream` column**, while the `schemas` table
  *does* have a `stream` column and keys on `(drop_name, stream, version)`. A
  schema can therefore be registered for a stream that events can never be
  attributed to. Symptom: `PUT /v1/drops/{name}/schemas/{stream}` has no
  corresponding read path on ingest. Resolution recorded in the guide: add a
  `stream TEXT NOT NULL DEFAULT 'events'` column to `events` and make the
  sequence `UNIQUE(drop_name, stream, seq)`, matching both references and the
  design doc's §21 `PRIMARY KEY (stream_id, sequence)`.
- The reference `opendrop-pod` uses `github.com/mattn/go-sqlite3` (CGO), while
  DR-2 mandates `modernc.org/sqlite` (pure Go). The DSN query parameters differ
  between the two drivers (`_journal_mode` / `_busy_timeout` vs. modernc's
  `_pragma=` form), so the `open.go` pattern can be copied structurally but its
  DSN string cannot be copied literally. Noted in the guide as a concrete
  porting hazard.

### What warrants a second pair of eyes

- The schema-mode vocabulary mismatch above. If v0.1 should ship the design
  doc's `warn` semantics under the name `permissive`, the guide's mapping is
  right; if the intent was something else, the ingest path changes.
- The decision to add `stream` to the `events` table, which diverges from
  `design/01-mvp-design.md` §5.1 as literally written. It is a strict superset
  (default `events`) so nothing in the drafted HTTP surface breaks, but it is a
  deliberate deviation from the ticket's own SQL.
- Whether the CLI should be one binary (`datadrop serve` + `datadrop push`, per
  design §5.4) or two (`opendrop-pod` + `dropctl`, per the reference). The
  design doc's §5.4 CLI surface is unambiguous — one binary — but the repo's
  existing entry point is `cmd/go-go-datadrop`, not `cmd/datadrop`, so task 1's
  literal instruction ("`cmd/datadrop/main.go`") means adding a second command
  directory. See DR/task 11 (binary naming), still open.

### What should be done in the future

- Resolve tasks 9–11 (the three open decision records) explicitly rather than
  leaving them "proposed"; task 11 in particular blocks the binary layout.
- Decide whether `pkg/` or `internal/` is the home for the store/server packages.
  The design doc §30 uses `core/`; AGENT.md and the repo template use `pkg/`.
  The guide assumes `pkg/`, per repo convention.

### Code review instructions

- Nothing to review as code yet. To validate the orientation itself:
  - `docmgr task list --ticket DATADROP-1` — confirm the task list matches the
    phased plan in `design/01-mvp-design.md` §7.
  - `unzip -l ttmp/2026/07/24/DATADROP-1--*/sources/opendrop-pod-mvp.zip` —
    confirm `internal/store`, `internal/realtime`, `internal/server`,
    `cmd/opendrop-pod`, `cmd/dropctl` exist as described.
  - Compare `design/01-mvp-design.md` §5.1 (`events` table) against
    `sources/opendrop-design.md` §21 to see the missing `stream` column.

### Technical details

**Reference implementations, side by side**

| | `opendrop-pod` | `tinyidp-opendrop` |
|---|---|---|
| Shape | standalone binary, own `go.mod` | overlay command inside `tiny-idp` |
| Server entry | `cmd/opendrop-pod/main.go` | `cmd/tinyidp-opendrop/main.go` |
| CLI | `cmd/dropctl/main.go` | none (browser client) |
| Store | `internal/store/{open,records,streams,spaces,scripts,sites,security}.go` | `internal/opendrop/store*.go` |
| Realtime | `internal/realtime/hub.go` + `internal/server/feed.go` | `internal/opendrop/{hub,stream}.go` |
| Identity | `internal/oauth/introspector.go` + `internal/dpop` | TinyIDP OAuth + `dpop.go` |
| SQLite driver | `github.com/mattn/go-sqlite3` (CGO) | (same family) |

**Sequence reservation, as implemented in `opendrop-pod/internal/store/streams.go`**

```go
tx, _ := s.db.BeginTx(ctx, nil)
defer tx.Rollback()
tx.ExecContext(ctx, `INSERT INTO stream_heads(space_name,stream,sequence)
                     VALUES(?,?,0) ON CONFLICT(space_name,stream) DO NOTHING`, space, stream)
tx.QueryRowContext(ctx, `SELECT sequence FROM stream_heads
                         WHERE space_name=? AND stream=?`, space, stream).Scan(&sequence)
sequence++
tx.ExecContext(ctx, `UPDATE stream_heads SET sequence=? WHERE space_name=? AND stream=?`, ...)
tx.ExecContext(ctx, `INSERT INTO stream_events(...) VALUES(...)`, ...)
tx.Commit()
```

**Hub backpressure, as implemented in `opendrop-pod/internal/realtime/hub.go`**

```go
func (h *Hub) Publish(change store.Change) {
    for id, channel := range h.spaces[change.Space] {
        select {
        case channel <- change:
        default:               // slow subscriber: drop it, do not buffer
            delete(subscribers, id)
            close(channel)
        }
    }
}
```

**Current repo state (pre-implementation)**

```
go-go-datadrop/
├── cmd/go-go-datadrop/main.go   # empty func main()
├── pkg/doc.go                   # empty init()
├── pkg/logcopter.go             # generated
├── go.mod                       # only logcopter + indirect deps
├── Makefile                     # go-go-golems standard targets
└── ttmp/2026/07/24/DATADROP-1--.../
```

---

## Step 2: Write the intern implementation guide and publish it

The ticket's own documents are a *scope* decision, not a specification: they say
"port the hub/broadcaster pattern" without saying what that pattern is, and their
draft SQL schema is internally inconsistent. This step turned the four documents
plus the two reference codebases into one buildable specification aimed at
someone who has never heard of Wolfram Data Drop, so the next person does not
repeat the extraction from Step 1.

The guide came out at roughly 1,200 lines across 17 sections. The parts that took
the most work were §6 (the four patterns to port, extracted from the reference Go
and annotated with *why* each is shaped that way and how people get it wrong) and
§16 (six concrete inconsistencies between the ticket's own documents, each with a
recommendation rather than a silent resolution).

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Produce the long-form intern-facing analysis /
design / implementation guide with prose, bullets, pseudocode, diagrams, API
references and file references; store it in the docmgr ticket; upload it to
reMarkable.

**Inferred user intent:** A durable teaching artifact — the thing that makes the
project transferable to someone else — plus a paper copy to read away from the
screen.

**Commit (docs):** `38c8d1c` — "docs(DATADROP-1): add intern implementation guide and implementation diary"

### What I did

- Wrote `design/02-intern-implementation-guide.md` (17 sections):
  §1 one-page summary and the 60-second acceptance demo; §2 product rationale
  and the five design principles that actually constrain code; §3 conceptual
  model (full vs. v0.1); §4 the cut line with reasoning per item plus the four
  forward-compatibility constraints; §5 the evidence base and a reading order;
  §6 the four patterns to port from `opendrop-pod`; §7 architecture with the
  long-term mermaid diagram, the v0.1 ASCII diagram, the 13-step ingest path,
  and the concurrency model; §8 the corrected data model; §9 the event envelope
  field-by-field; §10 the full HTTP API reference; §11 the CLI reference;
  §12 package-by-package pseudocode; §13 the eight tasks with definitions of
  done; §14 test layers and a review checklist; §15 glossary; §16 six open
  inconsistencies; §17 a file reference index.
- Ran `docmgr validate frontmatter` on both new docs and `docmgr doctor
  --ticket DATADROP-1` — all clean.
- Updated the ticket `index.md` document list and appended a `docmgr changelog`
  entry with related-file notes.
- Uploaded the guide bundled with `design/01-mvp-design.md` to reMarkable:
  `remarquee upload bundle … --name "DATADROP-1 Intern Implementation Guide"
  --remote-dir "/ai/2026/07/24/DATADROP-1" --toc-depth 2 --non-interactive`
  → `OK: uploaded DATADROP-1 Intern Implementation Guide.pdf -> /ai/2026/07/24/DATADROP-1`.

### Why

`design/01-mvp-design.md` is ~370 lines of scope. The knowledge needed to
*implement* that scope is spread across 2,530 lines of upstream design and two Go
codebases. Without this guide every future contributor pays the Step 1 cost
again, and — worse — is likely to resolve the §16 inconsistencies differently
each time, producing a schema that does not match the handlers.

### What worked

- Anchoring every claim to a section reference (`sources/opendrop-design.md`
  §14.3) rather than restating it. The guide stays checkable.
- Writing §6 as "here is the reference code, here is why it is shaped that way,
  here are the three ways people get it wrong" instead of "port this". The
  eviction branch of `Hub.Publish` is eleven lines and is the single most
  load-bearing design decision in the streaming path; it deserved the space.
- Bundling the guide *with* `design/01-mvp-design.md` for the reMarkable upload,
  so the paper copy carries the scope decision it expands on.

### What didn't work

- `docmgr doc add --doc-type design-doc` put the file in a new `design-doc/`
  directory rather than the ticket's existing `design/`. Moved it manually; the
  `DocType` frontmatter field is what indexing uses, so the path change is
  cosmetic. (`docmgr doctor` confirms: all checks passed after the move.)
- The `Write` tool refuses to overwrite a file it has not read in the session,
  so both docmgr-scaffolded stubs had to be `Read` before being replaced. Not a
  failure, just friction worth knowing about when scaffolding then rewriting.

### What I learned

- The upstream design and the ticket design use **different names for the same
  schema modes** (four vs. three), and the ticket's SQL is missing the `stream`
  column its own `schemas` table keys on. Both are the kind of gap that produces
  a working-but-wrong implementation, because neither is a syntax error — you
  only notice when you try to wire `PUT /schemas/{stream}` to the ingest path and
  find there is nothing to join on.
- The design doc names `xeipuuv/jsonschema`, but its own §11.1 example declares
  `$schema: .../draft/2020-12/schema`, which that library cannot compile. A
  dependency choice made in a scope document had already been invalidated by an
  example three sections later in the source it was derived from.

### What was tricky to build

Deciding how much of the deferred design to explain. The temptation is to omit
everything out of scope, but then §4's cut line reads as arbitrary and an intern
cannot tell whether a simplification is safe. The resolution was §4.3 — four
explicit forward-compatibility constraints (envelope shape, per-stream sequence,
two distinct timestamps, unique client-supplyable id) — so the guide can say "cut
anything except these four" instead of enumerating the whole roadmap.

The second difficulty was the CSV export contract. The design says "export CSV"
and nothing more, but flattening heterogeneous JSON payloads into columns has at
least four decisions (column ordering, nested paths, unflattenable values,
missing cells) that will silently differ between two implementations. §10.6 pins
all four, and flags the header/streaming tension (you cannot know the column
union until you have seen every row) rather than pretending it does not exist.

### What warrants a second pair of eyes

- §16.1 and §16.2 — the two flagged deviations from the ticket's own documents.
  They are adopted in §8.1 and in the migration written in Step 3, so if either
  recommendation is wrong the fix is cheapest now.
- §10.6's CSV decision: the MVP buffers up to the 1000-row `limit` cap rather
  than double-scanning. Fine at MVP volumes, wrong if `limit` is ever raised.

### What should be done in the future

- Resolve ticket tasks 9–11 (the open decision records) so §16.3's binary-naming
  recommendation stops being provisional.
- Regenerate the reMarkable PDF when the guide changes materially; the current
  upload is a snapshot of commit `38c8d1c`.

### Code review instructions

- Read `design/02-intern-implementation-guide.md` §6 and §8 first — they carry
  the decisions the code in Step 3 depends on.
- Cross-check §8.1's SQL against `design/01-mvp-design.md` §5.1 to see exactly
  what changed and why (§16.1).
- Verify the guide's claims about the reference code by extracting the archives
  per §5.2 and reading `opendrop-pod/internal/{store/streams.go,realtime/hub.go,server/feed.go}`.

### Technical details

**Validation output**

```
$ docmgr validate frontmatter --doc .../design/02-intern-implementation-guide.md
Frontmatter OK: … (Ticket=DATADROP-1 DocType=design-doc)
$ docmgr doctor --ticket DATADROP-1
### DATADROP-1
- ✅ All checks passed
```

---

## Step 3: MVP task 1 — the datadrop skeleton, HTTP server, and SQLite store

This step implements ticket task 1: "`cmd/datadrop/main.go` with cobra
`serve`/`create`/`push`/`tail`/`query`/`export` stubs; `net/http` ServeMux;
SQLite open/close". The deliverable is a binary that starts, opens and migrates
a database, serves `/healthz`, and shuts down cleanly — with every other
subcommand present but explicitly unimplemented.

The point of doing this first is that it fixes the four things that are painful
to change once handlers depend on them: the module layout, the dependency set,
the cobra wiring, and the store lifecycle. The full v0.1 schema ships in this
step too (not just the tables `serve` needs), so that task 2 is writing Go
against a settled schema rather than migrating one.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Implement the first task from the ticket's MVP task
list, keeping the diary current and committing at sensible boundaries.

**Inferred user intent:** Move DATADROP-1 from a design ticket to a repository
with running code.

**Commit (code):** `52e3950` — "feat(DATADROP-1): MVP task 1 — datadrop skeleton, HTTP server, SQLite store"

### What I did

- `pkg/store/migrations/0001_init.sql` — the full v0.1 schema from guide §8.1:
  `drops`, `events` (with the `stream` column the ticket draft omitted, and
  `UNIQUE(drop_name, stream, seq)`), `stream_heads` (the O(1) sequence
  allocator), `schemas`, `audit_log`, and two covering indexes on `events`.
- `pkg/store/store.go` — `Open`/`Close`, an injectable clock, `FormatTime`/
  `ParseTime` with fixed-width millisecond RFC3339, and a forward-only embedded
  migration runner (`//go:embed migrations/*.sql`, version from the `NNNN_`
  filename prefix, one transaction per migration, tracked in
  `schema_migrations`).
- `pkg/server/server.go` — `Config`/`Server`, a `*http.ServeMux` handler tree
  with `GET /healthz`, and `Serve(ctx, ready)` with context-driven graceful
  shutdown. `Handler()` is exported so handler tests skip the socket.
- `pkg/cli/root.go` — the cobra root, persistent `--addr`/`--token`/
  `--log-level`/`--output` flags with env fallbacks, the documented exit-code
  constants, and logging setup.
- `pkg/cli/serve.go` — `runServe`, wiring `signal.NotifyContext` →
  `store.Open` → `server.New` → `errgroup`.
- `pkg/cli/stubs.go` — `create`, `push`, `query`, `tail`, `export`, `schema
  put|show` with their real flag sets and help text, each returning
  `ErrNotImplemented` annotated with the MVP task that will fill it in.
- `cmd/datadrop/main.go` — `os.Exit(cli.Execute())`.
- Tests: `pkg/store/store_test.go` (table creation, migration idempotency, live
  PRAGMA assertions, timestamp round-trip and lexicographic ordering, migration
  loading/ordering, filename version parsing) and `pkg/server/server_test.go`
  (healthz body and timestamp format, constructor validation and defaults, and
  a real bind/serve/cancel cycle).
- Rewrote `README.md` with the quickstart, the concept table, the schema-mode
  vocabulary mapping, the retention caveat, and the dev commands.
- Ran `GOWORK=off go generate ./...` to produce the per-package logcopter
  loggers.

### Why

Task 1 is deliberately the smallest slice that forces every structural decision.
Shipping the *whole* schema in `0001_init.sql` rather than only the tables
`/healthz` touches is a deviation from a literal reading of the task, but the
alternative — a migration per task — would mean five migrations against a schema
nobody has exercised yet, which is churn with no benefit while the product is
pre-release.

### What worked

- `TestOpenAppliesPragmas` immediately paid for itself as a guard: it asserts
  `PRAGMA journal_mode` is `wal` and `PRAGMA foreign_keys` is `1` on a live
  connection, which is the only way to catch the DSN hazard from guide §12.2
  (the two SQLite drivers spell pragmas differently and the wrong spelling is
  silently ignored, not an error).
- Registering the client commands as stubs with their *real* flag sets means
  `datadrop --help` already documents the finished CLI, and `datadrop query
  --help` shows every parameter from guide §10.4.
- The tmux smoke test from AGENT.md worked first try:
  `serve` → `curl /healthz` → `200 {"status":"ok",...}` → Ctrl-C → port released.

### What didn't work

- **`go.work` blocks the default build.** The workspace root's `go.work`
  declares `go 1.26.1` while the installed toolchain is 1.25.5:

  ```
  packages.Load error: err: exit status 1: stderr:
  go: go.work requires go >= 1.26.1 (running go 1.25.5) (go list)
  ```

  Every `go` invocation for this module therefore needs `GOWORK=off`, which is
  what the Makefile already does. The editor's language server still reports
  the error because it does not inherit that env var. Not fixed — the Makefile
  is the source of truth and matches CI.

- **`logcopter`'s default manager is a no-op.** The first version of
  `configureLogging` called `zerolog.SetGlobalLevel`, which had no effect:
  `logcopter.newDefaultState()` stores `base: zerolog.Nop()` with
  `defaultLevel: zerolog.Disabled`, so the generated per-package `log` variables
  drop everything until `logcopter.Configure(base, cfg)` is called. Fixed by
  building a console writer via `logcopter.WriterForFormat(
  logcopter.WriterForOutput(...), ...)` and passing it to `logcopter.Configure`.
  Symptom before the fix: a server that started and served correctly but
  printed nothing at any `--log-level`.

- `golangci-lint` flagged one issue on the first run:

  ```
  pkg/store/store_test.go:127:5: QF1001: could apply De Morgan's law (staticcheck)
      if !(earlier < later) {
  ```

  Rewritten as `if earlier >= later`. Second run: `0 issues`.

- `gofmt -l` flagged `pkg/cli/stubs.go` (misaligned var block after I renamed a
  variable). Fixed with `gofmt -w`.

### What I learned

- The `logcopter` failure mode above is worth writing down for anyone else in
  this repo: **the generated `log` variables are silent by default.** There is
  no warning, no fallback to stderr, and no error — a binary that never calls
  `logcopter.Configure` simply has no logging. The `--log-level` flag looks
  wired up and does nothing.
- `signal.NotifyContext` composes cleanly with `errgroup.WithContext`: the
  signal cancels the parent, the group context inherits it, `Serve` returns nil
  after `Shutdown`, and the deferred `store.Close()` runs last. No explicit
  channel plumbing needed.

### What was tricky to build

**`http.Server.WriteTimeout` must stay unset.** The instinct on a new HTTP
server is to set every timeout. But MVP task 5 adds an SSE endpoint, and a write
deadline severs a long-lived `text/event-stream` response at the deadline —
producing a "stream mysteriously disconnects after N seconds" bug that is
extremely annoying to diagnose two tasks later. `ReadHeaderTimeout` is set (it
bounds the slowloris window and is what the linter wants); `WriteTimeout` is
deliberately absent with a comment explaining why. The general form of this trap:
a timeout that is correct for request/response is wrong for streaming, and the
streaming endpoint does not exist yet to fail the test.

**`Serve` needs to report its own address.** `Config.Addr` may be `:0` (tests
use `127.0.0.1:0`), so the caller cannot know the port. Solved by splitting
`net.Listen` out of `http.Server.ListenAndServe` and invoking a `ready
func(net.Addr)` callback after the bind succeeds. `TestServeShutsDownOnContextCancel`
uses it to build the request URL; `runServe` uses it to log the resolved address.

**Migration ordering has to be explicit.** `fs.ReadDir` returns lexicographic
order, which happens to be correct for zero-padded prefixes but silently breaks
at `0010_` vs `9_`. `loadMigrations` parses the numeric prefix, sorts on the
integer, and rejects duplicate versions — so a misnamed migration is a startup
error rather than a migration applied out of order.

### What warrants a second pair of eyes

- The decision to ship the complete v0.1 schema in `0001_init.sql` rather than
  one migration per task (see "Why" above). This is a deliberate deviation from
  a literal reading of task 1.
- `pkg/store.Store.DB()` exposes the raw `*sql.DB`. It exists so the tests can
  assert on `sqlite_master` and live pragmas, but it is an escape hatch that
  will let a later handler bypass the store's invariants. Consider narrowing it
  to a test-only accessor once task 2 lands the real query methods.
- `cmd/go-go-datadrop/` (the template's empty entry point) still exists
  alongside the new `cmd/datadrop/`. Left in place deliberately pending ticket
  task 11; it should not survive to v0.1.
- The `exitCodeFor` switch currently returns `ExitError` for every case. The
  constants are declared and documented, but nothing maps auth/not-found/
  validation errors onto them yet — that arrives with the client commands in
  tasks 3–6. It is a stub, not an oversight, but a reviewer should confirm it
  is wired before v0.1 ships.

### What should be done in the future

- MVP task 2: the store's `CreateDrop`/`GetDrop`/`ListDrops`/`AppendEvent`/
  `QueryEvents`/`PutSchema`/`ActiveSchema`/`Audit` methods against this schema,
  with the sequence-monotonicity and cursor-stability property tests from guide
  §14.2.
- Map real error classes onto the documented exit codes in `exitCodeFor`.
- Remove `cmd/go-go-datadrop/` once ticket task 11 is decided.

### Code review instructions

Start with `pkg/store/store.go`:

- `dsnForPath` — the driver-specific pragma syntax (guide §12.2). Verified by
  `TestOpenAppliesPragmas`.
- `migrate` / `loadMigrations` / `versionFromFilename` — forward-only,
  one transaction per migration, integer-sorted, duplicate-rejecting.
- `TimeFormat` / `FormatTime` — the fixed-width fractional second, verified by
  `TestTimeFormatRoundTripsAtFixedWidth` including the lexicographic-ordering
  assertion.

Then `pkg/server/server.go` (`New`, `Handler`, `Serve` and the missing
`WriteTimeout` comment) and `pkg/cli/serve.go` (the signal → errgroup →
shutdown ordering).

Validate:

```bash
cd go-go-datadrop
GOWORK=off go build ./... && GOWORK=off go test ./... -count=1
make lint && make logcopter-check

tmux new-session -d -s dd 'GOWORK=off go run ./cmd/datadrop serve --db /tmp/dd.db --token t --addr :8099 --log-level debug'
sleep 12 && curl -s http://localhost:8099/healthz && echo
tmux send-keys -t dd C-c && sleep 2 && tmux kill-session -t dd
lsof-who -p 8099 -k
```

### Technical details

**Verification output**

```
$ GOWORK=off go test ./...
ok  	github.com/go-go-golems/go-go-datadrop/pkg/server	0.023s
ok  	github.com/go-go-golems/go-go-datadrop/pkg/store	0.023s

$ make lint
0 issues.

$ make logcopter-check
GOWORK=off go tool logcopter-gen -area-prefix go-go-golems.go-go-datadrop … -check ./pkg/...
(exit 0)
```

**Smoke test, fresh database**

```
INF applied migration area=go-go-golems.go-go-datadrop.pkg.store name=0001_init.sql version=1
DBG opened store area=go-go-golems.go-go-datadrop.pkg.store path=/tmp/dd-fresh.db
WRN no --token configured: write endpoints are unauthenticated area=…pkg.cli
INF datadrop server listening addr=[::]:8098 area=…pkg.server
INF datadrop ready addr=[::]:8098 area=…pkg.cli db=/tmp/dd-fresh.db
INF shutting down datadrop server area=…pkg.server

$ curl -s localhost:8099/healthz
{"status":"ok","time":"2026-07-24T16:29:40.266Z"}
```

**Dependencies added**

| Module | Version | Why |
|---|---|---|
| `modernc.org/sqlite` | v1.53.0 | Pure-Go SQLite driver (DR-2, CGO-free build) |
| `github.com/spf13/cobra` | v1.10.2 | CLI framework (AGENT.md) |
| `golang.org/x/sync` | v0.22.0 | `errgroup` (AGENT.md) |
| `github.com/rs/zerolog` | (existing) | Logging base for logcopter |
| `github.com/pkg/errors` | (existing) | Error wrapping (AGENT.md) |

`github.com/santhosh-tekuri/jsonschema/v6` is **not** added yet; it arrives with
the validation work in task 3.

**The logcopter setup that was needed**

```go
cfg := logcopter.Config{
    Output: logcopter.OutputStderr, Format: logcopter.FormatText,
    Level: level, Timestamp: true,
}
writer := logcopter.WriterForFormat(logcopter.WriterForOutput(cfg.Output),
    logcopter.OutputConfig{Output: cfg.Output, Format: cfg.Format,
        Timestamp: cfg.Timestamp, TimeFormat: time.RFC3339})
base := zerolog.New(writer).With().Timestamp().Logger()
return logcopter.Configure(base, cfg)   // ← without this, every log is dropped
```
