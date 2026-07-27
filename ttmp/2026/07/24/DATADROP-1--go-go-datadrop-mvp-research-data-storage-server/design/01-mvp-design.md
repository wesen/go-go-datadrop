---
Title: 'go-go-datadrop MVP design: from OpenDrop design to a first runnable server'
Ticket: DATADROP-1
Status: draft
Topics:
    - backend
    - server
    - mvp
    - design
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/sources/opendrop-browser-pds-profile.md
      Note: Browser-PDS/DPoP profile; deferred to v0.2 (DR-3)
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/sources/opendrop-design.md
      Note: Full OpenDrop design doc; v0.1 scope derived from its roadmap (§28) and acceptance (§34)
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/sources/tinyidp-opendrop-source.tar.gz
      Note: Reference Go slice on TinyIDP proving the storage/stream/DPoP loop; patterns to port
ExternalSources:
    - sources/opendrop-design.md
    - sources/opendrop-browser-pds-profile.md
    - sources/open-source-wolfram-datadrop-transcript.md
    - sources/opendrop-pod-mvp.zip
    - sources/tinyidp-opendrop-source.tar.gz
Summary: Scope the first MVP for go-go-datadrop from the OpenDrop design + browser-PDS profile + existing tinyidp-opendrop MVP source, and define what is in/out of v0.1.
LastUpdated: 2026-07-24T00:00:00Z
WhatFor: Decide the smallest useful runnable server for go-go-datadrop and where it diverges from the source artifacts.
WhenToUse: Read before implementing the first MVP slice; update when the scope changes.
---




# go-go-datadrop MVP design: from OpenDrop design to a first runnable server

## 1. Executive summary

`go-go-datadrop` will be a self-hostable, CLI-first **programmable research data
inbox** inspired by Wolfram Data Drop and the OpenDrop design documents
archived under `sources/`. The first MVP (this ticket) is intentionally narrow:
a single binary that accepts append-only event data over HTTP and CLI, stores it
durably, validates it against JSON Schema, serves latest/range queries, streams
new events over SSE, and exports open formats.

Everything in the source artifacts that is not strictly required to demo that
loop (ATproto federation, MST repositories, CAR exports, WASI functions, IoT
edge agents, live sites, Parquet cold storage) is **deferred** to later versions.
The MVP must remain a single-node, single-binary product.

The conversation that produced these sources also shipped a working vertical
slice (`tinyidp-opendrop`) built on top of `go-go-golems/tiny-idp`, using
TinyIDP OAuth + a bearer→DPoP storage-session exchange, SQLite storage, and a
go-go-goja script runtime. That slice is treated as a **reference
implementation**, not the target. `go-go-datadrop` will not depend on TinyIDP in
its first MVP; it will borrow its storage/stream/DPoP shape and decide identity
separately.

## 2. Problem statement and scope

**Problem:** There is no simple, self-hostable, CLI-first way to drop research
data (sensor readings, experiment outputs, notebooks, scrape results) into a
durable, inspectable, programmable store and immediately get a live view plus an
API — without standing up Kafka, Kubernetes, a time-series DB, and a frontend.

**In scope for the MVP (v0.1):**

- One binary (`datadrop`) that runs an HTTP server.
- Append-only event streams keyed by drop name.
- Ingestion over HTTP `POST` and a `datadrop push` CLI.
- JSON Schema validation (strict/permissive modes).
- Latest-N and time-range queries.
- SSE subscription to a drop's new events.
- CSV / NDJSON / JSON export.
- SQLite storage (single node).
- Token authentication (a single API token initially; no OAuth/DPoP in v0.1).
- Audit log of writes.

**Explicitly out of scope for v0.1 (deferred):**

- OAuth, DPoP, browser sessions, ATproto identity/federation, MST/CAR.
- Saved views, DropSQL query language.
- WASI/OCI function runtimes, scheduled jobs, triggers.
- Rich live sites, web console, Web Components.
- IoT edge agent, MQTT, device twins.
- Parquet cold storage, DuckDB.
- Multi-node, JetStream, object storage.
- Snapshots, fork/remix, computation receipts.

These are all defined in the source design docs and remain the long-term
direction; they are listed here only to set the v0.1 cut line.

## 3. Current-state architecture (from the source artifacts)

The archived `sources/` folder contains five artifacts produced in the ChatGPT
conversation `Open Source Wolfram Datadrop` (created 2026-07-23):

| Artifact | What it is |
|---|---|
| `sources/opendrop-design.md` | The ~11k-word full design document: product model, event/schema model, ingestion, query, functions, live sites, IoT, security, storage, governance, roadmap, acceptance criteria. |
| `sources/opendrop-browser-pds-profile.md` | An architecture amendment proposing a browser-native PDS layer: DID/OAuth/PKCE/DPoP, static apps as OAuth public clients, authenticated fetch streams, one-use WebSocket tickets, capability shell for uploaded scripts. |
| `sources/open-source-wolfram-datadrop-transcript.md` | The full ChatGPT transcript (3954 lines) that produced the above, including iterative refinements and the build of the MVP slice. |
| `sources/opendrop-pod-mvp.zip` | A standalone MVP pod (separate from the tinyidp overlay). |
| `sources/tinyidp-opendrop-source.tar.gz` | A reference vertical slice built on `go-go-golems/tiny-idp`: OAuth→DPoP exchange, SQLite storage, streams, go-go-goja scripts, embedded browser client, tests. |

### 3.1 What the OpenDrop design commits to (relevant to MVP)

- A **drop** is a portable, programmable capsule: streams, schemas, views,
  functions, sites, devices, policies, secrets, snapshots, provenance. The MVP
  implements only **streams + schemas**.
- Canonical event envelope is **CloudEvents-compatible** with an `id`, `source`,
  `type`, `subject`, `time`, `data`, and OpenDrop extensions (`stream`,
  `sequence`, `meta`). The MVP adopts this envelope.
- Schema modes: `strict`, `permissive`, `observed`. MVP implements strict +
  permissive; observed/inference is deferred.
- Recommended implementation shape: modular monolith, PostgreSQL for metadata,
  S3 for blobs, transactional outbox, SSE by default. MVP collapses this to
  **SQLite + in-process SSE**.

### 3.2 What the browser-PDS profile commits to (deferred to v0.2+)

- DID identity, OAuth + PKCE + PAR + DPoP browser sessions.
- Static sites as OAuth public clients talking directly to storage.
- Authenticated `fetch()` streams as the canonical realtime transport.
- One-use, origin-bound WebSocket tickets.
- Capability shell for uploaded scripts.

The MVP keeps the **transport shape** (authenticated HTTP + SSE) but replaces
DPoP with a simple bearer token, since the MVP is a single-user CLI/server
appliance, not a browser-identity platform yet.

### 3.3 What the tinyidp-opendrop reference slice proves

The `tinyidp-opendrop-source.tar.gz` already implements, in Go on top of
`tiny-idp`:

- Subject-scoped spaces, JSON records with revisions, append-only streams,
  cursors.
- OAuth authorization-code + PKCE → bearer → DPoP storage-session exchange
  (first-use binding).
- Resumable authenticated `fetch()` NDJSON streams and one-use WebSocket tickets.
- Saved CommonJS scripts executed via go-go-goja's safe module set.
- SQLite persistence + synchronous audit log.
- An embedded browser console and dependency-free JS client.

This is the strongest evidence that the core storage/stream/DPoP loop is
buildable in the go-go-golems stack. The MVP will reuse the **storage, stream,
and envelope** shape but will not take a dependency on TinyIDP until identity is
decided (see Decision Records).

## 4. Gap analysis

| Need (v0.1) | Status in source artifacts | Gap |
|---|---|---|
| Single-binary HTTP server | `tinyidp-opendrop` has it, but bound to TinyIDP app wiring | Re-implement as a standalone `datadrop` binary in this repo |
| Append-only event store | Implemented in `tinyidp-opendrop/store*.go` (SQLite) | Port the store/stream model; simplify to drop-scoped streams |
| CloudEvents-style envelope | Defined in `opendrop-design.md` §10.2 | Adopt a minimal envelope |
| JSON Schema validation | Defined in `opendrop-design.md` §11 | Add `xeipuuv/jsonschema` validation |
| Latest-N / range queries | Defined in `opendrop-design.md` §13 | Implement simple SQL-backed queries |
| SSE subscription | `tinyidp-opendrop/stream.go` + `hub.go` | Port the hub/broadcaster pattern |
| CLI `push` / `tail` / `query` | Defined in `opendrop-design.md` §8 | Implement with cobra |
| Token auth | `tinyidp-opendrop` uses DPoP | Use a single static token for v0.1; document DPoP as v0.2 |
| Export (CSV/NDJSON/JSON) | Defined in `opendrop-design.md` §8 | Implement from query results |

## 5. Proposed MVP architecture

```text
        datadrop push / HTTP POST
                 │
                 ▼
      ┌─────────────────────┐
      │   datadrop server    │   (single binary, net/http ServeMux)
      │  ┌───────────────┐   │
      │  │   ingest      │───┼──► envelope + schema validation
      │  └───────────────┘   │
      │  ┌───────────────┐   │
      │  │   store       │───┼──► SQLite (drops, events, schemas)
      │  └───────────────┘   │
      │  ┌───────────────┐   │
      │  │   query       │───┼──► latest / range / aggregate
      │  └───────────────┘   │
      │  ┌───────────────┐   │
      │  │   stream hub  │───┼──► SSE fan-out
      │  └───────────────┘   │
      │  ┌───────────────┐   │
      │  │   audit       │   │
      │  └───────────────┘   │
      └─────────────────────┘
                 │
                 ▼
        SSE / export / CLI read
```

### 5.1 Data model (SQLite, draft)

```sql
CREATE TABLE drops (
  name        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  retention   TEXT,            -- e.g. "90d", nullable
  public_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id          TEXT PRIMARY KEY,        -- envelope id (ULID)
  drop_name   TEXT NOT NULL REFERENCES drops(name),
  seq         INTEGER NOT NULL,        -- per-drop sequence
  source      TEXT,
  type        TEXT,
  subject     TEXT,
  time        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  data        TEXT NOT NULL,           -- JSON blob
  meta        TEXT,                    -- JSON blob
  UNIQUE(drop_name, seq)
);
CREATE INDEX idx_events_drop_time ON events(drop_name, time);

CREATE TABLE schemas (
  drop_name   TEXT NOT NULL REFERENCES drops(name),
  stream      TEXT NOT NULL,
  version     INTEGER NOT NULL,
  spec        TEXT NOT NULL,           -- JSON Schema body
  mode        TEXT NOT NULL,           -- strict | permissive
  PRIMARY KEY (drop_name, stream, version)
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  actor       TEXT,
  action      TEXT NOT NULL,
  detail      TEXT
);
```

### 5.2 Event envelope (MVP subset of CloudEvents)

```json
{
  "specversion": "1.0",
  "id": "01J2KZ1Z4G6W8P4PGH7JNFSMQ9",
  "source": "device:sensor-7",
  "type": "io.datadrop.greenhouse.reading.v1",
  "subject": "greenhouse/zone-a",
  "time": "2026-07-23T18:42:31.418Z",
  "data": { "temperature": 21.7, "humidity": 0.48 },
  "meta": { "received_at": "2026-07-23T18:42:31.507Z" }
}
```

`stream` defaults to `events`; `sequence` is assigned by the server.

### 5.3 HTTP surface (draft)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/drops` | create a drop |
| `POST` | `/v1/drops/{name}/events` | append an event |
| `GET`  | `/v1/drops/{name}/events?limit=N` | latest-N |
| `GET`  | `/v1/drops/{name}/events?from=...&to=...` | time range |
| `GET`  | `/v1/drops/{name}/events/stream` | SSE subscription |
| `GET`  | `/v1/drops/{name}/export?format=csv\|ndjson\|json` | export |
| `PUT`  | `/v1/drops/{name}/schemas/{stream}` | register schema |

Auth: `Authorization: Bearer <token>` on all mutating endpoints; reads depend on
the drop's `public_read` flag.

### 5.4 CLI surface (cobra, draft)

```bash
datadrop serve --addr :8080 --db ./datadrop.db
datadrop create greenhouse --public-read --retention 90d
datadrop push greenhouse temperature=21.7 humidity=0.48
cat readings.ndjson | datadrop push greenhouse --stdin
datadrop tail greenhouse --follow
datadrop query greenhouse 'latest 25'
datadrop export greenhouse --format csv
```

## 6. Decision records

### DR-1: Standalone binary vs. TinyIDP overlay

- **Context:** `tinyidp-opendrop` already implements the core loop on top of
  TinyIDP. Reusing it would give identity + DPoP for free.
- **Options:** (a) make `go-go-datadrop` a new TinyIDP command; (b) build a
  standalone binary in this repo.
- **Decision:** (b) standalone binary.
- **Rationale:** The user created `go-go-datadrop` as a dedicated repo/server.
  Keeping identity out of v0.1 keeps the MVP demonstrable without TinyIDP
  deployment. The TinyIDP slice remains the reference for the storage/stream/
  DPoP shapes and can be re-merged in v0.2 when identity is decided.
- **Consequences:** Re-implement store/stream/envelope (small); defer DPoP.
- **Status:** proposed.

### DR-2: SQLite only for v0.1

- **Context:** The design recommends PostgreSQL + S3 + outbox.
- **Decision:** SQLite (via `modernc.org/sqlite` for pure-Go, CGO-free build).
- **Rationale:** Single-node MVP, zero-ops, easy CLI testing. The SQL schema is
  portable to Postgres later.
- **Consequences:** No high-volume ingestion yet; documented as a v0.3 concern.
- **Status:** proposed.

### DR-3: Bearer token auth for v0.1, DPoP for v0.2

- **Context:** Browser-PDS profile mandates DPoP; `tinyidp-opendrop` implements
  a bearer→DPoP exchange.
- **Decision:** v0.1 ships a single static bearer token (from config/env). DPoP
  and browser sessions move to v0.2 alongside the identity decision.
- **Rationale:** The MVP is a CLI/server appliance; DPoP's value is for browser
  static sites, which are out of v0.1 scope.
- **Status:** proposed.

### DR-4: Adopt the CloudEvents envelope from the design

- **Context:** `opendrop-design.md` §10.2 defines a CloudEvents-compatible
  envelope.
- **Decision:** Adopt a minimal subset (see §5.2).
- **Rationale:** Keeps the MVP compatible with the long-term design and with the
  existing `tinyidp-opendrop` record shape.
- **Status:** proposed.

## 7. Phased implementation plan

1. **Skeleton** — `cmd/datadrop/main.go` with cobra `serve`/`create`/`push`/
   `tail`/`query`/`export` stubs; `net/http` ServeMux; SQLite open/close.
2. **Store** — `pkg/store` with drops, events, schemas, audit tables; migrations.
3. **Ingest** — `POST /v1/drops/{name}/events`; envelope construction; ULID id;
   per-drop sequence; JSON Schema validation (strict/permissive).
4. **Query** — latest-N and time-range; `datadrop query`/`tail`.
5. **Stream** — SSE hub; `datadrop tail --follow`.
6. **Export** — CSV/NDJSON/JSON from query results.
7. **Auth + audit** — bearer token middleware; audit log writes.
8. **Tests + docs** — service/store tests mirroring `tinyidp-opendrop`'s test
   split; README quickstart.

## 8. Testing and validation

- Unit tests for store (CRUD, sequence, idempotency by `id`) and schema
  validation (strict reject vs permissive accept-with-diagnostics).
- HTTP handler tests for ingest, query, SSE, export.
- CLI smoke test: `serve` in tmux → `create` → `push` → `tail --follow` →
  `export`.
- Acceptance for v0.1: the CLI quick-start from `opendrop-design.md` §8.1 runs
  end-to-end against a single binary and a SQLite file.

## 9. Risks and open questions

- **Identity:** Do we adopt TinyIDP/DPoP in v0.2, or stay token-based longer?
  See DR-1/DR-3.
- **Schema inference:** `observed` mode is deferred; confirm v0.1 ships only
  `strict`/`permissive`.
- **Concurrency:** SQLite write contention under high push rates — acceptable
  for MVP; document the ceiling.
- **Naming:** Repo is `go-go-datadrop`; the design's working name is "OpenDrop".
  Decide whether the binary is `datadrop` or `opendrop`. (Proposed: `datadrop`.)

## 10. References — key source files

- `sources/opendrop-design.md` — full design (§8 UX, §10 events, §11 schema,
  §13 query, §28 roadmap, §34 acceptance).
- `sources/opendrop-browser-pds-profile.md` — browser/DPoP/static-site profile.
- `sources/open-source-wolfram-datadrop-transcript.md` — full conversation.
- `sources/opendrop-pod-mvp.zip` — standalone MVP pod.
- `sources/tinyidp-opendrop-source.tar.gz` — reference slice on TinyIDP; see its
  `BUILD-REPORT.md`, `APPLY.md`, `VALIDATION.txt`.
