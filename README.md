# go-go-datadrop

A self-hostable, CLI-first **research data inbox**: a single binary that accepts
append-only event data over HTTP and CLI, stores it durably in SQLite, validates
it against JSON Schema, serves latest-N and time-range queries, streams new
events over SSE, and exports open formats.

Inspired by Wolfram Data Drop; designed to be ordinary enough to work with
`curl`, pipes, and SQL, and open enough to self-host and export.

> **Status: v0.2.** v0.1 (event streams) and v0.2 (bulk datasets) are both
> complete and covered by tests, including end-to-end CLI smoke tests. See the
> [v0.1 guide](ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md)
> and the [v0.2 guide](ttmp/2026/07/24/DATADROP-2--dataset-upload-and-retrieval-bulk-datasets-with-manifests-and-schemas/design/01-intern-implementation-guide.md)
> for the full design and API references.

The server holds two kinds of data, and the distinction is the main thing to
understand before using it:

| | **Stream** (v0.1) | **Dataset** (v0.2) |
|---|---|---|
| Shape | unbounded, append-only, live | finite, versioned, immutable |
| Unit | one small JSON event | a body of files with a manifest |
| Identity | a server-assigned sequence | the content's SHA-256 digest |
| Correction | append a superseding event | publish a new version |
| Read | latest-N, time range, live SSE | whole file, or a byte range |

A dataset can be *materialized* into a stream, so a published CSV becomes events
that each point back at the exact bytes and row they came from.

## Quick start

```bash
# Build and run the server.
go build -o dist/datadrop ./cmd/datadrop
./dist/datadrop serve --addr :8080 --db ./datadrop.db --token secret
```

Dataset file bytes are stored beside the database by default; `--blobs DIR`
overrides the location and `--max-upload-bytes` caps an upload (separately from
`--max-body-bytes`, which governs JSON request bodies).

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
| `datadrop dataset push DROP DATASET` | Publish a dataset version |
| `datadrop dataset list\|show DROP` | Inspect datasets |
| `datadrop dataset get DROP DATASET` | Download, verifying digests |
| `datadrop dataset import DROP DATASET` | Materialize rows into a stream |
| `datadrop dataset rm\|gc` | Delete a version; reclaim unreferenced bytes |

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

## Datasets

A dataset is a named, versioned collection of files inside a drop. Publishing
hashes each file locally, asks whether the server already holds those bytes, and
transfers only what is new:

```bash
datadrop dataset push greenhouse readings-2026 \
    --file data/readings.csv --file README.md \
    --title "Greenhouse readings, 2026 season" --license CC-BY-4.0

# Edit only the README and republish:
datadrop dataset push greenhouse readings-2026 --file data/readings.csv --file README.md
# uploaded 1 file(s) (71 B), reused 1 already-stored file(s) (644.6 KiB)

datadrop dataset list greenhouse
datadrop dataset show greenhouse readings-2026
datadrop dataset get greenhouse readings-2026 --output ./downloaded/
datadrop dataset get greenhouse readings-2026 --archive -o v2.tar

# Turn the rows into events, each carrying provenance back to the source bytes.
datadrop dataset import greenhouse readings-2026 --path data/readings.csv

datadrop dataset rm greenhouse readings-2026 --version 1
datadrop dataset gc
```

`dataset get` recomputes each downloaded file's digest and fails loudly if it
does not match, so corruption is caught at the point of use.

### Dataset HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/drops/{drop}/datasets` | List datasets |
| `GET` | `/v1/drops/{drop}/datasets/{name}` | Dataset and its committed versions |
| `POST` | `/v1/drops/{drop}/datasets/{name}/versions` | Open a draft version |
| `PUT` | `/v1/drops/{drop}/datasets/{name}/versions/{v}/files/{path...}` | Upload or mount a file |
| `POST` | `/v1/drops/{drop}/datasets/{name}/versions/{v}/commit` | Commit with a manifest and schema |
| `GET` | `/v1/drops/{drop}/datasets/{name}/versions/{v}` | Version manifest and file list |
| `GET` | `/v1/drops/{drop}/datasets/{name}/versions/{v}/files/{path...}` | Download (Range, ETag) |
| `GET` | `/v1/drops/{drop}/datasets/{name}/versions/{v}/archive` | Stream the version as tar |
| `POST` | `/v1/drops/{drop}/datasets/{name}/versions/{v}/import` | Materialize rows into a stream |
| `DELETE` | `/v1/drops/{drop}/datasets/{name}/versions/{v}` | Delete a version |
| `PUT` | `/v1/drops/{drop}/datasets/{name}/data` | Single-shot: upload one file and commit |
| `HEAD` | `/v1/blobs/{digest}` | Does the server already hold these bytes? |
| `POST` | `/v1/blobs/gc` | Delete unreferenced bytes |

`{v}` accepts a version number or the literal `latest`, which resolves to the
highest **committed** version — a draft never shadows it.

Uploading with `curl` directly:

```bash
curl -T readings.csv -H "Authorization: Bearer secret" \
     "localhost:8080/v1/drops/greenhouse/datasets/readings/data?path=readings.csv"

# Resume an interrupted download:
curl -H "Authorization: Bearer secret" -H "Range: bytes=104857600-" \
     "localhost:8080/v1/drops/greenhouse/datasets/readings/versions/latest/files/readings.csv"
```

### How dataset storage works

Bytes are stored once per distinct SHA-256 digest under `<db-dir>/blobs`, so
two versions sharing an unchanged file occupy one copy. The digest is
simultaneously the storage key, the integrity check, and the `ETag`.

A version is a **draft** until it is committed, and drafts are invisible to
every read path — serving a half-uploaded dataset would produce silently wrong
results rather than an error. Committed versions are immutable; a correction is
a new version.

Deleting a version leaves its bytes in place, because other versions may share
them. `datadrop dataset gc` reclaims the ones nothing references, skipping any
blob younger than a grace period so that an in-flight upload is never swept.

## Concepts

| Term | Meaning |
|---|---|
| **Drop** | A named destination — the unit of naming, sharing, and export. |
| **Stream** | An ordered, append-only sequence of events inside a drop. Every drop has `events` by default. |
| **Event** | One immutable record. Carries a CloudEvents-compatible envelope plus a JSON payload. |
| **Sequence** | A server-assigned, monotonically increasing integer per `(drop, stream)`. The authoritative ordering — device clocks are not. |
| **Schema** | A versioned JSON Schema contract for a stream's payloads, in `strict` or `permissive` mode. |
| **Dataset** | A named, versioned collection of files inside a drop. |
| **Dataset version** | An immutable snapshot: a manifest, an optional schema, and files. |
| **Blob** | File bytes, addressed by their SHA-256 digest and shared across versions. |

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
cmd/datadrop/     entry point + end-to-end smoke tests
pkg/datadrop/     shared domain types (envelope, drop, schema, query, dataset)
pkg/store/        SQLite persistence, embedded forward-only migrations
pkg/blob/         content-addressed blob store for dataset file bytes
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

And under `ttmp/2026/07/24/DATADROP-2--dataset-upload-and-retrieval-bulk-datasets-with-manifests-and-schemas/`:

- `design/01-intern-implementation-guide.md` — the dataset layer: why a dataset
  is not a stream, the content-addressed blob store, the staged upload protocol,
  retrieval, and materialization.
- `reference/01-implementation-diary.md` — chronological implementation record.
