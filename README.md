# go-go-datadrop

A self-hostable, CLI-first **research data inbox**: a single binary that accepts
append-only event data over HTTP and CLI, stores it durably in SQLite, validates
it against JSON Schema, serves latest-N and time-range queries, streams new
events over SSE, and exports open formats.

Inspired by Wolfram Data Drop; designed to be ordinary enough to work with
`curl`, pipes, and SQL, and open enough to self-host and export.

> **Status: v0.1 complete.** Ingest, JSON Schema validation, queries, live SSE
> streaming, export, bearer auth, and the audit log are all implemented and
> covered by tests, including an end-to-end CLI smoke test. See
> [`design/02-intern-implementation-guide.md`](ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md)
> for the full design and API reference.

## Quick start

```bash
# Build and run the server.
go build -o dist/datadrop ./cmd/datadrop
./dist/datadrop serve --addr :8080 --db ./datadrop.db --token secret
```

In another shell:

```bash
export DATADROP_TOKEN=secret

datadrop create greenhouse
datadrop push greenhouse temperature=21.7 humidity=0.48
printf '{"temperature":22.8}' | datadrop push greenhouse --stdin
cat readings.ndjson | datadrop push greenhouse --stdin --ndjson

datadrop query greenhouse --limit 10
datadrop tail greenhouse --follow          # blocks, prints new events live
datadrop export greenhouse --format csv > readings.csv

datadrop inspect greenhouse
datadrop list
```

Values in `key=value` pairs are parsed as JSON when possible, so
`temperature=21.7` stores the number `21.7` rather than the string `"21.7"`.
Use `--string k=v` to force a string.

## Commands

| Command | Purpose |
|---|---|
| `datadrop serve` | Run the HTTP server against a SQLite file |
| `datadrop create NAME` | Create a drop |
| `datadrop list` | List drops |
| `datadrop inspect DROP` | Show a drop's metadata and counters |
| `datadrop push DROP [key=value ...]` | Append an event |
| `datadrop query DROP` | Latest-N, time-range, or cursor query |
| `datadrop tail DROP [--follow]` | Recent events, optionally streaming |
| `datadrop export DROP --format csv\|ndjson\|json` | Export |
| `datadrop schema put\|show DROP` | Manage JSON Schema contracts |

Exit codes are stable, so scripts can branch on them without parsing stderr:
`0` success, `1` generic error, `2` usage, `3` auth, `4` not found,
`5` validation.

## HTTP API

All paths are under `/v1`; mutating endpoints require
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/drops` | Create a drop |
| `GET` | `/v1/drops` | List drops |
| `GET` | `/v1/drops/{name}` | Inspect a drop |
| `POST` | `/v1/drops/{name}/events` | Append an event |
| `GET` | `/v1/drops/{name}/events` | Query events |
| `GET` | `/v1/drops/{name}/events/stream` | SSE subscription |
| `GET` | `/v1/drops/{name}/export` | Export CSV / NDJSON / JSON |
| `PUT` | `/v1/drops/{name}/schemas/{stream}` | Register a schema version |
| `GET` | `/v1/drops/{name}/schemas/{stream}` | Read the active schema |
| `GET` | `/healthz` | Liveness |

Ingestion accepts either a bare JSON payload or a full CloudEvents envelope
(discriminated by `Content-Type: application/cloudevents+json`, a top-level
`specversion` member, or an explicit `?mode=simple|envelope`):

```bash
curl -X POST -H "Authorization: Bearer secret" \
     -H "Content-Type: application/json" \
     -d '{"temperature":21.7}' \
     localhost:8080/v1/drops/greenhouse/events
```

Resending an event with an `id` that already exists returns `200` with the
original event rather than appending a duplicate, so a client that retries
after a timeout is safe.

Query parameters on `/events` and `/export`: `stream`, `limit` (capped at 1000),
`order` (`asc`/`desc`), `from`, `to` (RFC3339; `from` inclusive, `to`
exclusive), `after` (sequence cursor), and `time_field` (`time` or
`received_at`).

### Live streaming

The SSE feed replays everything after a cursor and then tails:

```bash
curl -N -H "Authorization: Bearer secret" \
     "localhost:8080/v1/drops/greenhouse/events/stream?after=18440"
```

Each frame's `id:` is the event sequence, so a browser `EventSource` resumes
automatically via `Last-Event-ID`. A subscriber that cannot keep up receives an
`event: reset` frame carrying its cursor and is disconnected; it resumes from
the durable log rather than being buffered without bound.

## Concepts

| Term | Meaning |
|---|---|
| **Drop** | A named destination — the unit of naming, sharing, and export. |
| **Stream** | An ordered, append-only sequence of events inside a drop. Every drop has `events` by default. |
| **Event** | One immutable record. Carries a CloudEvents-compatible envelope plus a JSON payload. |
| **Sequence** | A server-assigned, monotonically increasing integer per `(drop, stream)`. The authoritative ordering — device clocks are not. |
| **Schema** | A versioned JSON Schema contract for a stream's payloads, in `strict` or `permissive` mode. |

Two timestamps are recorded per event and are never conflated: `time` is when
the producer observed it, `received_at` is when the server durably stored it.

### Schema modes

v0.1 stores two modes. Note that the vocabulary differs from the upstream
OpenDrop design document, which names four:

| datadrop | Upstream design | Behaviour |
|---|---|---|
| *(no schema registered)* | `open` | Accept any valid JSON. |
| `permissive` | `warn` | Validate; accept invalid payloads and attach warnings to `meta.warnings`. |
| `strict` | `strict` | Reject invalid payloads with `422`; nothing is stored. |
| — | `suggest` | Schema inference. Not implemented in v0.1. |

### Retention

`--retention` is parsed and stored on the drop but **is not enforced in v0.1**.
Nothing is deleted. Enforcement is a later milestone.

## Development

```bash
make build            # go generate + go build
make test             # go test ./...
make lint             # golangci-lint
make logcopter-check  # verify generated per-package loggers are current
```

All targets set `GOWORK=off`. The parent `go.work` may require a newer Go
toolchain than this module needs, so build this module standalone.

Run the server under tmux when iterating, so it is easy to kill:

```bash
tmux new-session -d -s dd 'go run ./cmd/datadrop serve --db /tmp/dd.db --log-level debug'
tmux capture-pane -p -t dd | tail -20
tmux kill-session -t dd
lsof-who -p 8080 -k
```

## Layout

```text
cmd/datadrop/     entry point + end-to-end smoke test
pkg/datadrop/     shared domain types (envelope, drop, schema, query)
pkg/store/        SQLite persistence, embedded forward-only migrations
pkg/schema/       JSON Schema compilation, validation, and a compiled cache
pkg/stream/       in-process fan-out hub for live subscribers
pkg/server/       net/http ServeMux HTTP surface
pkg/client/       typed HTTP client (what the CLI is built on)
pkg/cli/          cobra command tree
ttmp/             docmgr documentation workspace
```

## Documentation

The design work lives in the docmgr ticket workspace under
`ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/`:

- `design/01-mvp-design.md` — v0.1 scope, decision records, phased plan.
- `design/02-intern-implementation-guide.md` — **start here.** Full onboarding
  and specification: conceptual model, data model, HTTP and CLI API reference,
  package-by-package pseudocode, and a review checklist.
- `reference/01-investigation-diary.md` — how the source material was gathered.
- `reference/02-implementation-diary.md` — chronological implementation record.
- `sources/` — the imported OpenDrop design documents and the two Go reference
  implementations the design is derived from.
