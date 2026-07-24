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
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/01-mvp-design.md
      Note: The v0.1 scope and decision records this implementation follows
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md
      Note: Intern-facing guide produced in Step 2; the spec the code is written against
ExternalSources:
    - sources/opendrop-design.md
    - sources/opendrop-pod-mvp.zip
    - sources/tinyidp-opendrop-source.tar.gz
Summary: "Chronological record of implementing the go-go-datadrop v0.1 MVP: orientation across the OpenDrop sources, the intern guide, and the first implementation slices."
LastUpdated: 2026-07-24
WhatFor: "Record what was built, what failed, and what a reviewer should check while implementing DATADROP-1."
WhenToUse: "Read before resuming DATADROP-1 implementation; append a step after every meaningful change."
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
