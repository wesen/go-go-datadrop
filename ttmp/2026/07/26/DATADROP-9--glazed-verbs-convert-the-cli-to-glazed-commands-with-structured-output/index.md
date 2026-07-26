---
Title: 'Glazed verbs: convert the CLI to Glazed commands with structured output'
Ticket: DATADROP-9
Status: active
Topics:
    - cli
    - glazed
    - backend
    - output
    - refactor
    - architecture
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-26T15:22:26.173079352-04:00
WhatFor: ""
WhenToUse: ""
---

# Glazed verbs: convert the CLI to Glazed commands with structured output

## Overview

Turn the nineteen CLI verbs into Glazed commands. A Glazed command does not
render; it emits rows, and the output layer — `--output`, `--fields`, `--jq`,
`--sort-by`, `--template`, `--output-file` — belongs to the framework.

`pkg/cli/output.go` goes away. It is 162 lines: two `tabwriter` renderers, a
three-value `--output` flag, and a `renderJSON` whose whole body is "encode with
two-space indent" and which **eleven of the nineteen verbs call**. Those eleven
have no table output today at all — `datadrop dataset list mydrop` prints JSON
whether you asked for it or not, and `--output table` is accepted and ignored.

Follows DATADROP-8's predecessor work: glazed is already a dependency, the help
system is already wired, and logging already runs through the Glazed logging
section.

**Status: designed, not implemented.** Six phases in `tasks.md`.

### Read this first

`design/01-rows-instead-of-renderers-…md` — 1 115 lines, four parts, eleven
decision records (DR-74 … DR-84).

The classification is the design (DR-74): ask what a verb *produces*, not what
it is. Fifteen produce a set of records and become `GlazeCommand`s. One
produces a byte stream the server already formatted and stays a
`WriterCommand`. Three produce a side effect and stay `BareCommand`s.

### The three things that do not survive a naive conversion

- **The exit codes.** `ExitAuth=3`, `ExitNotFound=4`, `ExitValidation=5` are a
  documented contract that `cmd/datadrop/smoke_test.go:226` asserts. Glazed's
  cobra builder sets `cmd.Run` (not `RunE`) and ends with `cobra.CheckErr`,
  which exits **1** unconditionally and never returns the error to `Execute()`.
  There is no option to change it. DR-77 exits before returning; the better fix
  is a `WithExitCodeFunc` option upstream, which is a glazed PR and a different
  ticket.
- **`--output ndjson`.** There is no equivalent. `--output json
  --output-as-objects` is a stream of concatenated JSON values — `jq` reads it,
  `while read line` does not. DR-78 retires it loudly rather than mapping it
  onto something nearly the same.
- **`export`.** It never sees a record; it opens a response body and `io.Copy`s
  it. The formatting is the server's, in `pkg/tabular`, and it is the same code
  path `curl` and the web UI get. DR-75 keeps it a `WriterCommand`.

### The consistency win

DR-83: event payloads flatten into `data.*` columns by calling `pkg/tabular`,
which already does exactly this (`DataPrefix = "data."`). That projection is
what the server's `/table` endpoint returns and therefore what the web workbench
names — so `datadrop query --fields data.temp_c` and the field chip in the
browser become the same column rather than two that look alike.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- cli
- glazed
- backend
- output
- refactor
- architecture

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
