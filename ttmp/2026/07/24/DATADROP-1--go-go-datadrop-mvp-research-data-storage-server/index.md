---
Title: 'go-go-datadrop MVP: research data storage server'
Ticket: DATADROP-1
Status: active
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
Summary: "Scope and implement the first MVP for go-go-datadrop, a self-hostable CLI-first research-data storage server, starting from the OpenDrop design documents and the tinyidp-opendrop reference slice."
LastUpdated: 2026-07-24
WhatFor: "Decide v0.1 scope and build the first runnable datadrop server."
WhenToUse: "Read before implementing; update as scope or decisions change."
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
- `reference/01-investigation-diary.md` — how the sources were retrieved and scope decided.
- `sources/` — imported ChatGPT artifacts (see `sources/README.md`).
- `tasks.md` — MVP task breakdown.
- `changelog.md` — recent changes.

## Key decisions (proposed)

- **DR-1:** Standalone `datadrop` binary in this repo (not a TinyIDP overlay). Reference slice reused for patterns.
- **DR-2:** SQLite only for v0.1 (pure-Go `modernc.org/sqlite`).
- **DR-3:** Bearer token auth for v0.1; DPoP + browser sessions deferred to v0.2.
- **DR-4:** Adopt a minimal CloudEvents-style event envelope.

See `design/01-mvp-design.md` §6 for full decision records.

## Status

Current status: **active**. Sources imported; v0.1 design drafted; implementation
not started.

## Topics

- backend
- server
- mvp

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.
