---
Title: Implementation diary
Ticket: DATADROP-3
Status: active
Topics:
    - frontend
    - web-ui
    - visualization
    - grammar-of-graphics
    - datasets
    - streams
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Step-by-step record of building the DATADROP-3 visualization workbench, including failures, exact errors, and review pointers.
LastUpdated: 2026-07-24T15:21:15.016726521-04:00
WhatFor: Recording the implementation journey for review and continuation
WhenToUse: Read before continuing DATADROP-3, or when reviewing any of its commits
---

# Diary

## Goal

Record how the DATADROP-3 web UI was designed and built: a browser
grammar-of-graphics workbench over datadrop event streams and dataset version
files, served by the same Go binary, on top of one server-side projection from
any source to a typed table.

## Step 1: Read the reference artifact, then design against the server we actually have

The starting material was `pbui-gog.jsx` — a 2772-line single-file React
grammar-of-graphics workbench built for the serve-artifacts experiment — and its
ticket `SERVE-20260723-PBUI-GOG`. That artifact proves the interaction model
works: a dataset registry, a five-verb transformation pipeline, an encoding with
`x`/`y`/`color`/`size`/`facet` channels, and a pure `buildPlot` that turns a spec
into drawable geometry. Reading it end to end was the first hour of this step,
and most of §12 and §13 of the guide are a port of `:556-660` and `:924-1117`.

The design work was deciding what *changes* when the same model sits on a real
server. The answer turned out to be one thing with several consequences: the
artifact infers column types by sniffing strings, because it has no server to ask
— but go-go-datadrop already stores a JSON Schema on a dataset version
(`pkg/datadrop/dataset.go:57-61`) and already receives typed JSON in event
payloads. Re-deriving types in the browser throws that away and, worse, creates
two components answering the same question by different methods with nothing
forcing them to agree. That observation is what produced the ticket's spine: one
projection, on the server, from any source to a typed table, with every field
recording where its type came from.

### Prompt Context

**User prompt (verbatim):** "Now look at /home/manuel/code/wesen/2026-03-29--serve-claude-experiments/imports/pbui-gog.jsx and the correspondig /home/manuel/code/wesen/2026-03-29--serve-claude-experiments/ttmp/2026/07/23/SERVE-20260723-PBUI-GOG--pbui-grammar-of-graphics-csv-import-opfs-persistence-and-zip-export-bundles ticket and its design doc.

Create a new design dock in go-go-datadrop to add a web UI that can load uploaded datasets or timeseries to do visualizations.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Follow-up prompt (verbatim):** "Goal set: Create the ticket, the analysis, then implement the whole feature start to end, keeping a detailed diary at all times (see skill for the exact format), and commit at appropriate intervals."

**Assistant interpretation:** Study the pbui-gog grammar-of-graphics artifact and
its ticket, then open a new docmgr ticket in go-go-datadrop for a web UI that
visualizes both uploaded datasets and event-stream timeseries. Write an
intern-level analysis/design/implementation guide with prose, bullets,
pseudocode, diagrams, API references and file references; store it in the ticket
and upload it to reMarkable. Then implement the entire feature, keeping a diary
in the `diary` skill's format and committing at sensible boundaries.

**Inferred user intent:** go-go-datadrop can store and serve research data but
offers no way to look at it, which makes every question require leaving the
system. The user has already built and validated the interaction model once in a
throwaway artifact and wants it turned into a real, permanent part of the server
— designed properly against the server's actual capabilities rather than
copy-pasted.

### What I did

- Read `pbui-gog.jsx` at the structural level (a `grep` for top-level
  declarations gave a complete table of contents) and in detail for the four
  regions that matter: the dataset registry and CSV import (`:181-423`), the
  pipeline engine (`:556-660`), `World` (`:661-903`), and `buildPlot`
  (`:924-1117`).
- Read the SERVE-20260723-PBUI-GOG ticket: `index.md`, `tasks.md`, and both
  design docs (ZIP export bundles, slide deck builder). Adopted their
  decision-record format.
- Surveyed the target repository: the 21-route `ServeMux` table
  (`pkg/server/server.go:108-150`), the CSV export flattener
  (`pkg/server/handlers_export.go:148-297`), the row readers in the dataset
  importer (`pkg/server/handlers_import.go:274-411`), dataset version state and
  path validation (`pkg/datadrop/dataset.go`), the query clamp
  (`pkg/datadrop/query.go`), the auth middleware (`pkg/server/middleware.go`),
  and migration 0001 for `stream_heads`.
- Confirmed the toolchain: `bun 1.2.13`, `node v22.22.1`, `go1.26.1`, and that
  `bun add` reaches the network from this sandbox.
- Created the ticket workspace with `docmgr ticket create --ticket DATADROP-3`,
  seeded eleven tasks, and added the design and diary documents.
- Wrote `design/01-web-ui-visualization-workbench-intern-implementation-guide.md`
  (20 sections, six decision records, three mermaid diagrams).

### Why

- The user asked for a design *derived from* the reference artifact, not a
  transcription of it. That requires knowing both codebases well enough to say
  precisely which parts port unchanged (the pipeline, `buildPlot`, `niceTicks`),
  which port with a signature change (dataset registry becomes a `Table`
  argument), and which must not port at all (`parseCSV`, `inferType`).
- Surveying the server first is what turned up the two facts the design hangs
  on: there is no endpoint that lists the streams in a drop, and the flattening
  rules a chart must obey already exist inside the CSV export handler.

### What worked

- The reference artifact is unusually well-commented for a prototype, and the
  comments explain *intent* — why 80% of values must parse as dates before a
  column is called temporal, why OPFS holds CSV text while `localStorage` holds
  the index. That made the port decisions fast.
- `grep -n '^\(const\|function\|class\|export\)' imports/pbui-gog.jsx` produced a
  full outline in one call, which made targeted reads possible instead of paging
  through 163 KB.
- The existing `readCSVRows` / `readNDJSONRows` / `csvValue` trio already handles
  ragged rows, blank headers, empty files, and the cases `strconv.ParseFloat`
  accepts but JSON cannot represent. Moving them into `pkg/tabular` is a pure
  relocation, so task 1 can be validated by "the existing export and import tests
  still pass unmodified".

### What didn't work

- `docmgr task add --ticket DATADROP-3 --title "…"` failed:

  ```
  Error: unknown flag: --title
  ```

  The flag is `--text`. All eleven tasks were re-added with `--text`.
- Nothing else failed; this step produced no code.

### What I learned

- The three-letter type vocabulary (`q` / `n` / `t`) is doing more work than it
  looks. It is not a data type — it is the minimum information a scale
  constructor needs. That is why it can be overridden per chart without touching
  the source, and why it is a presentation decision rather than a schema
  decision.
- `http.ServeMux` cleans URL paths before routing, so a traversal attempt in a
  `{path...}` segment never reaches a handler. The v0.2 work established this. It
  matters again here because the new dataset table endpoint takes the logical
  path as a **query parameter**, which nothing normalizes — so
  `ValidateDatasetPath` is load-bearing on this endpoint in a way it is not on
  the download endpoint, and the test must exercise the query form.
- `EventSource` cannot set an `Authorization` header. This is a hard browser
  limitation, not an oversight, and it constrains live tail to `public_read`
  drops unless a `fetch`-based SSE reader is written. Better to state the limit
  in the design than to discover it in task 9.

### What was tricky to build

No code yet, but two design questions took most of the thinking time.

**Where type inference lives.** The tempting answer is "wherever it is easiest",
which is the browser, because the reference artifact already has the code. The
underlying cause of the difficulty is that both places *can* do it and each looks
locally correct. The symptom that decided it: a `station_id` column holding
`["01","02"]` is quantitative to a sniffer and nominal to the schema its producer
wrote, and the sniffer wins silently. Resolution: the server infers, schema beats
observation beats default, and every field carries `inferred_from` so a guess is
labelled as a guess on screen.

**Where truncation is admitted.** A 5 GiB dataset file and a browser that stops
being interactive around 20 000 marks do not meet. Every option that hides the
gap produces a chart that looks complete and is not. Resolution: `truncated` and
`strategy` in the payload, a non-dismissible banner in the UI, and the phrasing
"the first 2 000 of at least 2 000 rows" — because a streaming reader that stops
at the cap genuinely does not know the total, and claiming one is worse than
admitting ignorance.

### What warrants a second pair of eyes

- **The parity claim.** §16.1 asserts that moving `flattenJSON` into
  `pkg/tabular` makes the CSV export and the chart agree about columns. That is
  only true if both call it with the same prefix rules. The planned parity test
  (export header versus table field names, in order) is what enforces it; review
  that the test compares order and not just membership.
- **The limit-clamp interaction.** §9.2 sets `query.Limit` *after*
  `EventQuery.Normalize()` clamps it to `datadrop.MaxLimit` (1000). This is
  deliberate — a table wants a bigger budget than an envelope page — but it means
  a future change to `Normalize` could silently cap every chart at a thousand
  points. The test that asks for 5 000 rows and asserts it gets 5 000 is the
  guard.
- **DR-4's blast radius.** The claim is that a read-only, cookie-free UI cannot
  introduce CSRF. Check that no endpoint the UI touches mutates state, and that
  `fetchBaseQuery` is never configured with `credentials`.

### What should be done in the future

- Decide whether `?counts=false` is needed on `GET /v1/drops/{name}/streams`
  before the first drop with millions of events exists — §9.1 notes the counting
  subqueries are O(rows).
- Revisit `stride` sampling once manifests reliably carry `row_count` (§19).

### Code review instructions

- **Where to start:** the guide, §2 (the one idea) and §4 (why the browser must
  not infer types). Everything else is a consequence of those two sections; if
  either is wrong, the ticket is wrong.
- **Then:** §17, decision records DR-1 through DR-6, each checkable against the
  file references it cites.
- **How to validate this step:** `docmgr doctor` on the ticket, and confirm the
  three mermaid blocks parse — no braces inside flowchart node labels, no
  semicolons inside sequenceDiagram messages. Both broke a reMarkable render in
  DATADROP-2.

### Technical details

Ticket workspace:

```
ttmp/2026/07/24/DATADROP-3--web-ui-grammar-of-graphics-visualization-workbench-for-datasets-and-streams/
├── design/01-web-ui-visualization-workbench-intern-implementation-guide.md
├── reference/01-implementation-diary.md
├── tasks.md          (11 tasks)
├── changelog.md
└── index.md
```

The seam type, which is the whole design in twenty lines:

```go
type Table struct {
    Source    SourceRef        `json:"source"`
    Fields    []Field          `json:"fields"`
    Rows      []map[string]any `json:"rows"`
    RowCount  int              `json:"row_count"`
    Truncated bool             `json:"truncated"`
    Strategy  string           `json:"strategy"`
    NextAfter int64            `json:"next_after,omitempty"`
}

type Field struct {
    Name         string     `json:"name"`
    Type         FieldType  `json:"type"`          // "q" | "n" | "t"
    InferredFrom TypeSource `json:"inferred_from"` // schema | envelope | values | default
    Distinct     int        `json:"distinct,omitempty"`
    NullCount    int        `json:"null_count,omitempty"`
}
```

## Step 2: pkg/tabular — the one projection, and two sets of rules that moved into it

The whole ticket rests on a single type, so the first task was to build it and
nothing else. `pkg/tabular` turns either source into a `Table`: an ordered list
of named, typed columns plus rows. `FromEvents` takes an already-fetched page of
envelopes, because the store's query path already owns ordering, cursors and the
limit clamp; `FromRows` takes an `io.Reader` and abandons it at the row cap,
because a dataset file can be gigabytes and the blob store exists so that it
never has to be resident.

Two sets of rules moved here rather than being reimplemented. The dotted-path
flattener came out of `handlers_export.go`, so the CSV export and the table
projection now call the same walker — their column sets are identical by
construction rather than by hope. The CSV and NDJSON row readers came out of
`handlers_import.go` unchanged. That the existing export and import tests pass
without modification is the proof the move was faithful, and it is worth more
than any test I could have written for the new package.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build task 1 of the ticket: the shared projection
package, with type inference that records its own provenance.

**Inferred user intent:** Get the foundation right before anything depends on
it, since every later task consumes this one type.

**Commit (code):** `0d4f842` — "feat(DATADROP-3): task 1 — pkg/tabular, the single source-to-table projection"

### What I did

- Added `pkg/tabular`: `Table`, `Field`, `SourceRef`, `FieldType`, `TypeSource`,
  the row budget constants, `FromEvents`, `FromRows`, `SchemaProperties`, and
  the inference ladder.
- Moved `flattenJSON`/`flattenValue` out of `pkg/server/handlers_export.go` and
  `readCSVRows`/`readNDJSONRows`/`csvValue`/`formatFromPath` out of
  `pkg/server/handlers_import.go`, rewiring both handlers onto the new package.
- Added `ReadJSONArrayRows`, streaming a top-level JSON array token by token.
- Lifted the canonical timestamp format into `pkg/datadrop`, with
  `store.TimeFormat` left as an alias so no call site changed.
- Wrote `pkg/tabular/tabular_test.go` (~25 cases) and moved the two tests that
  came with the relocated helpers.

### Why

- The design's first commitment is that a source becomes a table in exactly one
  place. A package is how that is enforced rather than merely intended.
- The flattener had to move because the alternative — reimplementing the rules —
  is a system where the chart and its "download as CSV" disagree about columns
  and nothing detects it.
- The timestamp format had to move because three layers need it. A format that
  two of them agree on is a bug waiting for the third, and `pkg/tabular`
  deliberately does not import `pkg/store` (so its tests link no SQLite driver).

### What worked

- The relocation was mechanical and the existing suites stayed green, which is
  exactly the signal that was wanted.
- Parameterizing one walker by a leaf handler gave both `FlattenStrings` (CSV
  cells) and `FlattenValues` (typed table cells) from one implementation, so the
  two cannot diverge on column names even in principle.
- Decoding with `json.Decoder.UseNumber` means a 17-digit identifier survives as
  `json.Number` and marshals back as the same literal.

### What didn't work

- The first `FromEvents` produced columns named `data..note`. `DataPrefix` is
  `"data."` and the walker joins with a dot when the prefix is non-empty, so the
  separator was applied twice. Fixed by flattening with an empty prefix and
  prepending afterwards — which is exactly what the CSV export does, so the
  parity is now structural rather than coincidental.
- `NullCount` was computed per row, incrementing for every known column absent
  from that row. A column first seen in row 900 therefore reported 0 nulls for
  the 899 rows that predate it — exactly backwards. Replaced with
  `len(rows) - observed()`, computed once at the end, which also removed an
  O(columns) loop from the per-row path.
- Two test expectations compared against `float64`; flattened numbers are
  `json.Number`. Fixed the assertions, not the implementation.
- `staticcheck` flagged `predeclared` shadowing on a local named `cap` in
  `EventQuery.Normalize`. Renamed to `ceiling`.

### What I learned

- The three-letter type vocabulary is not a data type — it is the minimum a
  scale constructor needs. That is why an override is a chart-local presentation
  decision and never a change to the source.
- Recording *how* a type was decided costs one string per field and changes the
  product: the UI can distinguish "the producer wrote this down" from "we looked
  at 500 values and guessed", which turns a wrong guess into something a user
  can see and correct.

### What was tricky to build

**Column ordering across three sources with three different notions of order.**
An event table wants the nine envelope columns first in a fixed order, then
`data.*` sorted. A CSV wants the author's header order, which is meaningful and
which is destroyed the moment a row becomes a JSON object (Go marshals map keys
sorted). NDJSON and JSON have no order at all, and Go map iteration is
deliberately randomized, so anything derived from first-seen order would differ
between runs.

The symptom that forced the issue was a test asserting a CSV's `z,m,a` header
survived, which it did not. The resolution was a single mechanism — a builder
with a `leading []string` of columns emitted first in that order, everything
else sorted and appended — plus an `OnHeader` callback on the CSV reader so the
header reaches the builder before the first row does.

### What warrants a second pair of eyes

- `Cell` reproduces the export's string rendering exactly, including two quirks
  kept for parity rather than for merit: an empty nested object renders as the
  literal `{}`, and a top-level scalar payload produces a column named `data.`
  with an empty suffix. Both are pre-existing v0.1 behaviour. Changing either
  changes the CSV export, which is why they were preserved rather than tidied.
- The `> 80%` temporal threshold and the three-value minimum are carried over
  from the reference artifact. They are tolerances for dirty data, not
  confidence measures, and the tests pin both the 80%-exactly case (nominal) and
  the 83% case (temporal).

### What should be done in the future

- Stream schemas are still unused for typing. A registered stream schema
  describes `data`, while table columns are flattened and prefixed, so the
  mapping from schema property to column name is real work rather than the
  identity. Deferred deliberately (guide §19).

### Code review instructions

- **Where to start:** `pkg/tabular/table.go` for the type, then `infer.go` for
  the precedence ladder — those two files are the ticket's thesis.
- **Then:** `flatten.go`, checking that `FlattenStrings` and `FlattenValues`
  cannot disagree about names.
- **How to validate:** `GOWORK=off go test ./pkg/tabular ./pkg/server` — the
  server suite passing unmodified is the evidence the relocation was faithful.

### Technical details

The inference ladder, which is the whole of DR-2:

```
1. a fixed envelope column   -> (its type,        envelope)
2. the version's JSON Schema -> (mapped type,     schema)
3. the observed values       -> (inferred type,   values)
4. nothing observed          -> (nominal,         default)
```

## Step 3: The stream catalogue and the two table endpoints

Three read endpoints, all through `authorizeRead`, none mutating: a stream
catalogue, a stream projected into a table, and one dataset file projected into
a table. The API is now complete enough for a frontend to talk to.

`GET /v1/drops/{name}/streams` had to exist before anything else, because
streams are created implicitly by appending to them — there is no registry, and
`stream_heads` is the only record that a stream ever existed. That also decided
its shape: it reports the sequence head and the event count separately, because
a retention sweep lowers the count and must never lower the head, and a drop
where the two diverge has told the reader something true.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build tasks 2 through 4 — the HTTP surface the web
UI needs.

**Inferred user intent:** Finish the server side so the frontend can be
developed against something real rather than against fixtures.

**Commit (code):** `b6cfd61` — "feat(DATADROP-3): tasks 2-4 — the stream catalogue and the two table endpoints"

### What I did

- `Store.ListStreams`, deriving the catalogue from `stream_heads` with correlated
  subqueries for the count and the last ingest time.
- `datadrop.StreamInfo`, and `EventQuery.LimitCap`.
- `pkg/server/handlers_table.go`: `handleListStreams`, `handleStreamTable`,
  `handleDatasetTable`, and `parseTableLimit`.
- Registered all three in `Handler()`.
- `pkg/server/handlers_table_test.go` (16 cases) and two `ListStreams` store
  tests.

### Why

- `EventQuery.LimitCap` exists because `QueryEvents` calls `Normalize` itself,
  which clamps to `datadrop.MaxLimit` (1000). Setting `query.Limit = 5000` in the
  handler and hoping is not enough — the store would clamp it straight back. The
  cap is a handler-set field and is never parsed from a URL, so a client cannot
  raise its own ceiling.
- An over-large `?limit` is clamped rather than rejected. "Give me everything" is
  a reasonable request, and a 400 teaches the caller nothing that the response's
  own `row_count` and `truncated` do not already say.

### What worked

- The dataset table handler is short because every hard part already existed:
  `resolveVersion` for `latest`, `GetDatasetVersion(includeDrafts=false)` for the
  draft rule, `blobs.Open` for the bytes, and `tabular.FromRows` for the rest.
- The parity test — export CSV header versus table field names, compared element
  by element in order — passed first time, which is what the shared flattener
  was for.

### What didn't work

- The first truncation rule was "a full page means there is more", and the test
  asking for exactly 1005 rows out of 1005 events failed: it reported truncation
  for a stream that had been read completely. Replaced with asking the store for
  `limit + 1` rows: getting the extra row proves a remainder exists, not getting
  it proves one does not. That also matches `FromRows`, where the reader hits EOF
  and genuinely knows. Reporting truncation when there is none is a lie in the
  direction that makes users stop believing the banner.

### What I learned

- `http.ServeMux` cleans URL paths before routing, so the traversal defence on
  the download endpoint is unreachable through the URL. On the new table endpoint
  the logical path is a **query parameter**, which nothing normalizes — so
  `ValidateDatasetPath` is genuinely load-bearing here, and the test exercises
  the query form for that reason. Testing only the URL form would have produced a
  green suite with the live vector unverified.

### What was tricky to build

**Two limits with the same name.** `?limit` on `/events` means "up to a thousand
envelopes"; `?limit` on `/table` means "up to fifty thousand rows". They share a
parser, a struct field and a normalizer, and the normalizer belongs to the
smaller of the two. Threading a second limit through would have meant a parallel
query path; special-casing inside `Normalize` would have made the query type know
about the visualization layer. `LimitCap` — a field the handler sets and the URL
cannot — was the smallest change that keeps one query path and one clamp.

The residual risk is that the interaction is invisible: a future edit to
`Normalize` could silently cap every chart at a thousand points and nothing would
fail. `TestStreamTableHonoursALimitAboveTheEventPageCap` is the guard, and its
failure message says what went wrong rather than just what differed.

### What warrants a second pair of eyes

- `ListStreams` runs two correlated subqueries per stream, each O(events). It is
  a catalogue endpoint called once when a picker opens, and the handler comment
  says so — but a drop with millions of events will feel it.
- The `limit + 1` trick means the store is asked for one row beyond
  `MaxTableRows`, so `LimitCap` is set to `MaxTableRows + 1`. Check that nothing
  downstream treats `MaxTableRows` as an invariant on the returned slice; the
  handler trims before projecting.

### What should be done in the future

- `GET /v1/drops/{name}/sources`, aggregating streams and datasets into one
  round trip, if the picker ever feels slow. Deliberately not built on
  speculation.

### Code review instructions

- **Where to start:** `pkg/server/handlers_table.go`, then
  `pkg/datadrop/query.go:Normalize` for the cap interaction.
- **How to validate:** `GOWORK=off go test ./pkg/server ./pkg/store`. The tests
  that matter most are `TestExportAndTableAgreeOnColumns`,
  `TestStreamTableHonoursALimitAboveTheEventPageCap`, and
  `TestDatasetTableRejectsTraversalInTheQueryParameter`.

## Step 4: The workbench — and four bugs that only a browser could find

The frontend is React, TypeScript, RTK Query and Bootstrap, built by Vite into
`pkg/webui/dist` and embedded. Everything under `src/model` is pure — the
pipeline, the chart specification, the plot engine, the time axis, the permalink
codec — with no React import and no network, which is what lets `bun test`
exercise the entire grammar of graphics with no DOM and no server. `buildPlot`
returns drawable geometry rather than SVG, so a test can assert that a mark lands
at a particular coordinate instead of comparing a snapshot nobody reads.

Then I ran it against a real server with a real timeseries, and found four
things that reading could not have found. Each is recorded below because each is
a category of mistake rather than a typo.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build tasks 5 through 11 — the embedded UI mount,
the frontend, live tail, export, permalinks, tests and documentation.

**Inferred user intent:** A working workbench, not a scaffold: something that
can be opened against real data and used.

**Commit (code):** `04ec836` — "feat(DATADROP-3): tasks 5-11 — the web visualization workbench"

### What I did

- `pkg/webui`: embedded `dist`, an SPA handler at `/ui`, assets at `/static`, a
  redirect from `/`, and `--ui-dir` / `--no-ui` on `serve`.
- `ui/`: the full application — source picker, token bar, pipeline editor,
  encoding editor, `PlotSvg`, data table, truncation banner, live toggle, PNG
  and CSV export, permalinks.
- `ui/src/model/`: `table.ts`, `pipeline.ts`, `chart.ts`, `plot.ts`, `time.ts`,
  `live.ts`, `permalink.ts` — all pure.
- 58 `bun test` cases across five files; a Go-generated fixture asserting the
  browser's live projection matches the server's.
- `cmd/datadrop/table_smoke_test.go`, driving a real binary.
- Makefile targets `ui`, `ui-test`, `ui-dev`; README section; `.gitignore` fixed
  so `pkg/webui/dist` is committed while `ui/node_modules` is not.

### Why

- The UI is mounted at `/ui` rather than at `/` with a catch-all fallback. A
  fallback at the root returns `index.html` for anything unmatched, including a
  mistyped `/v1/drop` — an API 404 arriving as an HTML page, which is a genuinely
  confusing afternoon for whoever wrote the client. A test asserts the API keeps
  its own 404s.
- The frontend build is not wired into `make build` or into `go generate`.
  `pkg/webui/dist` is committed, so a Go build and a `go install` of this module
  must not require bun.

### What didn't work

Four defects, all found by driving the UI in a browser rather than by reading it.

**1. The default chart charted the row number.** `defaultChart` took the first
quantitative field and the first nominal field, which for a stream table are the
envelope columns `seq` and `id`. The result was sequence against time — a
straight line that says nothing — with a legend holding one entry per row. Fixed
by ranking payload columns ahead of envelope metadata, and by requiring a colour
candidate to have between 2 and 8 distinct values, a count the server already
reports in `Field.Distinct`.

**2. A temporal x-axis was a band scale.** Carried over from the reference
artifact, where it was correct for twenty-four monthly buckets. For 120 sensor
readings it produced 120 evenly spaced slots — drawing uneven intervals evenly —
labelled with full ISO timestamps. Fixed with `ui/src/model/time.ts`: values
parse to epoch milliseconds and scale linearly, and ticks land on round *units of
time* from a ladder (1s, 5s, …, 1h, 1d, 1y) rather than on round numbers of
milliseconds. The axis went from unreadable to `14:00 14:30 15:00 15:30 16:00`.
A bar keeps the band, because a bar needs a discrete slot to have a width.

**3. Live tail connected, stayed open, reported no error, and delivered
nothing.** The server writes `event: append` frames
(`pkg/server/handlers_stream.go:106`), and `EventSource.onmessage` fires only for
*unnamed* frames. Diagnosed by opening an `EventSource` from the browser console
and watching zero messages arrive while `curl -N` on the same URL showed the
frames plainly. Fixed with `addEventListener("append", …)`. A silent success is
far harder to notice than a failure.

**4. A schema said "string" and the value was already a number.** The whole
motivating example of the ticket is `station_id` holding `"001"`. The type came
back correctly as nominal-from-schema — and the *value* came back as `1`, because
`CSVValue` had coerced it before the schema was ever consulted. Typing the column
is not enough; by the time a row is a JSON object the original text no longer
exists. Fixed by passing the schema's string columns into the reader as
`ReadOptions.TextColumns`.

Two smaller ones: the source picker's file list was always empty, because the
dataset-detail endpoint deliberately omits per-version file lists (a v0.2 cost
decision) — the picker now asks for the one version it is about to read; and my
first seeding script produced `data.data.temp_c` columns, which was my curl being
wrong about the ingest modes, not the code.

### What I learned

- **A silent success is the expensive failure mode.** Three of the four defects
  produced a working-looking screen: a chart that drew, an axis that had labels,
  a connection that opened. Only the schema one was visible in a payload. The
  general lesson is that a browser-facing feature needs to be driven, not
  reviewed, and that "it rendered" is not evidence.
- **Data that has been coerced cannot be un-coerced by a later layer.** Types
  flow forward; the schema had to reach the *reader*, not merely the field list.
- SSE named events are a real interoperability edge. `onmessage` is the obvious
  API and it is wrong for any server that names its frames.

### What was tricky to build

**Keeping the browser's live projection honest.** The design's first commitment
is that a source becomes a table in exactly one place, and live tail breaks it:
the browser must project each arriving envelope itself, because the alternative
is a round trip per event. The containment is a Go test
(`pkg/tabular/fixture_test.go`) that writes both the input envelopes and the
projection it produced into `ui/test/fixtures/envelope-projection.json`, and a
`bun test` that asserts the TypeScript implementation produces exactly the same
rows. Regenerating is `go test ./pkg/tabular -run TestWriteLiveProjectionFixture
-update`, and a stale fixture fails with a message that says so.

Building it immediately found a real divergence: the SSE endpoint marshals an
envelope with Go's default time encoding, which is RFC3339Nano and strips
trailing zeros, so the instant the table endpoint reports as `…05.100Z` arrives
over SSE as `…05.1Z`. Two spellings of one instant in one column, which a nominal
axis would render as two categories. `canonicalTime` normalizes via
`Date#toISOString`, which happens to produce exactly the canonical form.

**Truncation advice you cannot act on.** The banner told the user to raise the
row limit, and there was no control for it. Added one — 500 / 2 000 / 10 000 /
50 000 — because advice that cannot be followed is worse than no advice.

### What warrants a second pair of eyes

- **The live-tail fixture is only as good as its inputs.** It covers nesting,
  arrays, an explicit null, an empty object, a boolean, a large integer and a
  key present in only one event. If the flattening rules gain a case, the fixture
  must gain an envelope that exercises it — nothing enforces that.
- **JavaScript cannot represent integers beyond 2^53.** The fixture holds
  `12345678901234567` and the round-trip test passes only because both sides go
  through `JSON.parse` and lose the same digits. The server preserves the value
  exactly; the browser cannot. This affects the table view, not the chart, and it
  is a property of the platform rather than a defect — but it is undocumented in
  the UI.
- **`buildPlot` is quadratic in categories** — `categories.indexOf` and
  `xCategories.indexOf` inside per-mark loops. Bounded by `MAX_CATEGORIES = 8`
  for colour, but `xCategories` is not bounded, so a bar chart over a
  high-cardinality x is O(rows × categories). Fine at the row budget; worth a
  Map if the budget rises.
- **DR-4's claim.** No endpoint the UI touches mutates state, and
  `fetchBaseQuery` is never configured with `credentials`. Both are worth
  re-checking rather than taking on trust.

### What should be done in the future

- A `fetch`-based SSE reader, so live tail works on a token-protected drop.
  `EventSource` cannot set an `Authorization` header; the control is disabled
  with that explanation rather than smuggling the token into a query parameter
  where it would land in server logs and browser history.
- `stride` sampling for large files, once manifests reliably carry `row_count`.
- A note in the UI about integer precision beyond 2^53.

### Code review instructions

- **Where to start:** `ui/src/model/plot.ts` — the plot engine is the largest
  and most consequential file, and `buildPlot`'s refusal list at the top is what
  keeps a wrong chart from being drawn.
- **Then:** `ui/src/model/live.ts` and `pkg/tabular/fixture_test.go` together,
  as one mechanism.
- **How to validate:**

  ```bash
  make test          # Go, including cmd/datadrop/table_smoke_test.go
  make ui-test       # tsc --noEmit + bun test (58 cases)
  make lint
  make ui && GOWORK=off go build ./...   # the embedded bundle must compile in
  ```

  Then drive it: `datadrop serve --db /tmp/dd.db`, push a timeseries, open
  <http://localhost:8080/ui/>, and check that the x-axis reads as clock times,
  that the live toggle moves the row count, and that adding a `summarize` step
  makes the encoding dropdowns offer only the group key and the aggregate.

### Technical details

Verified against a real server with 120 sensor readings and a 40-row dataset:

```
GET /v1/drops/lab/streams        -> temps, sequence 120, 120 events
GET /v1/drops/lab/table          -> 12 fields, 3 of them data.*, types q/n/t
                                    with inferred_from = envelope | values
GET .../census/versions/1/table  -> station_id (n, schema), value "001" intact
                                    column order station_id, population preserved
```

The summarize pipeline's group means, checked against an independent Python
computation over the same CSV:

```
east 46820.8   north 41651.3   south 50000.2   west 53324.9   (both agree)
```
