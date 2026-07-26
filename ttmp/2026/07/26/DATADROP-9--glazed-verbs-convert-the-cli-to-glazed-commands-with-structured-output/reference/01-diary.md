---
Title: Diary
Ticket: DATADROP-9
Status: active
Topics:
    - cli
    - glazed
    - backend
    - output
    - refactor
    - architecture
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://pkg/cli/exit.go
      Note: ExitOn and WithExitCodes, the local workaround for glazed issue 611 (commit 62e53d4)
    - Path: repo://pkg/cli/rows.go
      Note: One projection per response type; event payloads flattened through tabular.FromEvents (commit 62e53d4)
    - Path: repo://pkg/cli/rows_test.go
      Note: Pins the row key sets; verified by breaking it (commit 62e53d4)
    - Path: repo://pkg/cli/section.go
      Note: The client section; --token is TypeSecret so --print-parsed-fields redacts it (commit 62e53d4)
    - Path: repo://pkg/client/me.go
      Note: Typed /v1/me response so whoami errors map like every other verb (commit 62e53d4)
ExternalSources: []
Summary: Implementation diary for converting datadrop's nineteen CLI verbs to Glazed commands — the scaffolding, the one-verb spike, the reading verbs, the exit-code workaround around glazed issue 611, the writes and datasets, and the deletion of pkg/cli/output.go.
LastUpdated: 2026-07-26T18:20:14-04:00
WhatFor: Recording what was tried, what failed, and why each decision was made while implementing DATADROP-9.
WhenToUse: Read before continuing DATADROP-9, before touching pkg/cli/exit.go, and when the upstream glazed exit-code hook lands and the workaround can be removed.
---


# Diary

## Goal

Capture the implementation of DATADROP-9 — turning every datadrop CLI verb into
a Glazed command with structured output — step by step, including the failures,
so that the next person hitting the same walls does not have to rediscover them.

## Step 1: The scaffolding — client section, exit helper, row projections

The ticket's six phases all consume the same four pieces, so this step builds
them and wires them to nothing: the client section that replaces the persistent
`--addr`/`--token` flags, the exit-code helper that works around glazed's
unconditional `cobra.CheckErr`, the one-projection-per-response-type row shapes,
and the test that pins those shapes. Nothing about the CLI changes for a user
yet; `go build ./...` and the full test suite are green and every existing verb
still runs the old cobra path.

Two decisions were made here that the design guide left open or got slightly
wrong, and both are worth reading before phase 2. The first is that `--token`
must be `fields.TypeSecret` rather than the `fields.TypeString` the guide's §6
snippet shows, because that is the *only* thing standing between
`--print-parsed-fields` and a bearer token printed in full alongside the
environment variable it came from. The second is that the exit-code mapping is
applied once per command at registration by a wrapper, rather than threaded
through every `return err` as the guide's DR-77 describes — the guide's own §19
lists "any verb whose error path returns `err` instead of `exitOn(err)`" as a
failure mode, and a wrapper makes that mistake unrepresentable.

### Prompt Context

**User prompt (verbatim):** "close 1 - 7. Do DATADROP 8 and 9 which I think can be done in parallel?"

**Assistant interpretation:** Close out tickets DATADROP-1 through DATADROP-7,
then implement DATADROP-8 and DATADROP-9 concurrently, since their file sets
(the `ui/` frontend for DATADROP-8, the Go `pkg/`+`cmd/` backend for
DATADROP-9) do not overlap. This diary covers the DATADROP-9 half.

**Inferred user intent:** Get the accumulated ticket backlog cleared and the two
independent remaining pieces of work done in one pass rather than serially,
using two agents on one shared checkout.

**Commit (code):** `62e53d4` — "DATADROP-9 phase 1: the scaffolding for Glazed verbs"

### What I did

- Read `AGENT.md`, the 1128-line design guide
  (`design/01-rows-instead-of-renderers-...md`), and loaded the
  `glazed-command-authoring` and `diary` skills.
- Verified the upstream obstacle myself against the version `go.mod` actually
  pins (`glazed v1.3.8`, read from
  `~/go/pkg/mod/github.com/go-go-golems/glazed@v1.3.8`) rather than against the
  local checkout at `/home/manuel/code/wesen/corporate-headquarters/glazed`,
  which is `v1.2.7-34-g58e0bd0` and therefore *older* than what is built.
- Added `pkg/cli/section.go`: `ClientSectionSlug`, `ClientSettings`,
  `NewClientSection`, `ClientFrom`, `ClientSettingsFrom`.
- Added `pkg/cli/exit.go`: the five exit-code constants and `exitCodeFor` moved
  out of `root.go`, plus `ExitOn`, `ErrorPrefix`, and `WithExitCodes` with its
  three interface wrappers.
- Added `pkg/cli/rows.go`: thirteen projection functions, all of them exported
  because the verb files will live in subpackages.
- Added `pkg/client/me.go`: `Me`, `MeUser`, `MeProvider` and `(*Client).Whoami`,
  so `whoami` stops hand-rolling an `http.Request` and its failures become
  `*client.APIError` like every other verb's.
- Added `pkg/cli/rows_test.go` and verified it by breaking it (below).
- `GOWORK=off gofmt -l`, `GOWORK=off go build ./...`,
  `GOWORK=off go test ./... -count=1 -short`.

### Why

The row shapes are the part worth arguing about before fifteen commands depend
on them, and the client section and exit helper are consumed by every one of
those fifteen. Doing them first means phase 2 answers wiring questions rather
than API-design questions.

`pkg/client/me.go` was not in the phase-1 list, but `RowForPrincipal` needs a
type to project and the guide names it `client.Me`. Building it here also fixes
something that was already wrong: `runWhoami` in `pkg/cli/whoami.go` built its
own request and returned `errors.Errorf("%s answered %s", …)` on a non-200, so
a 401 from `/v1/me` produced exit code 1 while a 401 from every other endpoint
produced 3.

### What worked

- `tabular.FromEvents` turned out to be reusable verbatim for the CLI's event
  rows. `RowsForEnvelopes` projects a whole page through it and reads the
  resulting `table.Fields` for ordering, which means the CLI's column names are
  *the same objects* as the workbench's, not a parallel implementation that
  agrees today. DR-83 asked for exactly this and it cost nine lines.
- The `WithExitCodes` wrapper compiles cleanly against all three glazed command
  interfaces, because each embeds `cmds.Command` and Go's embedding of an
  interface value forwards `Description()` and `ToYAML()` for free.
- Full suite green on the first run of `rows_test.go`.

### What didn't work

- **`pkg/tabular` fails at HEAD, before any of my changes.** Running the full
  suite surfaced:

  ```
  $ GOWORK=off go test ./... -count=1 -short
  --- FAIL: TestWriteLiveProjectionFixture (0.00s)
      fixture_test.go:94: the shared projection fixture is stale — the browser's live tail would now disagree with the server.
          Regenerate with:
            go test ./pkg/tabular -run TestWriteLiveProjectionFixture -update
  FAIL	github.com/go-go-golems/go-go-datadrop/pkg/tabular	0.027s
  ```

  This is **not** mine. `git diff --stat HEAD -- ui/test/fixtures/ pkg/tabular/`
  is empty, so both the fixture and the projection are exactly as committed. I
  regenerated it into a scratch copy to find the difference and it is entirely
  `json.MarshalIndent` array formatting:

  ```
  17c17,20
  <         "tags": ["a", "b"],
  ---
  >         "tags": [
  >           "a",
  >           "b"
  >         ],
  ```

  Go 1.26's encoder puts short arrays on one line; the committed fixture was
  written by an older one. The fix is one `-update` run, but the fixture lives
  at `ui/test/fixtures/envelope-projection.json`, which is inside DATADROP-8's
  file set and off-limits to me under `AGENT.md`'s
  `<parallelAgentGuidelines>`. I restored the file byte-for-byte and left it
  alone. **Reported rather than fixed.**

- First build failed on leftovers from moving the exit codes:

  ```
  # github.com/go-go-golems/go-go-datadrop/pkg/cli
  pkg/cli/root.go:11:2: "net/http" imported and not used
  pkg/cli/root.go:21:2: "github.com/go-go-golems/go-go-datadrop/pkg/client" imported and not used
  ```

  Trivial, but worth recording as the reason `root.go` appears in a "phase 1
  scaffolding" commit at all.

### What I learned

- **`--print-parsed-fields` leaks a `TypeString` token, and redacts a
  `TypeSecret` one.** This is the phase-2 security question, answered in phase 1
  because `section.go` is where it is decided. The chain is:
  `cli.HandleCommandSettings` → `cli.PrintParsedFields`
  (`glazed@v1.3.8/pkg/cli/helpers.go:100`) → `fields.ToSerializableFieldValue`
  (`fields/serialize.go:34`) → `fields.RedactValue(pp.Definition.Type, value)`.
  `RedactValue` returns the value **unchanged** unless `Type.IsSensitive()`, and
  `IsSensitive()` is true for exactly one type, `TypeSecret`
  (`fields/field-type.go:49`). The parse *log* is redacted by the same rule, so
  a `TypeString` token also discloses which source it came from and its value at
  each stage. Declared `TypeSecret`, the token renders as `sm***en` and its help
  default is redacted too (`fields/cobra.go:385`). The design guide's §6 snippet
  uses `fields.TypeString` for `token`; **that snippet is unsafe and I did not
  follow it.**
- The local glazed checkout is not the built glazed. `go.mod` pins v1.3.8;
  `/home/manuel/code/wesen/corporate-headquarters/glazed` is at
  `v1.2.7-34-g58e0bd0`. Reading the checkout to answer a "what does glazed do"
  question would have been reading older code.
- The glazed cobra parser adds the command-settings section itself when
  `SkipCommandSettingsSection` is false (`cobra-parser.go`, right after the
  middleware chain), so a verb does not need to attach
  `cli.NewCommandSettingsSection()` by hand the way the guide's §14.1 skeleton
  does.

### What was tricky to build

**Getting `meta` into the event row without inventing a second flattener.**
`tabular.FromEvents` deliberately drops `Envelope.Meta` — a chart has no use for
provenance — but `cmd/datadrop/dataset_smoke_test.go:252` reads
`events[0]["meta"]` to check that an imported row carries its dataset, version,
path and row number, and that is genuinely the most useful thing in the record.
Symptom if ignored: a passing test today and a silent loss of provenance in the
CLI's output. Passing `Envelope.Meta` through as `json.RawMessage` was the
obvious move and is wrong — a `json.RawMessage` is a `[]byte`, so a table cell
renders it as a byte slice and `--output json` base64-encodes it. The fix is
`decodeJSON`, which unmarshals into `any` so the table shows a map and the JSON
formatter emits a nested object; it is set only when the envelope actually has
meta, so the common case does not grow a permanently-empty column.

**Ordering across a page.** Projecting event-by-event gives row 1 three data
columns and row 2 four, in map-iteration order. `tabular` resolves the column
set over the whole sample precisely to avoid this, so `RowsForEnvelopes` takes a
slice and `RowForEnvelope` is the one-element special case rather than the other
way round. `TestRowsForEnvelopesShareColumns` pins it.

### What warrants a second pair of eyes

- **The key names themselves.** DR-79 makes them a contract with no versioning
  story (the guide's own open question 5). I chose the API's JSON spellings —
  `created_at` rather than the `created` the guide's §11 before/after transcript
  shows — on the grounds that a reader who knows the HTTP API should not have to
  learn a second vocabulary, and that `tabular` already emits `received_at`.
  If `created` is wanted, now is the cheap moment.
- **`RowForPrincipal` takes `server` as an argument** so that "which server did
  this answer come from" is in the row rather than in the reader's shell
  history. It means the projection is not a pure function of the response.
- **`ExitOn` swallows `context.Canceled`** and returns nil. That is right for
  `tail --follow` under Ctrl-C and would be wrong if a genuine cancellation ever
  needed to be reported as a failure.

### What should be done in the future

- Regenerate `ui/test/fixtures/envelope-projection.json` under Go 1.26 — one
  `-update` run, but it belongs to whoever owns `ui/`.
- Revisit `exit.go` when the upstream hook lands; see
  https://github.com/go-go-golems/glazed/issues/611.

### Code review instructions

- Start at `pkg/cli/section.go` and read the comment above `NewClientSection`
  about `fields.TypeSecret`; that is the security-relevant decision.
- Then `pkg/cli/exit.go`, top comment first — it quotes the glazed source that
  forces the design.
- Then `pkg/cli/rows.go`, `RowsForEnvelopes`, which is the DR-83 reuse.
- Validate with `GOWORK=off go test ./pkg/cli/ ./pkg/client/ -count=1`.
- To confirm the guard is real, rename `name` to `drop_name` in `RowForDrop`
  and re-run; the failure names both key lists.

### Technical details

The verification of the row-shape guard, verbatim. Break applied: `name` →
`drop_name` in `RowForDrop`, and a `seq` → `sequence` rename in the
`RowsForEnvelopes` copy loop.

```
$ GOWORK=off go test ./pkg/cli/ -count=1 -run 'TestRowForDropKeys|TestRowForEnvelopeKeys'
--- FAIL: TestRowForDropKeys (0.00s)
    rows_test.go:45: RowForDrop keys =
          drop_name,created_at,retention,public_read,owner_id,your_role
        want
          name,created_at,retention,public_read,owner_id,your_role
--- FAIL: TestRowForEnvelopeKeys (0.00s)
    rows_test.go:83: RowForEnvelope keys =
          id,drop,stream,sequence,time,received_at,source,type,subject,data.location.lat,data.temp_c
        want
          id,drop,stream,seq,time,received_at,source,type,subject,data.location.lat,data.temp_c
FAIL
FAIL	github.com/go-go-golems/go-go-datadrop/pkg/cli	0.030s
```

Both messages name the contract that moved and the one that was expected, which
is what a change detector has to do to be worth keeping. Restored, re-ran,
green.

The upstream obstacle, quoted from the version actually built
(`glazed@v1.3.8/pkg/cli/cobra.go`, lines 48 and 197-201):

```go
cmd.Run = func(cmd *cobra.Command, args []string) {
    ...
    err = runFunc(ctx, parsedValues)
    if _, ok := err.(*cmds.ExitWithoutGlazeError); ok {
        os.Exit(0)
    }
    cobra.CheckErr(err)
}
```

`cmd.Run`, not `cmd.RunE`. `cobra.CheckErr` prints `Error: <msg>` and calls
`os.Exit(1)`. The glaze-mode branch at line 176 is the same shape, with one
mercy: it skips `CheckErr` when `errors.Is(err, context.Canceled)`.
