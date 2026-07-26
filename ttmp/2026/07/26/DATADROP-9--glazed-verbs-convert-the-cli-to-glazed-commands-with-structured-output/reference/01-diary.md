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
    - Path: repo://cmd/datadrop/main.go
      Note: Names the group registrars; the inverted edge that avoids an import cycle (commit fe5523f)
    - Path: repo://cmd/datadrop/tree_test.go
      Note: Assembles the real tree; caught the dataset import --format/--output clash (commit 34b9ce4)
    - Path: repo://pkg/cli/build.go
      Note: BuildCobraCommand and AddCommands; the one place the parser config is decided (commit fe5523f)
    - Path: repo://pkg/cli/drops/list.go
      Note: The shape every other verb file copies (commit fe5523f)
    - Path: repo://pkg/cli/events/export.go
      Note: The WriterCommand that keeps --format server-side (commit 55e8b67)
    - Path: repo://pkg/cli/events/range.go
      Note: StreamFlag; why --stream became --drop-stream (commit 55e8b67)
    - Path: repo://pkg/cli/events/tail.go
      Note: The streaming default and the two rounds it took to find it (commit 55e8b67)
    - Path: repo://pkg/cli/exit.go
      Note: ExitOn and WithExitCodes, the local workaround for glazed issue 611 (commit 62e53d4)
    - Path: repo://pkg/cli/exit_test.go
      Note: Pins every documented exit code, the prefix, and the two pass-through errors (commit c759e77)
    - Path: repo://pkg/cli/fields.go
      Note: DropStreamField, ReadSpec and HumanBytes, shared by four packages (commit 34b9ce4)
    - Path: repo://pkg/cli/rows.go
      Note: One projection per response type; event payloads flattened through tabular.FromEvents (commit 62e53d4)
    - Path: repo://pkg/cli/rows_test.go
      Note: Pins the row key sets; verified by breaking it (commit 62e53d4)
    - Path: repo://pkg/cli/section.go
      Note: The client section; --token is TypeSecret so --print-parsed-fields redacts it (commit 62e53d4)
    - Path: repo://pkg/cli/serve.go
      Note: BareCommand; built without the DATADROP_ prefix so DATADROP_ADDR cannot become a listen address (commit 34b9ce4)
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

## Step 2: One verb end to end — `list`, and the token leak

`datadrop list` is the smallest command that returns a set and it already had a
table, so the before/after is directly comparable and every wiring question —
section attachment, parser config, short help, `--print-schema`, env loading —
gets answered once on a command small enough to throw away. It now renders a
Glazed table by default and accepts `--output json|csv|yaml|markdown|excel`,
`--fields`, `--sort-by`, `--jq`, `--select` and the rest, none of which is
datadrop code. The other eleven verbs are untouched and both styles sit on one
root without trouble (DR-84).

The phase's real deliverable is the answer to the security question the guide's
§19 flags: **`--print-parsed-fields` leaks a `fields.TypeString` token in full,
and redacts a `fields.TypeSecret` one.** I built the binary both ways and ran
it. Phase 1 had already chosen `TypeSecret` from reading `RedactValue`; this is
the same conclusion arrived at from the outside, with the output pasted below.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** (see Step 1) — this step is phase 2 of the
DATADROP-9 half.

**Inferred user intent:** (see Step 1)

**Commit (code):** `fe5523f` — "DATADROP-9 phase 2: convert 'list', and settle the wiring"

### What I did

- Added `pkg/cli/build.go`: `AppName`, `Builder`, `BuildCobraCommand`,
  `AddCommands`, `Registrar`.
- Added `pkg/cli/drops/list.go` (the `ListCommand`) and `pkg/cli/drops/root.go`
  (`Register`).
- Changed `NewRootCmd` and `Execute` to take `...Registrar`, removed
  `newListCmd` from the root's command list, and named `drops.Register` in
  `cmd/datadrop/main.go`.
- Ran the converted verb against a real server in tmux on port 18099 and
  exercised default/json/csv/sort-by/select/`--print-parsed-fields`/`--help`/
  `--print-schema`/`--addr` override.
- `GOWORK=off go test ./cmd/... ./pkg/cli/... -count=1` — green, 26s.

### Why

Doing `list` alone rather than all of `drops/` means the first commit that
changes user-visible behaviour changes one verb, and the smoke test that
asserts on it (`smoke_test.go:218`, "list does not include the drop") is a
one-line check that a table still satisfies.

`build.go` exists so that the choice of parser config is made once. The guide's
§14.2 puts the config inline in every group's `Register`, which is four copies
of `AppName: "datadrop"` and four chances to omit it — and omitting it silently
disables `DATADROP_ADDR`.

### What worked

- Everything the guide's §11 transcript promises, verbatim, on the first run.
  `--fields name,created_at` with `--output csv`, `--sort-by name`,
  `--select name`, `--output json`.
- `ShortHelpSections: []string{schema.DefaultSlug, ClientSectionSlug}` produces
  exactly the wanted help: a "How to reach the datadrop server" block with
  `--addr` and `--token` and nothing else, plus a pointer to `--long-help`.
- The env source. `DATADROP_ADDR` reaches the section, and
  `--addr http://127.0.0.1:1` on the command line beats it — visible in the
  parse log below, which shows `defaults` then `env` then the flag.
- Coexistence. The root still carries persistent `--addr`, `--token` and
  `--output` for the eleven unconverted verbs; a converted verb's local flags
  shadow them and nothing warns or breaks.

### What didn't work

- **The design guide's `pkg/cli/section.go` snippet is unsafe.** It declares
  `token` as `fields.TypeString`. Built that way and run with
  `DATADROP_TOKEN=smoke-token-abcdef`:

  ```
  $ datadrop list --print-parsed-fields
    token:
      log:
        - source: defaults
          value: ""
        - metadata:
            env_key: DATADROP_TOKEN
            parsed-strings:
              - smoke-token-abcdef
          source: env
          value: smoke-token-abcdef
      value: smoke-token-abcdef
  ```

  The secret appears three times and the environment variable it came from is
  named. With `fields.TypeSecret`, the same command, same environment:

  ```
    token:
      log:
        - source: defaults
          value: '***'
        - metadata:
            env_key: DA***EN
            parsed-strings:
              - sm***ef
          source: env
          value: sm***ef
      value: sm***ef
  ```

  Note that the redaction is applied to the *metadata* as well, which is why
  `env_key` reads `DA***EN` — over-redaction, harmless, and a small hint that
  the mechanism is blunt rather than targeted.

- **`--print-schema` reports `"properties": {}`.** `list` declares no fields of
  its own outside its sections, and `Description().ToJsonSchema()` does not walk
  the attached sections, so the schema names the command and nothing else. Not a
  blocker and not something this ticket can fix from the outside; recorded so
  the next reader does not think they wired the sections wrong.

- **`DATADROP_TOKEN=wrong datadrop list` exits 0**, not 3. That is the server
  being permissive about listing rather than the exit mapping failing — an
  unauthenticated principal sees an empty list. `query` is the verb
  `TestExitCodes` uses for the 3 case, and it is not converted yet. Recorded so
  it is not mistaken for evidence that the mapping works.

### What I learned

- The glazed cobra parser attaches the command-settings section itself, so
  `--print-schema`, `--print-yaml` and `--print-parsed-fields` appear on every
  converted verb whether or not the constructor asks for them. That is why the
  token question is not optional for any verb carrying a credential: there is no
  "just don't add the section" escape.
- `ShortHelpSections` is an annotation (`cmd.Annotations["shortHelpSections"]`),
  read by the help renderer that `help_cmd.SetupCobraRootCommand` installs. It
  works only because this repository already wires glazed's help system at the
  root.

### What was tricky to build

**The import cycle the guide's file layout implies.** DR-82 puts the verbs in
`pkg/cli/drops`, `pkg/cli/events` and so on, and §14.1 has those files call
`ddcli.NewClientSection()` and `ddcli.RowForEnvelope` — so the group packages
import `pkg/cli`. But §13 also leaves `NewRootCmd` in `pkg/cli/root.go`
attaching the groups, which means `pkg/cli` imports the groups. That is a cycle,
and Go would have rejected it at the first build of phase 2.

The symptom would have been `import cycle not allowed`; I saw it coming while
reading rather than from the compiler. Three ways out were available: put the
scaffolding in a third leaf package (renames the phase-1 files the ticket names
explicitly), flatten the verbs back into `pkg/cli` (drops DR-82), or invert the
edge. I inverted it: `NewRootCmd(registrars ...Registrar)` and `Execute` take
the group registrars as arguments, and `cmd/datadrop/main.go` names them. The
group `Register(root *cobra.Command) error` signature the guide specifies is
unchanged; only the caller moved. `help_cmd.SetupCobraRootCommand` still runs
after every subcommand is attached, because the registrar loop is inside
`NewRootCmd` and before the help wiring.

### What warrants a second pair of eyes

- **The inverted registration.** `cmd/datadrop/main.go` now lists the groups.
  It is one more place to forget a group when adding one, and the failure mode
  is a verb that silently does not exist. A `TestEveryVerbIsRegistered` would
  close it; phase 5 is the honest moment to write it, once the list is final.
- **Three persistent root flags are live but shadowed** during the transition.
  `datadrop --output json list` (flag before the verb) sets the *root's*
  `--output`, which `list` no longer reads, and prints a table. It is a
  transient wrong-looking thing that phase 6 removes with `output.go`.

### What should be done in the future

- Delete the root's persistent `--addr`, `--token` and `--output` when the last
  old-style verb goes (phase 6).

### Code review instructions

- `pkg/cli/build.go` first: it is where the parser config is decided for all
  nineteen verbs.
- Then `pkg/cli/drops/list.go`, which is the shape every other verb file copies.
- Validate: `GOWORK=off go test ./cmd/... ./pkg/cli/... -count=1`, then run a
  server and `datadrop list --output csv --fields name,created_at`.
- To check the token question yourself, flip `fields.TypeSecret` to
  `fields.TypeString` in `pkg/cli/section.go`, rebuild, and run
  `DATADROP_TOKEN=hunter2000 datadrop list --print-parsed-fields`.

### Technical details

The `list` before/after, from the run:

```
$ datadrop list
+------------+--------------------------+-----------+-------------+----------+-----------+
| name       | created_at               | retention | public_read | owner_id | your_role |
+------------+--------------------------+-----------+-------------+----------+-----------+
| greenhouse | 2026-07-26T22:30:53.183Z |           | false       |          | admin     |
| sensors    | 2026-07-26T22:30:53.214Z | 30d       | false       |          | admin     |
+------------+--------------------------+-----------+-------------+----------+-----------+

$ datadrop list --output csv --fields name,created_at
name,created_at
greenhouse,2026-07-26T22:30:53.183Z
sensors,2026-07-26T22:30:53.214Z

$ datadrop list --select name
greenhouse
sensors
```

`datadrop list --help`, showing that the short help is short:

```
  ## Flags:
        -h, --help    help for list
       --long-help    Show long help

  ## How to reach the datadrop server:
            --addr    datadrop server base URL [$DATADROP_ADDR] - <string>
                      (default "http://localhost:8080")
           --token    bearer token [$DATADROP_TOKEN] - <secret>

  Use datadrop list --help --long-help for information about all flags.
```

The `<secret>` in that last line is the same `TypeSecret` declaration doing its
other job: `fields/cobra.go:385` redacts a sensitive flag's *default* in the
help text, so a token supplied by a config file cannot be read out of `--help`
either.

## Step 3: The reading verbs, and two things the guide got wrong

`query`, `tail`, `inspect` and `whoami` are Glaze commands now; `export` is a
Writer command. Doing them in one phase is what makes the `--format` versus
`--output` distinction concrete instead of theoretical — they sit in one package
and the rule is checkable by reading it: `export` has `--format` and no
`--output`, everything else has `--output` and no `--format`, and a command with
both has been classified wrong.

The phase cost more than it should have because two things in the design guide
do not survive contact with glazed v1.3.8. The first is a flag-name collision on
`--stream` that the guide's own compatibility matrix lists as a *new* flag,
apparently without noticing datadrop already had one. The second is DR-80's fix
for the follow-that-prints-nothing, which does not work — and does not work
silently, twice, for two different reasons. Both are written up below with the
measurements.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** (see Step 1) — this step is phase 3.

**Inferred user intent:** (see Step 1)

**Commit (code):** `55e8b67` — "DATADROP-9 phase 3: the reading verbs"

### What I did

- Added `pkg/cli/events/` — `range.go` (the shared bounds), `query.go`,
  `tail.go`, `export.go`, `root.go`.
- Added `pkg/cli/drops/inspect.go`, rewrote `pkg/cli/whoami.go` as a
  `GlazeCommand` in package `cli`.
- Renamed the drop-stream flag from `--stream` to `--drop-stream`.
- Set `tail`'s output defaults to `stream: true` and `table-format: markdown`.
- Updated the assertions in `cmd/datadrop/smoke_test.go` and
  `dataset_smoke_test.go` that the conversion legitimately changed.
- Exercised every verb against a live server on port 18099, including a real
  `--follow` with concurrent pushes and a SIGINT.

### Why

`inspect` and `whoami` return one row rather than an indented object so that
`--output json` means the same thing on every verb. Before, `whoami` printed
prose, `inspect` printed an object and `list` printed an array, and a script had
to know which. `datadrop whoami --select user_id` is now a thing anyone can
type.

`export` stays bytes because the CLI never sees a record: it opens a response
body and copies it. The formatting is `pkg/tabular` on the server, which is also
what `curl` and the web UI get. The consistency shows up in the output — the CSV
export's header and `query`'s column list are now character-for-character the
same set, which is DR-83 paying off across two code paths that never call each
other.

### What worked

- The whole §11 transcript, on the first run: `--fields seq,time,data.temp_c`,
  `--output csv`, `--output excel --output-file`, `--jq`, `--select`.
- Exit codes already work through the phase-1 wrapper: `query` with a bad token
  exits 3 and `query nosuchdrop` exits 4, both with the `datadrop: ` prefix,
  with no per-verb code.
- `RowsForEnvelopes` as the single funnel. Every event in the package goes
  through `emitEvents` or `RowForEnvelope`, so the "two flatteners" failure mode
  (§19) is closed structurally rather than by discipline.

### What didn't work

- **`--stream` is already taken by glazed, and the collision takes down the
  whole binary.** datadrop's `--stream` (string: which stream within the drop)
  and glazed's `--stream` (bool: emit row at a time) cannot coexist. Built with
  the old name:

  ```
  $ datadrop query greenhouse
  datadrop: building the query command: Flag 'stream' (usage: stream within the
  drop - <string>) already exists
  ```

  Note *what* failed: not the query, the tree. `NewRootCmd` returns the error, so
  every verb including `serve` stops working. glazed's cannot be renamed or
  dropped — `schema.SectionOption` offers `WithPrefix`, `WithName`,
  `WithDescription`, `WithDefaults`, `WithFields` and `WithArguments`, none of
  which removes or renames an existing field, and the settings struct reads the
  field by its `glazed:"stream"` tag anyway. So datadrop's flag moved to
  `--drop-stream`. **This is a breaking CLI change the guide does not mention**;
  its §18 matrix lists `--stream` as one of the *new* flags glazed brings, which
  is only half true. The same audit turned up one more collision waiting in
  phase 5: `dataset push --flatten` versus glazed's `--flatten`.

- **DR-80's fix for `--follow` does not work. Round one:** set
  `stream: true` on the output section, exactly as the guide says. Ran
  `tail --follow`, pushed twice, waited three seconds: empty terminal. Every row
  arrived at once on SIGINT. The cause is that `SetupProcessorOutput` asks for a
  row formatter and **silently** falls back to the buffering table formatter
  when it cannot get one (`settings/glazed_section.go:582`), and
  `CreateRowOutputFormatter` refuses `output=table` at the default `ascii`
  table-format outright (`settings/settings_output.go:176`,
  `ErrorRowFormatUnsupported`) — an ASCII box cannot be drawn a row at a time
  because its column widths are a property of the whole set. So the flag was
  set, was read, and did nothing.

- **Round two:** `table-format: tsv`, which *is* row-capable. Still an empty
  terminal. The CSV and TSV row formatters write into an `encoding/csv.Writer`
  and only `Flush()` in `Close()` (`formatters/csv/csv.go:86`); `OutputRow`
  never flushes. The buffer had moved one layer down.

  Round three was a measurement rather than a guess — run `tail --follow` under
  each candidate, push once, and count bytes in the pipe after one second:

  ```
  [--output json --output-as-objects] bytes-while-live=58
  [--output json]                     bytes-while-live=38
  [--table-format markdown]           bytes-while-live=48
  [--output yaml]                     bytes-while-live=38
  [--table-format tsv]                bytes-while-live=0
  ```

  `tail` now defaults to `stream: true` **and** `table-format: markdown`, which
  streams, flushes, and reads as a live log.

- `--order sideways` now prints its message twice and with the wrong prefix:

  ```
  $ datadrop query greenhouse --order sideways
  Argument order has invalid choice sideways
  Error: Argument order has invalid choice sideways
  ```

  That is glazed's parse failure inside `cmd.Run` before any datadrop code runs
  (`cobra.go:50-55`: `Fprintln(os.Stderr, err)`, then `cmd.Help()`, then
  `cobra.CheckErr(err)`). The exit code is 1, which is what it was before, so
  the contract holds; the presentation does not. `ExitOn` cannot reach it. This
  is a cost of the workaround and is recorded in step 4.

### What I learned

- `settings.WithOutputSectionOptions(schema.WithDefaults(...))` does work — the
  defaults show up correctly under `--print-parsed-fields` — so a "the flag had
  no effect" symptom here is about what the *formatter* does with the value, not
  about whether the value arrived. Checking `--print-parsed-fields` first saved
  a round of debugging the wrong layer.
- glazed's cobra builder wires SIGINT/SIGTERM into the command context itself
  (`cobra.go:170-173`), and skips `cobra.CheckErr` when the error
  `errors.Is(err, context.Canceled)`. So `tail --follow` needed no signal
  handling of its own, and returning nil on a cancelled context is enough for
  exit 0. Verified: `kill -INT` on a following tail exits 0.

### What was tricky to build

**Making `--follow` visibly stream.** Covered above; the sharp edge is that
every layer fails *quietly*. The output section accepts a `stream` default that
the formatter ignores; the formatter selection falls back rather than erroring;
the TSV writer accepts rows and holds them. Three silent layers between "I set
the flag" and "nothing appears", and the symptom at the end — a blank terminal —
is identical to the perfectly ordinary situation of a drop with no new events.
The way out was to stop reading and start measuring: byte counts in the pipe,
one second after a known push, for each candidate format.

**The `reverse` then `follow` cursor hand-off.** `tail` fetches the newest page
descending, emits it ascending, and must resume the SSE cursor from the *last
emitted* row rather than the last fetched one, or the first live event repeats.
That was already right in the old code and is preserved; the test for it is
watching a `--follow` and checking that the boundary row does not appear twice,
which it does not.

### What warrants a second pair of eyes

- **`--drop-stream` is a breaking rename.** Anyone using a non-default stream
  has a script to update. The help string says "was --stream before v0.2" and
  phase 6 documents it, but there is no alias. Adding one is possible (a hidden
  duplicate flag copied into the section before parse) and was deliberately not
  done, because a silently-working old name is how a rename never finishes.
- **`tail`'s default output changed shape**, from a boxed table to markdown
  rows. It is the only verb whose default rendering is not the ASCII table.
- **`whoami` on an anonymous credential returns a row with
  `authenticated=false` and exits 0**, where the old command printed prose
  advice about setting `DATADROP_TOKEN`. The advice is gone. That may be a
  regression in helpfulness worth restoring as a stderr note.

### What should be done in the future

- Decide whether `--drop-stream` deserves a deprecation alias.
- The `dataset push --flatten` collision lands in phase 5; the same rename
  question applies.

### Code review instructions

- `pkg/cli/events/tail.go`, the comment above `NewTailCommand`, is the densest
  thing in this phase and explains both failed rounds.
- `pkg/cli/events/range.go`, the comment above `StreamFlag`, explains the
  rename.
- Validate the streaming claim by hand: start a server, run
  `datadrop tail X --follow` in one shell and `datadrop push X n=1` in another;
  rows must appear immediately. Then repeat with `--table-format ascii` and
  watch it hang, which is the behaviour the help warns about.
- `GOWORK=off go test ./cmd/... ./pkg/cli/... -count=1`.

### Technical details

`query` and `export` agreeing on columns, which is DR-83's whole argument, in
two commands that share no code path:

```
$ datadrop query greenhouse --output csv
id,drop,stream,seq,time,received_at,source,type,subject,data.humidity,data.location.lat,data.temperature

$ datadrop export greenhouse --format csv
id,drop,stream,seq,time,received_at,source,type,subject,data.humidity,data.location.lat,data.temperature
```

A live `tail --follow` with the new defaults, captured while the process was
still running:

```
| time | data.temperature |
| --- | --- |
| 2026-07-26T22:41:13.259Z | 31.5 |
| 2026-07-26T22:41:51.141Z | 40.1 |
exit after SIGINT = 0
```

Exit codes through the phase-1 wrapper, with no code in the verbs:

```
bad token    -> 3 : datadrop: Unauthorized: a valid credential is required
missing drop -> 4 : datadrop: NotFound: drop "nosuchdrop" does not exist
```

## Step 4: The exit-code contract, and what the workaround costs

The mapping was already in place — phase 1 chose to apply it once per command
with a wrapper rather than thread `exitOn` through every `return err` — so this
phase is the proof rather than the fix. It adds `pkg/cli/exit_test.go`, which
pins every documented status, the behaviour through `errors.Wrap`, the message
prefix, and the two errors that must pass through untouched; and it verifies
`TestExitCodes` by breaking the thing it guards.

This is also the place to write down what the approach costs, because it is a
workaround for an upstream defect and someone will eventually want to remove
it. The short version: errors now leave a datadrop command by calling
`os.Exit`, which means deferred cleanup in a verb body does not run on the
error path, an in-process test cannot exercise that path without the
`exitFunc` stub, and one class of error — a flag parse failure — is still
reported by glazed with cobra's own prefix because nothing datadrop owns runs
before it.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** (see Step 1) — this step is phase 4.

**Inferred user intent:** (see Step 1)

**Commit (code):** `c759e77` — "DATADROP-9 phase 4: pin the exit-code contract"

### What I did

- Added `pkg/cli/exit_test.go`: nine status cases, a doubly-wrapped 404, the
  prefix, `context.Canceled`, `*cmds.ExitWithoutGlazeError`, nil, and a check
  that `WithExitCodes` actually wraps rather than falling through its type
  switch.
- Broke `BuildCobraCommand` by removing `WithExitCodes`, ran `TestExitCodes`,
  recorded the output, restored, re-ran.

### Why

`exit.go` is the file most likely to be deleted by a future reader — it exists
only because of an upstream defect, and it looks like ceremony. A test that
fails loudly when it goes is the only thing that makes deleting it a decision
rather than an accident.

### The approach, and its cost

**Chosen:** map the error and call `os.Exit` from inside the command, applied
by a wrapper (`WithExitCodes`) at registration so no verb can forget it. The
design guide's DR-77 proposes the same `exitOn` helper but threads it through
every error site; the wrapper is the same mechanism placed once instead of
sixty times, and it closes the guide's own §19 failure mode ("any verb whose
error path returns `err` instead of `exitOn(err)` loses the mapping for that
verb alone, which is worse than losing it everywhere because it looks like it
works").

**Rejected: forking glazed's builder.** `NewCobraCommandFromCommandDescription`,
`NewCobraParserFromSections`, `parser.Parse`, `SetupTableProcessor`,
`SetupProcessorOutput` and `HandleCommandSettings` are all exported, so a local
60-line `buildCobraCommand` using `RunE` instead of `Run` is achievable and
would keep `Execute()` as the single place that maps errors — including for
flag parse failures. It was rejected because it duplicates glazed internals
that will drift, and because the ticket says not to wait on upstream, not to
reimplement it.

**Rejected: waiting for https://github.com/go-go-golems/glazed/issues/611.**
A `WithExitCodeFunc` option on `commandBuildConfig` is the right fix and is
about thirty lines upstream. Instructed not to send a PR.

**What it costs, concretely:**

1. **Deferred cleanup in a verb body does not run on the error path.** `os.Exit`
   skips `defer`. No converted verb currently holds a resource that matters
   (`export` defers `body.Close()` on a process that is exiting anyway), but
   this is a real constraint on future verbs and is not obvious from reading
   one.
2. **In-process tests cannot call the error path** without the `exitFunc` /
   `errSink` indirection, which exists only for the tests. That is test-only
   machinery in production code.
3. **Flag parse errors keep cobra's presentation.** They happen in glazed's
   `cmd.Run` before any datadrop code, and produce the message twice with the
   wrong prefix:

   ```
   $ datadrop query greenhouse --order sideways
   Argument order has invalid choice sideways
   Error: Argument order has invalid choice sideways
   ```

   The exit code is 1, which is what it was before the conversion, so the
   documented contract is intact. Only the presentation is inconsistent, and
   only for this class.
4. **`ExitOn` is one call away from being bypassed.** A verb registered without
   `BuildCobraCommand` — by calling glazed's builder directly — silently loses
   the mapping. `AddCommands` is the only registration path today and
   `TestExitCodes` covers two verbs, not all of them.

**Prefix decision:** `datadrop: `, everywhere datadrop controls. `ErrorPrefix`
is a constant used by both `ExitOn` and `Execute()`, so the two paths cannot
drift. Cobra's `Error: ` survives only in case 3 above.

### What worked

- The break reproduced both predicted symptoms at once, which is a better guard
  than I expected: the code collapsing to 1 *and* the prefix changing are
  visible in the same failure output, so a reader who breaks it learns the whole
  problem rather than half of it.
- `errors.As` through two `errors.Wrap` layers works, which matters because
  every API error crosses at least one wrap on its way out of `pkg/client`.

### What didn't work

- Nothing failed unexpectedly in this phase. The one thing worth recording as a
  near-miss: `TestExitCodes`'s "strict schema rejection exits 5" case passed
  during the break, because `push` is not converted until phase 5 and was still
  on the old cobra path where `Execute()` maps the error. So the break test was
  only a two-thirds break; the 5 case becomes load-bearing after phase 5, and I
  re-ran the whole suite then.

### What I learned

- `cobra.CheckErr`'s output is `Error: <msg>` on stderr followed by
  `os.Exit(1)`; there is no way to reach it, because glazed calls it from
  inside the closure it assigns to `cmd.Run`. The error genuinely never exists
  outside that function.
- glazed *does* special-case two errors before `CheckErr`:
  `*cmds.ExitWithoutGlazeError` (exit 0) and, in glaze mode only,
  `errors.Is(err, context.Canceled)` (skip the check entirely). `ExitOn` has to
  let both through unchanged or it breaks `tail --follow`.

### What was tricky to build

**Making `ExitOn` testable without making it lie.** A function whose job is to
call `os.Exit` cannot be tested in-process. The indirection is two package-level
variables (`exitFunc`, `errSink`) that production code never reassigns, and the
test swaps and restores them under `t.Cleanup`. The alternative — splitting the
mapping from the exiting and testing only the mapping — was rejected because the
interesting bugs are in the *dispatch* (does a cancelled context exit? does
`ExitWithoutGlazeError` get returned rather than swallowed?), not in the
`switch` over status codes.

### What warrants a second pair of eyes

- **`exitFunc` and `errSink` are package-level mutable state.** Two tests
  mutating them in parallel would interfere. They are not `t.Parallel()` today
  and the `t.Cleanup` restore is correct, but it is a footgun.
- **Cost 4 above** — the bypass — is the one I would most want a second reader
  to think about. A `TestEveryCommandIsWrapped` walking the built cobra tree is
  possible; phase 5 adds a related guard for the client section, and the same
  walk could carry this.

### What should be done in the future

- Delete `exit.go`, `exit_test.go` and the `WithExitCodes` call when
  glazed grows an exit-code hook (issue 611), and move the mapping back into
  `Execute()` where it was.

### Code review instructions

- Read the top comment of `pkg/cli/exit.go` first; it quotes the upstream code
  that forces the design.
- `GOWORK=off go test ./pkg/cli/ -run 'TestExitOn|TestWithExitCodes' -count=1`
  for the fast proof, `GOWORK=off go test ./cmd/datadrop/ -run TestExitCodes
  -count=1` for the end-to-end one.
- To satisfy yourself the guard is real, delete `WithExitCodes(` from
  `pkg/cli/build.go` line 40 and run the second command.

### Technical details

The verbatim break, and it is worth reading for the two distinct symptoms:

```
$ GOWORK=off go test ./cmd/datadrop/ -count=1 -run TestExitCodes
--- FAIL: TestExitCodes (5.09s)
    --- FAIL: TestExitCodes/bad_credentials_exit_3 (0.08s)
        smoke_test.go:321: exit code = 1, want 3
            stdout:
            stderr: Error: Unauthorized: a valid credential is required
    --- FAIL: TestExitCodes/unknown_drop_exits_4 (0.10s)
        smoke_test.go:321: exit code = 1, want 4
            stdout:
            stderr: Error: NotFound: drop "nosuchdrop" does not exist
FAIL
FAIL	github.com/go-go-golems/go-go-datadrop/cmd/datadrop	5.142s
```

The break applied was one line in `pkg/cli/build.go`:

```go
 	cobraCmd, err := cli.BuildCobraCommandFromCommand(
-		WithExitCodes(command),
+		command, // BREAK: WithExitCodes removed
```

## Step 5: The remaining fourteen verbs, and three guard tests that earned their keep

This is the mechanical phase — `create`, `push`, `schema put/show`, the seven
`dataset` verbs, `serve` and `healthcheck` — and it was mechanical, except for
one design hazard that only showed up because `serve` stopped being a plain
cobra command, and three new guard tests that found real defects the moment they
ran. `pkg/cli/read.go`, `push.go`, `dataset.go` and `output.go` are gone. Every
verb is a file named after it in a directory named after its group.

The guard tests are the part worth reading. `TestTheCommandSurfaceIsComplete`
and `TestNoVerbHasBothFormatAndOutput` both failed on their first run, and one
of the failures was a genuine design mistake rather than a typo.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** (see Step 1) — this step is phase 5.

**Inferred user intent:** (see Step 1)

**Commit (code):** `34b9ce4` — "DATADROP-9 phase 5: writes, datasets, serve and healthcheck"

### What I did

- `pkg/cli/drops/`: `create.go`, `push.go` (and moved `push_test.go` here).
- `pkg/cli/schemacmd/`: `root.go`, `put.go`, `show.go`.
- `pkg/cli/dataset/`: `root.go` plus `push`, `list`, `show`, `get`, `rm`,
  `import`, `gc`.
- Rewrote `pkg/cli/serve.go` and `pkg/cli/healthcheck.go` as BareCommands.
- Added `pkg/cli/fields.go` for the three things four packages share:
  `DropStreamFlag`/`DropStreamField`, `ReadSpec`, `HumanBytes`.
- Deleted `pkg/cli/read.go`, `push.go`, `dataset.go`, `output.go`.
- Added `cmd/datadrop/tree_test.go` and a `TestClientTokenIsASecret` in
  `pkg/cli/rows_test.go`.
- Ran all nineteen verbs against a live server, including exit code 5.

### Why

`fields.go` exists because seven verbs carry the drop-stream flag and three read
a document from a file-or-stdin. Copying either would have been the "two
flatteners" mistake in a different costume.

`tree_test.go` lives in `package main` because that is the only package that
imports every group — which is also precisely why a forgotten group is possible
at all. A test in `pkg/cli` cannot see the tree it does not import.

### What worked

- Everything ran on the first live pass: nineteen verbs, tables everywhere,
  `--select seq` on an NDJSON push emitting one sequence per line, `dataset get`
  writing files, `healthcheck` exiting 0 and 1.
- Exit code 5 through a converted `push`:
  `datadrop: SchemaValidationFailed: payload does not satisfy schema version 1`,
  exit 5. That closes the last of the three codes that phase 4's break test
  could only partially exercise.
- Eleven verbs that never had a table now have one, which is the ticket's
  headline and is visible in `dataset list`, `dataset show`, `schema show`,
  `dataset gc` and the rest.

### What didn't work

- **`TestNoVerbHasBothFormatAndOutput` failed, and it was right.**

  ```
  tree_test.go:163: these verbs have both --format and --output:
        dataset import
        help export
  ```

  `help export` is glazed's own help subcommand and is now exempted. `dataset
  import` was mine: its `--format` selects how `pkg/tabular` reads the dataset
  file's rows (csv or ndjson), and it sat next to `--output`, which selects how
  the result summary is rendered. Two flags that both read as "what shape is the
  data". Renamed to `--row-format`, which is also what the help text already
  said it was. This is the guide's own reviewer rule catching a verb I had
  written twenty minutes earlier.

- **`TestTokenFlagsAreSecret` failed on all eighteen verbs, and it was wrong.**

  ```
  tree_test.go:113: --token is not a secret on these verbs, so --print-parsed-fields will print it:
        create (--token is string)
        ... eighteen lines ...
  ```

  The premise was wrong, not the code. glazed registers `TypeString` and
  `TypeSecret` through the same `flagSet.String(...)` call
  (`fields/cobra.go:183`), so the cobra flag reports `string` either way; the
  distinction exists only in the field definition. The test was rewritten as
  `TestClientTokenIsASecret` in `pkg/cli/rows_test.go`, asserting
  `token.Type.IsSensitive()` on the section itself — which is the layer where
  the property actually lives, and which combined with
  `TestEveryClientVerbHasTheClientSection` covers the same ground.

- **`TestTableAndUIEndToEnd` failed on the `--stream` rename**, and the failure
  is worth recording because it is the rename's worst case:

  ```
  [push lab --stdin --stream temps] exited 1
  stderr: datadrop: --stdin cannot be combined with key=value arguments
  ```

  `--stream` still *exists* — it is glazed's boolean now — so `--stream temps`
  parses as `--stream=true` plus a positional `temps`, and the error the user
  sees is about something else entirely. An old script does not get "unknown
  flag"; it gets a confusing message or, worse on a verb without that check,
  silently wrong behaviour. That is a real cost of the rename and belongs in the
  release note.

### What I learned

- **`serve --addr` and `DATADROP_ADDR` mean opposite things, and the section
  machinery would have connected them.** `DATADROP_ADDR` is the client's "which
  server do I talk to"; `serve --addr` is "which socket do I bind". With
  `AppName: "datadrop"` on the parser config, glazed's env source maps
  `DATADROP_ADDR` onto any field named `addr` — so a developer with the ordinary
  client environment exported would find `datadrop serve` trying to listen on
  `http://localhost:8080`. Before this ticket, cobra's flag shadowing hid it:
  serve's local `--addr` simply won over the root's persistent one, and the env
  fallback lived on the root's flag. The fix is `buildOperatorCommand`, which
  builds `serve` and `healthcheck` with no `AppName` at all; their own
  fallbacks (`DATADROP_AUTH`, `DATADROP_OIDC_*`, `DATADROP_HEALTH_URL`) stay in
  the field defaults via `envOr`, where they read the variable each verb
  actually means.
- `time.Duration` is not one of the field types, so `--session-lifetime` and
  `--timeout` are strings parsed in `Run`. The parse error names the flag, which
  is as good as what pflag's duration flag gives.

### What was tricky to build

**Deciding whether `dataset import --format` had to move.** Two forced renames
were already in the ticket, and a third that was merely *desirable* is the kind
of thing that turns a conversion into a redesign. What settled it: the guide
states "a command with both flags is a command that has been classified wrong"
as a rule a reviewer applies, and `dataset import` is correctly classified — it
returns a summary record and is a GlazeCommand. So either the rule needed an
exception with a paragraph explaining it, or the flag needed a better name. The
flag's own help text already said "row format", the flag is normally inferred
from the filename and rarely typed, and `--row-format` makes the rule hold with
no exception to remember. Renamed.

**Converting `serve` without changing what it does.** It has eighteen flags,
six of them with environment fallbacks and two of them durations, and its
`resolveAuth` refuses to start on a misconfiguration that would fail open —
which is the most safety-relevant code in the repository. The conversion was
done as a mechanical field-by-field transliteration with the body untouched, and
the `serveOptions` struct became `serveSettings` with `glazed` tags so that the
diff on `runServe` and `resolveAuth` is only the field names.

### What warrants a second pair of eyes

- **`serve`'s env handling.** The `buildOperatorCommand` split is correct as far
  as I can test it, but it is a negative property — "this verb does *not* read
  these variables" — and no test asserts it. Worth adding.
- **Three breaking flag renames** in one release: `--stream` → `--drop-stream`,
  `--flatten` → `--flatten-paths`, `--format` → `--row-format` (on `dataset
  import` only; `export --format` is unchanged). The first two were forced; the
  third was chosen.
- **`push` now emits a row per event.** For an NDJSON push of ten thousand
  lines that is ten thousand rows on stdout where there used to be one summary
  line on stderr. `--output json > /dev/null` or `--select seq` is the answer,
  but the default changed for a verb people run in loops.
- **`dataset show` without `--version` emits one row per version** where it used
  to emit one nested object containing all of them. That is more useful and it
  is a shape change.

### What should be done in the future

- A test that `serve` ignores `DATADROP_ADDR`.
- Consider whether `push` should default to `--output none`-ish behaviour for
  bulk stdin pushes.

### Code review instructions

- Start with `cmd/datadrop/tree_test.go`: it is the shortest description of the
  whole surface and of the two invariants that hold across it.
- Then `pkg/cli/build.go`, `buildOperatorCommand`, for the env hazard.
- Then `pkg/cli/serve.go`, diffing `runServe`/`resolveAuth` against the previous
  revision — they should differ only in field names.
- `GOWORK=off go test ./... -count=1`. The only failure should be
  `pkg/tabular`'s `TestWriteLiveProjectionFixture`, which is pre-existing and
  belongs to `ui/` (see step 1).

### Technical details

The full surface after the conversion, as `TestTheCommandSurfaceIsComplete`
pins it:

```
create, dataset gc, dataset get, dataset import, dataset list, dataset push,
dataset rm, dataset show, export, healthcheck, inspect, list, push, query,
schema put, schema show, serve, tail, whoami
```

Eleven of those never had a table before. `dataset list` now:

```
+------------+----------+--------------------------+----------+----------------+--------------+--------------+
| drop       | name     | created_at               | versions | latest_version | latest_files | latest_bytes |
+------------+----------+--------------------------+----------+----------------+--------------+--------------+
| greenhouse | readings | 2026-07-26T22:58:28.565Z | 1        | 1              | 1            | 12           |
+------------+----------+--------------------------+----------+----------------+--------------+--------------+
```

An NDJSON push reporting every sequence it allocated, which was not expressible
before:

```
$ printf '{"t":1}\n{"t":2}\n' | datadrop push greenhouse --stdin --ndjson --select seq
pushed 2 events        # stderr
2                      # stdout
3
```

The last of the three exit codes, now through a converted verb:

```
$ datadrop push strictdrop temperature=warm ; echo $?
datadrop: SchemaValidationFailed: payload does not satisfy schema version 1
5
```
