# go-go-datadrop

A self-hostable, CLI-first **research data inbox**: a single binary that accepts
append-only event data over HTTP and CLI, stores it durably in SQLite, validates
it against JSON Schema, serves latest-N and time-range queries, streams new
events over SSE, and exports open formats.

Inspired by Wolfram Data Drop; designed to be ordinary enough to work with
`curl`, pipes, and SQL, and open enough to self-host and export.

> **Status: v0.1 in progress.** The skeleton (command tree, HTTP server, SQLite
> store with migrations) is implemented. Ingest, query, streaming, export, and
> auth land in the remaining MVP tasks — see
> [`design/02-intern-implementation-guide.md`](ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/02-intern-implementation-guide.md)
> §13. Client subcommands currently exit non-zero with an explicit
> "not implemented yet" message.

## Quick start

```bash
# Build and run the server.
go build -o dist/datadrop ./cmd/datadrop
./dist/datadrop serve --addr :8080 --db ./datadrop.db --token secret

# In another shell:
curl -s localhost:8080/healthz
# {"status":"ok","time":"2026-07-24T16:29:40.266Z"}
```

The target v0.1 workflow, once the remaining tasks land:

```bash
export DATADROP_TOKEN=secret
datadrop create greenhouse
datadrop push greenhouse temperature=21.7 humidity=0.48
datadrop query greenhouse --limit 10
datadrop tail greenhouse --follow
datadrop export greenhouse --format csv > readings.csv
```

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
cmd/datadrop/     entry point
pkg/cli/          cobra command tree (serve + client commands)
pkg/server/       net/http ServeMux HTTP surface
pkg/store/        SQLite persistence, embedded forward-only migrations
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
