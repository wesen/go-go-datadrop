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
