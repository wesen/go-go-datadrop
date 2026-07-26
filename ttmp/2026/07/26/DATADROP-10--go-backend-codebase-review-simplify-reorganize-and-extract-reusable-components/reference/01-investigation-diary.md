---
Title: Investigation diary
Ticket: DATADROP-10
Status: active
Topics:
    - backend
    - design
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological evidence, commands, failures, and decisions from the Go backend architecture review."
LastUpdated: 2026-07-26T20:45:00Z
WhatFor: "Understand how the DATADROP-10 review was performed and continue it without repeating discovery work."
WhenToUse: "When reviewing the report, validating its evidence, or starting the later web-side review."
---

# Investigation diary

## Goal

Record the evidence-first review of the `go-go-datadrop` Go codebase: how the runtime and package boundaries were mapped, which complexity and obsolete assumptions were found, and how the proposed hard-cutover architecture was derived.

## Step 1: Create the ticket and establish the Go review surface

This step created DATADROP-10, limited the first review pass to the Go backend, and inventoried the repository before drawing conclusions. The inventory established a 23,320-line Go surface across domain, persistence, HTTP, client, CLI, authentication, blob, streaming, schema, tabular, and embedded-UI adapter packages.

The first pass also exposed an important review theme: the implementation has accumulated four product milestones while many comments and public compatibility aliases still describe “v0.1” or preserve pre-DATADROP-5 behavior. One attempted JSON test-summary pipeline failed because escaped newlines were passed literally to `python3 -c`; the failure is recorded rather than hidden, and the tests will be rerun with a simpler command.

### Prompt Context

**User prompt (verbatim):**

> Create a new docmgr ticket to do a review of the go-go-datadrop codebase. 
>
> Analyze @go-go-datadrop/ and what is too deprecated / overengineered / problematic / too complex for what it is. Also think hard about how things could be reorganized / extracted into reusable components / refactored for better clarity. We don't have any legacy uses so we can do hard cutovers for anything.
>
> . Start with the go side, we will do the web side in a second step.
>
>  Create  a detailed analysis / design / review report guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> [REMINDER] Output a <summary>...</summary> block at the VERY END of your response. This is mandatory.

**Assistant interpretation:** Create a new ticket, deeply audit only the Go side, document concrete simplification and reusable extraction opportunities without compatibility constraints, and deliver an intern-oriented technical report through docmgr and reMarkable.

**Inferred user intent:** Obtain an actionable architectural reset plan before more implementation compounds accidental complexity, while preserving enough system explanation that a new engineer can execute the refactor safely.

### What I did

- Created ticket `DATADROP-10` with one design document, one diary, and five review/delivery tasks.
- Read the repository instructions, README, module dependencies, domain model, server composition, persistence bootstrap, and CLI server composition.
- Inventoried all Go files and measured 23,320 lines across `cmd/` and `pkg/`.
- Enumerated package imports and 293 exported declarations to estimate API breadth.
- Searched for stale milestone language, unimplemented behavior, direct request parsing, goroutines, and whole-body reads.
- Ran `go list ./...` successfully.

### Why

- An architecture review needs a map of ownership and runtime flow before it can distinguish essential complexity from accidental complexity.
- The user explicitly allows hard cutovers, so compatibility code and stale public aliases must be evaluated as deletion candidates rather than treated as fixed constraints.

### What worked

- `docmgr` created a complete ticket workspace under `ttmp/2026/07/26/`.
- `go list ./...` found 14 buildable packages.
- File and import inventories made the two broad dependency hubs visible: `pkg/server` and `pkg/cli`.
- The stale “v0.1” narrative and explicit compatibility behavior were found in production files, not inferred from history alone.

### What didn't work

- This command failed while trying to aggregate `go test -json` output:

  `go test ./... -count=1 -json 2>&1 | python3 -c 'import json,sys,collections; ...'`

  Exact error:

  `SyntaxError: unexpected character after line continuation character`

  Cause: literal `\\n` escape sequences were passed to Python outside a string, so the one-line script was not valid Python. No test result can be inferred from this failed pipeline.

### What I learned

- The repository is not a small single-purpose ingest server anymore: it combines event streams, bulk datasets, content-addressed storage, table projection, user accounts, OIDC, authorization, a typed client, CLI rendering, and embedded frontend delivery.
- Several comments still describe unfinished “later MVP tasks” even though the named handlers are present, which makes source comments an unreliable guide unless checked against current code.
- The domain package imports the auth package, so the claimed “one leaf package” is not actually a leaf.

### What was tricky to build

- The review must separate legitimate product complexity (for example, resumable content-addressed uploads and OIDC security invariants) from code complexity caused by where that behavior lives. Counting files or lines alone would mislabel security-sensitive code as overengineering.
- Existing uncommitted changes are all under `ui/`. The Go-side review must not touch or accidentally stage those files.

### What warrants a second pair of eyes

- Verify whether all currently documented products—events, datasets, accounts, table projection, and embedded UI—remain in scope for the backend after the hard cutover. The report will assume yes while recommending clearer feature boundaries.
- Confirm whether public Go package compatibility matters at all, or whether “no legacy uses” permits moving most implementation under `internal/`.

### What should be done in the future

- The later web-side review should reuse the system boundary and API findings from this ticket but create its own issue inventory rather than mixing frontend conclusions into DATADROP-10.

### Code review instructions

- Start with `README.md`, `pkg/server/server.go`, `pkg/cli/serve.go`, and `pkg/store/store.go` to compare the stated product, HTTP composition, process composition, and persistence ownership.
- Validate the package surface with `GOWORK=off go list ./...` and rerun tests with `GOWORK=off go test ./... -count=1`.

### Technical details

Initial package flow:

```text
cmd/datadrop
    -> pkg/cli
       -> client (remote commands)
       -> server + store + blob + auth + webui (serve command)

server
    -> auth + store + blob + schema + stream + tabular + webui

store
    -> datadrop domain types + auth values + SQLite

client
    -> datadrop wire/domain types + net/http
```
