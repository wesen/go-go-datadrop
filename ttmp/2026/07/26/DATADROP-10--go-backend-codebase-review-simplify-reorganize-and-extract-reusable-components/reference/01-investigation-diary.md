---
Title: Investigation diary
Ticket: DATADROP-10
Status: review
Topics:
    - backend
    - design
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://AGENT.md
      Note: Repository constraints and mandatory diary/compatibility guidance used during the review
    - Path: repo://README.md
      Note: Current product scope, API narrative, and stale unenforced retention promise
    - Path: repo://go.mod
      Note: Go toolchain and dependency surface reviewed
    - Path: repo://ttmp/2026/07/26/DATADROP-9--glazed-verbs-convert-the-cli-to-glazed-commands-with-structured-output/design/01-rows-instead-of-renderers-analysis-design-and-implementation-guide-for-converting-the-datadrop-cli-to-glazed-commands.md
      Note: Existing CLI refactor design reconciled with the no-legacy hard-cut premise
ExternalSources: []
Summary: Chronological evidence, commands, failures, and decisions from the Go backend architecture review.
LastUpdated: 2026-07-26T16:58:48.481785545-04:00
WhatFor: Understand how the DATADROP-10 review was performed and continue it without repeating discovery work.
WhenToUse: When reviewing the report, validating its evidence, or starting the later web-side review.
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

## Step 2: Trace the critical flows and separate defects from complexity

This step followed event append/query/SSE, staged dataset publication, import, authentication, authorization, account responses, and CLI/client calls through production code and tests. The result changed the review from a package-shape critique into a prioritized correctness assessment: descending pagination, audit atomicity, strict import, authorization scope drift, identity-field exposure, the missing email-lookup rate limit, and blob GC coordination all have concrete behavioral consequences.

The review also identified components that should not be rewritten merely because they are sophisticated. The bounded live hub, streaming content-addressed filesystem store, schema compiler/cache, and row readers have clear invariants and strong tests. The proposed design keeps those mechanics while moving product orchestration out of HTTP handlers.

### Prompt Context

**User prompt (verbatim):** (same as Step 1)

**Assistant interpretation:** Perform the evidence-backed Go review deeply enough to distinguish necessary protocol/security complexity from accidental layering and compatibility complexity.

**Inferred user intent:** Produce a refactor plan that makes the code smaller and clearer without deleting the properties that keep research data durable, attributable, and resumable.

### What I did

- Read current production files across `pkg/server`, `pkg/store`, `pkg/auth`, `pkg/blob`, `pkg/schema`, `pkg/stream`, `pkg/tabular`, `pkg/client`, `pkg/cli`, and `pkg/webui`.
- Read the current DATADROP-9 Glazed conversion guide and the prior v0.1/v0.2 intern guides to distinguish original intent from current behavior.
- Counted 41 routes, 293 rough exported declarations, 481 transitive command dependencies, and a 56 MiB binary.
- Ran `GOWORK=off go test ./... -count=1` and `GOWORK=off go vet ./...`; both passed.
- Ran `GOWORK=off golangci-lint run ./...`; it reported `0 issues`.
- Located modernc SQLite's exported `*sqlite.Error.Code()` API, proving store constraint errors need not be classified by message strings.
- Wrote the full intern-oriented review/design guide with current-state diagrams, 22 findings, API sketches, six decision records, seven implementation phases, and a test strategy.

### Why

- A cleanup plan based only on line counts would incorrectly flatten legitimate durability and security design into “overengineering.”
- Runtime traces expose cross-layer invariants—transaction then publish, filesystem then metadata, role plus scope—that package inventories alone cannot show.
- Prior ticket guides explain why some complexity exists, but current source behavior is the evidence for whether those promises are actually met.

### What worked

- Ordinary tests, vet, and GolangCI-Lint all passed, establishing a green baseline.
- Existing tests are particularly strong in `store`, `server`, `schema`, `stream`, and `tabular`.
- Source and prior design guides agreed on several load-bearing choices: transactional sequence reservation, post-commit live publication, bounded subscriber eviction, invisible drafts, immutable committed versions, and streamed blob publication.
- The hard-cutover premise allowed the target design to delete inferred auth modes, retention-without-enforcement, cursor overloading, ingest shape heuristics, store compatibility aliases, and accidental public APIs.

### What didn't work

- `GOWORK=off staticcheck ./...` failed because the installed binary is older than the module toolchain:

  `module requires at least go1.26.1, but Staticcheck was built with go1.25.3 (compile)`

- `GOWORK=off go test ./pkg/... -cover -count=1` ran coverage for feature packages but failed the empty top-level `pkg` package with repeated messages such as:

  `compile: version "go1.26.1" does not match go tool version "go1.25.5"`

  The feature package coverage results were still printed, but the command exited 1. The report treats this as toolchain reproducibility evidence, not as a failed unit-test result.

- The earlier Python JSON aggregation failure from Step 1 was not retried because the ordinary test output already provided package-level pass/fail and timing data without another custom parser.

### What I learned

- `next_after` is directionally invalid for descending history: a second request selects `seq >` the lowest row from page one and repeats newer rows.
- Event/dataset writes generally audit transactionally, but account, token, session, drop, and membership writes often do not.
- The pure authorization functions are sound; SQL/application call sites drift by loading whole ACLs, ignoring token scopes in list visibility, and annotating role as though it were capability.
- The user persistence entity is also a wire entity, which is why OIDC identifiers escape account/member endpoints.
- Comments claim email lookup is rate-limited and durably audited, but neither control exists.
- The staged dataset design is conceptually sound but needs one application owner for draft, blob-reference, mount, GC, and reconciliation lifecycle.

### What was tricky to build

- The review had to reason across two transactional systems—SQLite and the filesystem—where no atomic commit spans both. The proposed target does not pretend a database transaction can solve that; it adds one lifecycle owner, in-process coordination for the current deployment, and reconciliation.
- The one-connection SQLite choice is both a simplifying invariant and a throughput ceiling. The report avoids prescribing a read pool before removing known N+1 queries and one-row import transactions, then requires benchmarks.
- Prior DATADROP-9 intentionally proposes a temporary NDJSON compatibility path, while this ticket explicitly permits hard cutovers. The report preserves DATADROP-9's useful Glazed analysis but removes its compatibility shim from this ticket's recommendation.

### What warrants a second pair of eyes

- Validate the descending cursor defect against intended public semantics before choosing exact `before`/`after` field names.
- Review the identity leak and missing lookup controls as security findings, especially whether OIDC issuer is considered public deployment metadata but subject is not.
- Review the proposed content lifecycle lock: it is sufficient only for the current single-process deployment and must not be mistaken for distributed coordination.
- Decide whether structured CloudEvents ingestion and synchronous dataset import are current product requirements or removable features.

### What should be done in the future

- Implement Phase 0 tests first so refactoring cannot erase evidence of the current defects.
- Use the later web-side review to map every frontend call onto the new `pkg/api` hard-cut contract; do not preserve current backend DTOs just to defer frontend changes.

### Code review instructions

- Start with the report's Executive Summary and Findings 1–11, then verify each claim in the linked function/file.
- For architecture, compare the current package graph in Part I with the target graph in Part III.
- Re-run `GOWORK=off go test ./... -count=1`, `GOWORK=off go vet ./...`, and `GOWORK=off golangci-lint run ./...`.
- Treat staticcheck and coverage failures as tool-version issues until tools are rebuilt consistently with Go 1.26.1.

### Technical details

Key baseline measurements:

```text
Go lines under cmd/ + pkg/: 23,320
HTTP routes:                 41
Exported declarations:      approximately 293
Command transitive deps:     481
Binary size:                 56 MiB
Ordinary tests/vet/lint:      pass/pass/0 issues
```

## Step 3: Validate and deliver the review

This step completed ticket hygiene and delivered the report as one reMarkable bundle. The bundle contains the ticket overview, the full architecture review, and this investigation diary, so a reader can move from conclusions to evidence without locating separate documents.

Docmgr frontmatter validation and ticket doctor both passed cleanly. The required dry run showed the exact three inputs and destination before the real upload; the real command returned the explicit `OK: uploaded` confirmation.

### Prompt Context

**User prompt (verbatim):** (same as Step 1)

**Assistant interpretation:** Store the completed review in a healthy docmgr ticket and deliver it to the requested reMarkable destination.

**Inferred user intent:** Make the review available as a durable, readable artifact outside the working tree, with enough validation evidence to trust the handoff.

### What I did

- Updated the ticket index with scope, status, and direct links to the report and diary.
- Related seven primary source files to the design document and four instruction/context files to the diary, using absolute paths.
- Checked the first four ticket tasks and updated the changelog.
- Ran frontmatter validation on both authored documents.
- Ran `docmgr doctor --ticket DATADROP-10 --stale-after 30`.
- Performed a dry-run bundle upload with `--toc-depth 2`.
- Uploaded the real bundle to `/ai/2026/07/26/DATADROP-10`.

### Why

- The ticket should be navigable without knowing generated path conventions.
- Relations and changelog entries let future file-based searches recover the review.
- A bundle gives the reMarkable reader one PDF and one table of contents rather than three unrelated documents.

### What worked

- Both frontmatter checks returned `Frontmatter OK`.
- Doctor returned `✅ All checks passed`.
- Dry run included `index.md`, the design guide, and the diary at the intended destination.
- The real upload returned:

  `OK: uploaded DATADROP-10 Go Backend Codebase Review.pdf -> /ai/2026/07/26/DATADROP-10`

### What didn't work

- N/A. The dry run and real upload both succeeded on the first attempt.

### What I learned

- The final report is 1,918 lines and approximately 10,418 words; bundling it with a depth-two table of contents is important for reMarkable navigation.
- Routine cloud listing is unnecessary after the uploader's explicit success confirmation.

### What was tricky to build

- The upload workflow skills differ on routine preflight: the ticket-delivery workflow requires a dry run, while the focused reMarkable skill minimizes calls. The stricter ticket guardrail was followed, resulting in exactly two calls: one dry run and one real upload.

### What warrants a second pair of eyes

- Review PDF diagram rendering on-device if Mermaid blocks are not rendered graphically by the current Pandoc layout; the surrounding prose and text diagrams remain complete even if Mermaid is shown as code.

### What should be done in the future

- The web-side follow-up should create or extend a separate ticket and link back to DATADROP-10's API hard-cutover section.

### Code review instructions

- Open the ticket index, follow the design guide link, and verify docmgr health with `docmgr doctor --ticket DATADROP-10 --stale-after 30`.
- The delivered artifact is `DATADROP-10 Go Backend Codebase Review.pdf` under `/ai/2026/07/26/DATADROP-10`.

### Technical details

```text
Bundle inputs:
  index.md
  design-doc/01-go-backend-architecture-review-and-hard-cutover-refactoring-guide.md
  reference/01-investigation-diary.md

Remote destination:
  /ai/2026/07/26/DATADROP-10
```
