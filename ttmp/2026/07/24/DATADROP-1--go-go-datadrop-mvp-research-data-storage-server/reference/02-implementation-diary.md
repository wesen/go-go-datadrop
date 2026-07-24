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
    - Path: repo://cmd/datadrop/smoke_test.go
      Note: 'End-to-end acceptance test: the README quick start against a real binary (commit a78f08e)'
    - Path: repo://pkg/cli/root.go
      Note: Cobra root, exit-code contract, logcopter logging setup (commit 52e3950)
    - Path: repo://pkg/cli/serve.go
      Note: signal.NotifyContext -> store.Open -> server.New -> errgroup wiring (commit 52e3950)
    - Path: repo://pkg/datadrop/event.go
      Note: 'Shared domain vocabulary: envelope, defaults, name validation (commit d7696da)'
    - Path: repo://pkg/schema/validate.go
      Note: JSON Schema compile/validate with a version-keyed cache (commit a78f08e)
    - Path: repo://pkg/server/handlers_events.go
      Note: 'Ingest: both request shapes, validate then commit then publish (commit a78f08e)'
    - Path: repo://pkg/server/handlers_export.go
      Note: CSV/NDJSON/JSON export and the CSV flattening contract (commit a78f08e)
    - Path: repo://pkg/server/handlers_stream.go
      Note: 'SSE: subscribe before replay, dedupe the overlap by sequence (commit a78f08e)'
    - Path: repo://pkg/server/server.go
      Note: net/http ServeMux surface, /healthz, context-driven graceful shutdown; WriteTimeout deliberately unset for SSE (commit 52e3950)
    - Path: repo://pkg/store/events.go
      Note: AppendEvent sequence reservation + idempotent replay; QueryEvents parameter binding (commit d7696da)
    - Path: repo://pkg/store/migrations/0001_init.sql
      Note: Full v0.1 schema incl. the corrected events.stream column and stream_heads allocator (commit 52e3950)
    - Path: repo://pkg/store/store.go
      Note: SQLite Open/Close + forward-only embedded migrations; driver-specific DSN pragmas (commit 52e3950)
    - Path: repo://pkg/stream/hub.go
      Note: Fan-out hub; slow subscribers are evicted, not buffered (commit a78f08e)
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

---

## Step 4: MVP task 2 — the store, and the invariant everything else rests on

This step implements the persistence layer against the schema shipped in Step 3:
drops, events with per-`(drop, stream)` sequence reservation, immutable schema
versions, and the audit log. It also introduces `pkg/datadrop` as a leaf package
holding the shared domain vocabulary, so the client can later speak the same
types without importing the persistence layer.

The reason this task is worth doing carefully rather than quickly is that four
later tasks read from it and none of them can fix a wrong ordering guarantee.
The tests are therefore written against invariants rather than against methods:
sequences are dense and monotonic under concurrent writers, a duplicate ID
returns the original event without burning a sequence, cursor paging visits
every event exactly once, and `from`/`to` are inclusive/exclusive respectively.

### Prompt Context

**User prompt (verbatim):** "do the entire MVP, 1 - 8, keep a detailed frequent diary as you work"

**Assistant interpretation:** Implement every remaining task in the ticket's MVP
plan (2 through 8, task 1 already being done), appending a diary step as each
lands rather than writing the diary up at the end.

**Inferred user intent:** Get a working v0.1 rather than a partial one, and keep
the process reviewable step by step — the diary is a deliverable, not a
postscript.

**Commit (code):** `d7696da` — "feat(DATADROP-1): MVP task 2 — store CRUD, sequence reservation, schemas, audit"

### What I did

- Added `pkg/datadrop` with `Envelope`, `Drop`, `DropStats`, `Schema`, `Mode`,
  `EventQuery`, `Violation`, `AuditRecord`, plus name/retention validation and
  the `Order`/`TimeField` allowlist parsers.
- `pkg/store/events.go`: `AppendEvent` (reservation + insert + audit in one
  transaction), `reserveSequence`, `GetEvent`, `QueryEvents`, and `EachEvent`
  for paging past the row cap.
- `pkg/store/drops.go`: `CreateDrop`, `GetDrop`, `ListDrops`, `DropStats`.
- `pkg/store/schemas.go`: `PutSchema` (immutable `MAX(version)+1`),
  `ActiveSchema`.
- `pkg/store/helpers.go`: ULID event IDs, context-carried audit actor,
  `compactJSON`, nullable-column helpers.
- `pkg/store/errors.go`: `ErrNotFound` / `ErrAlreadyExists` plus SQLite
  constraint-message classification.
- Moved the IMMEDIATE transaction lock into the DSN as `_txlock=immediate`.
- Resolved ticket tasks 9–11 and removed `cmd/go-go-datadrop/`.
- Tests: `events_test.go` and `schemas_test.go`, 20 cases.

### Why

`design/01-mvp-design.md` §5.1 gives a schema but no behaviour. The behaviour
that matters is not CRUD, it is the three guarantees the rest of the system
assumes: an acknowledged event is durably ordered, a retried write is a no-op,
and a cursor is a stable resumption point. Everything in tasks 3–6 is a
presentation layer over those.

### What worked

- Putting the domain types in a leaf package rather than in `pkg/store` paid off
  immediately in task 4: `pkg/client` imports `pkg/datadrop` and gets the exact
  types the server serializes, with no translation layer and no risk of the two
  drifting.
- The concurrency test (8 goroutines × 25 appends, asserting the assigned
  sequences are exactly 1..200 with no repeats) passed first try, which is the
  evidence that `SetMaxOpenConns(1)` plus in-transaction reservation is
  genuinely sufficient rather than merely plausible.
- Making `Violation` a comparable struct let the deduplication in
  `violationsOf` (task 3) be a plain `map[Violation]struct{}` instead of a
  hand-rolled key.

### What didn't work

- **`beginImmediate` did not begin immediately.** My first version called
  `db.BeginTx` and then executed `SELECT 1`, with a comment claiming this took
  the write lock up front. It does not: `database/sql` issues a plain `BEGIN`
  (deferred) and there is no API for SQLite's `BEGIN IMMEDIATE`. Reading a row
  does not acquire a write lock either, so the function was a no-op with a
  confident comment — the worst kind. Fixed by moving the lock mode to the
  connection via `_txlock=immediate` in the DSN, which modernc.org/sqlite
  supports (verified against the driver source: `sqlite.go` accepts
  `deferred`, `immediate`, `exclusive`). `beginImmediate` is now three lines
  and its comment says where the real behaviour comes from.

- **A zero-width space in an identifier.** I typed `store​WithActor` in
  `schemas_test.go` with a U+200B between `store` and `WithActor`, producing a
  compile error that read as `undefined: store` — invisible in the editor and
  in the error message. Found it by `grep -P '\x{200b}'`; fixed with
  `perl -CSD -i -pe 's/store\x{200b}WithActor/WithActor/g'`.

- `golangci-lint` flagged `if !(earlier < later)` (staticcheck QF1001, De
  Morgan). Rewritten as `if earlier >= later`.

### What I learned

- `database/sql` genuinely has no hook for SQLite's `BEGIN` variants, so lock
  mode is necessarily a connection-level DSN concern. Any Go SQLite code that
  claims to use `BEGIN IMMEDIATE` from a `BeginTx` call is wrong; check the DSN.
- modernc.org/sqlite reports constraint failures only through the error
  message, with no exported code type to switch on. `isUniqueViolation` has to
  match text. Narrow and ugly, but the alternative — treating every insert
  failure as a duplicate — would silently swallow real errors, so the ugliness
  is in the right place.

### What was tricky to build

**The rollback ordering in the duplicate-ID path.** When the insert fails on the
`events.id` primary key, the natural next step is "read the original event and
return it". But the failed statement leaves the transaction in an aborted state,
so any query on that `*sql.Tx` fails too — and the error you get back is about
the aborted transaction, not about the duplicate, which sends you looking in
completely the wrong place. The fix is to `tx.Rollback()` *first*, then re-read
via `s.GetEvent` on a fresh connection. There is a second subtlety: the deferred
rollback must be suppressed afterwards, or it runs against an already-rolled-back
transaction. I used an explicit `committed` flag rather than a bare
`defer tx.Rollback()` so both the success and the duplicate path are explicit
about which one owns the unwind.

`TestAppendEventReplayDoesNotConsumeASequence` is the regression test: append a
fixed ID, replay it, then append a fresh event and assert it gets sequence 2, not
3. Without the rollback the reservation would have been committed.

**`compactJSON` distinguishing absent from null.** `json.Compact` on the literal
`null` yields `null`, which would store a JSON null in a column meant to be SQL
NULL — and then `meta` round-trips as the four bytes `null` instead of being
absent, which changes the shape of every serialized envelope. `compactJSON`
returns `nil` for empty, whitespace, and literal `null` inputs specifically so
`nullableJSON` can map it to SQL NULL.

### What warrants a second pair of eyes

- `isUniqueViolation` / `isForeignKeyViolation` match on error text. If the
  driver ever rewords its messages these silently stop classifying, and a
  duplicate append would surface as a 500 instead of a 200. A driver upgrade
  should re-run `TestAppendEventIsIdempotentByID`, which is the canary.
- `Store.DB()` still exposes the raw handle for tests. Worth narrowing now that
  the real query methods exist.
- `EachEvent` overrides `Limit` to `MaxLimit` and `Order` to ascending,
  ignoring whatever the caller set. That is right for export but surprising as
  a general-purpose method; the doc comment says so but the signature does not.

### What should be done in the future

- Retention is stored and validated but nothing enforces it (README says so).
- The full `Idempotency-Key` ledger from design §10.4 — keyed by writer,
  endpoint, and content hash, so key reuse with *different* content is a
  conflict rather than a silent no-op. v0.1 only covers same-ID replay.

### Code review instructions

- `pkg/store/events.go` `AppendEvent` and `reserveSequence` — the invariant.
  Read the duplicate-ID branch alongside `TestAppendEventReplayDoesNotConsumeASequence`.
- `pkg/store/store.go` `dsnForPath` — the `_txlock` and pragma settings, with
  `TestOpenAppliesPragmas` as the proof they took effect.
- `pkg/store/events.go` `QueryEvents` — confirm `TimeField` and `Order` are the
  only interpolated fragments and that both are allowlisted in
  `EventQuery.Normalize`.

```bash
GOWORK=off go test ./pkg/store/... -count=1 -race
```

### Technical details

**Test coverage of the invariants**

| Invariant | Test |
|---|---|
| Sequences dense and monotonic | `TestAppendEventSequenceIsMonotonic` |
| …under 8 concurrent writers | `TestAppendEventSequenceIsMonotonicUnderConcurrency` |
| Per-stream, not per-drop | `TestAppendEventSequencesArePerStream` |
| Duplicate ID returns the original | `TestAppendEventIsIdempotentByID` |
| …without burning a sequence | `TestAppendEventReplayDoesNotConsumeASequence` |
| Producer time ≠ receive time | `TestAppendEventPreservesProducerTime` |
| Cursor paging visits each event once | `TestQueryEventsCursorPagingIsStable` |
| `from` inclusive, `to` exclusive | `TestQueryEventsTimeRangeBoundaries` |
| Schema versions immutable and monotonic | `TestPutSchemaVersionsMonotonically` |
| `x-drop-*` survives storage | `TestPutSchemaPreservesExtensionKeywords` |
| Every mutation audited | `TestMutationsAreAudited` |
| A rolled-back append is not audited | `TestReplayedAppendIsNotAudited` |

---

## Step 5: MVP tasks 3–8 — the HTTP surface, the CLI, and the acceptance test

This step is the rest of the MVP: schema validation, the ingest endpoint, the
query endpoint, the realtime hub and SSE feed, all three export formats, bearer
auth, and the end-to-end smoke test. It is one diary step rather than six
because the pieces were built and verified as one vertical slice — the HTTP
handler for each capability, the client method, and the CLI command land
together, and testing any of them in isolation would have meant stubbing the
others.

The v0.1 acceptance criterion is the README quick start running against one
binary and one SQLite file. That now passes as an automated test
(`cmd/datadrop/smoke_test.go`) and was also verified by hand under tmux across
every endpoint.

### Prompt Context

**User prompt (verbatim):** (see Step 4)

**Assistant interpretation:** Continue through tasks 3–8 and finish the MVP.

**Inferred user intent:** A working, tested v0.1.

**Commit (code):** `a78f08e` — "feat(DATADROP-1): MVP tasks 3-8 — ingest, query, SSE, export, auth, tests"

### What I did

- `pkg/schema/validate.go` — `Compile`, `Validate`, and a version-keyed
  `Cache`. Validation returns a `Result`, never an error, for an invalid
  payload; mode handling lives in the handler.
- `pkg/server/problem.go` — the problem-document contract and the
  sentinel→status mapping. Every error path goes through `writeProblem`.
- `pkg/server/middleware.go` — recover, request ID, access log, bearer auth,
  `authorizeRead` for `public_read`, and `pathName` validation.
- `pkg/server/handlers_{drops,events,schema,stream,export}.go` — the nine
  endpoints from the guide §10.
- `pkg/stream/hub.go` — the fan-out hub with slow-subscriber eviction.
- `pkg/client/client.go` — typed client including a hand-written SSE parser.
- `pkg/cli/{output,push,read}.go` — the real commands, replacing `stubs.go`.
- `exitCodeFor` now maps `*client.APIError` statuses onto the documented codes.
- Tests: `handlers_test.go` (28 cases), `handlers_stream_test.go` (6, against a
  real listener), `hub_test.go` (8), `validate_test.go` (12),
  `smoke_test.go` (3 end-to-end).
- Rewrote the README with the command table, HTTP reference, and SSE contract.

### Why

Tasks 3–7 are each a thin layer over the store, and the interesting decisions
are all at the boundaries — which shape a request is, what an invalid payload
means, when to publish relative to commit, what a CSV cell contains. Those are
the things the tests pin down.

### What worked

- **`httptest.ResponseRecorder` is unusable for SSE**, which turned out to be a
  useful forcing function: `handlers_stream_test.go` starts a real listener via
  `srv.Serve` with a `ready func(net.Addr)` callback, which is exactly the
  wiring `runServe` uses. The streaming tests therefore exercise the real
  server lifecycle rather than a handler in isolation.
- Writing the SSE client parser by hand (≈40 lines: accumulate `event:`/`data:`,
  dispatch on a blank line, skip `:` comments) was less work than evaluating a
  dependency, and made the heartbeat and `reset` frames trivial to handle.
- Discriminating request shape on content-type *and* `specversion` *and* an
  explicit `?mode=` covers the ambiguity honestly. `TestDecodeIngestDiscriminatesShapes`
  includes the pathological case — a payload whose own top-level field is
  called `specversion` — and `mode=simple` stores it as data.
- Verifying by hand under tmux caught the timestamp-precision bug below, which
  no unit test was looking for.

### What didn't work

- **Nanosecond timestamps in create/append responses.** `datadrop create`
  returned `"created_at": "2026-07-24T16:52:50.167495568Z"` while the stored
  value was millisecond-truncated, so a subsequent `inspect` reported a
  *different* timestamp for the same drop. The struct was returned from
  `CreateDrop` before ever round-tripping through storage. Fixed by making
  `Store.Now()` truncate to `time.Millisecond` — the clock's resolution is now
  the storage resolution, everywhere, by construction rather than by remembering
  to truncate at each call site.

- **A test called `t.Fatalf` from a goroutine.** In
  `TestStreamIsScopedToOneStream` I spawned `readFrames` (which fatals on a read
  error) on a goroutine to assert that *nothing* arrives. `t.Fatalf` off the
  test goroutine is undefined behaviour and would have produced a confusing
  failure. Rewritten to read raw lines on the goroutine and report the first
  `event: append` line through a channel, leaving all assertions on the test
  goroutine.

- **A nonsense type assertion.** The same test had
  `if err := resp.Body.(interface{ Close() error }); err != nil` — a type
  assertion whose result I then compared to nil as though it were an error. It
  compiled, did nothing, and was pure noise. Deleted.

- `golangci-lint` found four issues on the first full run: an unchecked
  `fmt.Fprint` in the SSE prologue, two named string returns in the smoke test
  (`nonamedreturns`), and a parameter called `max` shadowing the predeclared
  identifier (`predeclared`). All four fixed; second run clean.

### What I learned

- The `predeclared` linter is on in this repo, so `min`/`max`/`len`-style
  parameter names are rejected. Worth knowing before naming a parameter `max`.
- `http.MaxBytesError` is what `errors.As` should target to distinguish "body
  too large" from a generic read failure; matching on the message would break
  across Go versions.
- Wrapping a `ResponseWriter` for the access log **breaks SSE unless the wrapper
  forwards `Flush`**. `statusRecorder` implements `http.Flusher` and delegates;
  without that, `w.(http.Flusher)` in the stream handler fails the type
  assertion and the endpoint returns 500 `StreamingUnavailable`. This is a
  silent, action-at-a-distance failure: the middleware looks unrelated to the
  handler it breaks.

### What was tricky to build

**The CSV column union versus streaming.** CSV needs a header before any row,
but the header is the union of every payload key across the whole result — which
is unknowable until every row has been read. The three options were: buffer
everything (unbounded memory), scan twice (double the query cost), or bound the
export. I bounded it at `datadrop.MaxLimit` rows and said so in the doc comment,
because silently truncating would be the one genuinely bad outcome. NDJSON and
JSON have no such constraint and stream properly via `EachEvent`. The guide
§10.6 already flagged this tension, which is why the decision was cheap to make.

**Ordering `tail` output.** `tail --limit 10` fetches the *newest* ten, which
means a descending query — but a human reading a follow expects chronological
order, and the follow cursor must be the highest sequence seen. So the query is
descending and the render is reversed, with the cursor taken from the last
element after reversing. Getting this backwards produces a tail that prints
newest-first and then appends live events at the bottom, which reads as
scrambled.

**Subscribe-before-replay, and proving it.** The hub subscription must be
registered before the durable replay, or an event committed in between is lost
to that subscriber forever. This is easy to write correctly and easy to *test*
incorrectly: a test that appends and then immediately opens a stream cannot tell
the two orderings apart. `TestStreamIsScopedToOneStream` polls
`hub.Subscribers(...)` until the subscription is registered before publishing,
so the assertion is actually about delivery rather than about a race it happened
to win.

### What warrants a second pair of eyes

- **`authorizeRead` grants access to any valid token before checking the drop.**
  Correct for a single-token deployment, but when per-capability tokens arrive
  in v0.2 this function is the place that has to change, and its current shape
  makes the token look like a superuser credential. It is.
- **CSV export is capped at 1000 rows** (see above). Anyone raising
  `datadrop.MaxLimit` must revisit `exportCSV`, or exports start silently
  omitting data — the one outcome the current code is written to avoid.
- **The `mode=simple`/`specversion` heuristic.** The fallback is a guess. It is
  tested, documented, and has an escape hatch, but it is still a guess about
  user intent based on a field name.
- **`decodeJSON` rejects unknown fields** on `POST /v1/drops`. Deliberate — a
  misspelled `public_reed` would otherwise create a drop with the wrong policy
  silently — but it does mean a client sending a field we add later against an
  older server gets a 400 rather than having it ignored.
- The audit log is written but has no read endpoint; `store.ListAudit` exists
  and only tests call it.

### What should be done in the future

- An audit read endpoint (`GET /v1/audit`), since the data is already there.
- Retention enforcement.
- The full idempotency ledger (design §10.4).
- Raise `SetMaxOpenConns` above 1 and re-verify the sequence invariant under
  real concurrency, if throughput ever matters.

### Code review instructions

Start with the two ordering-critical paths:

- `pkg/server/handlers_events.go` `handleAppendEvent` — validate → commit →
  publish → respond. The publish must be after the commit.
- `pkg/server/handlers_stream.go` `handleStreamEvents` — subscribe → replay →
  tail, with the `e.Seq <= cursor` dedupe covering the overlap.

Then:

- `pkg/stream/hub.go` `Publish` — the `default:` branch is the backpressure
  policy; `TestSlowSubscriberIsEvictedRatherThanBuffered` is its spec.
- `pkg/server/middleware.go` `statusRecorder.Flush` — deleting it silently
  breaks SSE.
- `pkg/server/handlers_export.go` `flattenValue` — the CSV interoperability
  contract, specified by `TestExportCSVFlattening`.

```bash
GOWORK=off go test ./... -count=1
make lint && make logcopter-check

# The acceptance test on its own:
GOWORK=off go test ./cmd/datadrop -run TestQuickStartEndToEnd -v
```

### Technical details

**Manual verification (tmux, per AGENT.md)**

```
create          → {"name":"greenhouse", ...}
push key=value  → 01KYAGPFX3DW5A2SGAP9DFS6E0 seq=1
push --stdin    → seq=2
push --ndjson   → seq=3, seq=4, "pushed 2 events"
query           → table, descending, seq 4..1
schema put strict     → version 1
push temperature=warm → SchemaValidationFailed, /temperature: got string, want number, exit=5
schema put permissive → version 2
push temperature=warm → warning on stderr, seq=2 on stdout, exit=0
tail --follow   → replayed 1,2 then printed 3,4 live as they were pushed
export csv      → id,drop,stream,seq,...,data.location.lat,data.tags,data.temperature
export ndjson   → one envelope per line, meta.warnings preserved
no token        → Unauthorized, exit=3
missing drop    → NotFound,     exit=4
replayed id     → first HTTP 201, second HTTP 200
public_read     → readable with no token; writes still 401
2 MB body       → HTTP 413
```

**Final test inventory**

| Package | Tests | Covers |
|---|---|---|
| `pkg/store` | 26 | migrations, pragmas, sequence invariants, idempotency, cursors, ranges, schema versioning, audit |
| `pkg/schema` | 12 | strict/permissive results, extension keywords, malformed schemas, cache keying |
| `pkg/stream` | 8 | fan-out, topic scoping, eviction, non-blocking publish, idempotent cancel |
| `pkg/server` | 34 | auth, token non-leakage, both ingest shapes, idempotency, validation modes, query params, public_read, all three export formats, CSV flattening, SSE replay/tail/resume/scoping |
| `cmd/datadrop` | 3 | the README quick start, exit codes, stdout/stderr separation |

**Dependencies added in this step**

| Module | Version | Why |
|---|---|---|
| `github.com/santhosh-tekuri/jsonschema/v6` | v6.0.2 | Draft 2020-12 validation |
| `github.com/oklog/ulid/v2` | v2.1.2 | Time-sortable event IDs |
