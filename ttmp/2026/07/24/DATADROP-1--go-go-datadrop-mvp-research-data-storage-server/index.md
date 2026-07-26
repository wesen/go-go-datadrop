---
Title: 'go-go-datadrop MVP: research data storage server'
Ticket: DATADROP-1
Status: complete
Topics:
    - backend
    - server
    - mvp
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources:
    - sources/opendrop-design.md
    - sources/opendrop-browser-pds-profile.md
    - sources/open-source-wolfram-datadrop-transcript.md
    - sources/opendrop-pod-mvp.zip
    - sources/tinyidp-opendrop-source.tar.gz
Summary: Scope and implement the first MVP for go-go-datadrop, a self-hostable CLI-first research-data storage server, starting from the OpenDrop design documents and the tinyidp-opendrop reference slice.
LastUpdated: 2026-07-26T18:15:52.774741761-04:00
WhatFor: Decide v0.1 scope and build the first runnable datadrop server.
WhenToUse: Read before implementing; update as scope or decisions change.
---


# go-go-datadrop MVP: research data storage server

## Overview

`go-go-datadrop` will be a self-hostable, CLI-first **programmable research data
inbox** inspired by Wolfram Data Drop. This ticket scopes and implements the
first MVP (v0.1): a single binary that accepts append-only event data over HTTP
and CLI, stores it durably in SQLite, validates it against JSON Schema, serves
latest/range queries, streams new events over SSE, and exports open formats.

The MVP design is grounded in the ChatGPT conversation **"Open Source Wolfram
Datadrop"** (created 2026-07-23), whose transcript, design documents, and a
working Go reference slice are imported under `sources/`.

## Source artifacts (read-only imports)

See `sources/README.md` for the full inventory. Key sources:

| Source | Role |
|---|---|
| `sources/opendrop-design.md` | Full design (events, schema, query, roadmap, acceptance) |
| `sources/opendrop-browser-pds-profile.md` | Browser-native PDS / DPoP profile (deferred to v0.2+) |
| `sources/open-source-wolfram-datadrop-transcript.md` | Full conversation |
| `sources/tinyidp-opendrop-source.tar.gz` | Reference slice on TinyIDP (storage/stream/DPoP patterns) |
| `sources/opendrop-pod-mvp.zip` | Standalone MVP pod |

## Documents in this ticket

- `design/01-mvp-design.md` — v0.1 scope, architecture, data model, decision records, phased plan.
- `design/02-intern-implementation-guide.md` — **start here to implement.** Full onboarding + specification: product rationale, conceptual model, the two reference implementations and the patterns to port, corrected data model, HTTP/CLI API reference, package-by-package pseudocode, review checklist, and the known inconsistencies between the ticket's own documents.
- `reference/01-investigation-diary.md` — how the sources were retrieved and scope decided.
- `reference/02-implementation-diary.md` — chronological implementation record; append a step per change.
- `sources/` — imported ChatGPT artifacts (see `sources/README.md`).
- `tasks.md` — MVP task breakdown.
- `changelog.md` — recent changes.

## Key decisions (accepted)

- **DR-1:** Standalone `datadrop` binary in this repo (not a TinyIDP overlay). Reference slice reused for patterns.
- **DR-2:** SQLite only for v0.1 (pure-Go `modernc.org/sqlite`).
- **DR-3:** Bearer token auth for v0.1; DPoP + browser sessions deferred to v0.2.
- **DR-4:** Adopt a minimal CloudEvents-style event envelope.

See `design/01-mvp-design.md` §6 for full decision records, and
`design/02-intern-implementation-guide.md` §16 for two documented deviations
adopted during implementation (an added `events.stream` column, and
`santhosh-tekuri/jsonschema/v6` in place of the draft-07-only `xeipuuv`).

## Status

Current status: **v0.1 complete**. All 14 tasks are done. The binary accepts
append-only events over HTTP and CLI, validates them against JSON Schema in
strict or permissive mode, serves latest-N/time-range/cursor queries, streams
live events over SSE with resumable cursors, exports CSV/NDJSON/JSON, gates
writes behind a bearer token, and records an audit log. Verified by 125 test
functions (148 including subtests) across all eight packages, including an
end-to-end CLI acceptance test, plus `golangci-lint` and `logcopter-check`
clean.

Deferred to later milestones, and documented as such: retention enforcement
(the field is stored but inert), the full `Idempotency-Key` ledger (v0.1 covers
same-ID replay only), an audit read endpoint, and everything in
`design/01-mvp-design.md` §2 "out of scope".

## Topics

- backend
- server
- mvp

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.
