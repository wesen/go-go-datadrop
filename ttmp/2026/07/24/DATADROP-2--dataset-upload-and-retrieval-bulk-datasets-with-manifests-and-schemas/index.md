---
Title: 'Dataset upload and retrieval: bulk datasets with manifests and schemas'
Ticket: DATADROP-2
Status: active
Topics:
    - backend
    - server
    - design
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-24T13:54:04.801254116-04:00
WhatFor: ""
WhenToUse: ""
---

# Dataset upload and retrieval: bulk datasets with manifests and schemas

## Overview

<!-- Provide a brief overview of the ticket, its goals, and current status -->

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- backend
- server
- design

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

## Documents in this ticket

- `design/01-intern-implementation-guide.md` — **start here.** Full specification: why datasets are not streams, the five design commitments, the content-addressed blob store, data model, manifest, the three-phase upload protocol, retrieval, materialization, HTTP/CLI references, package plan, and review checklist.
- `reference/01-implementation-diary.md` — chronological implementation record.
- `tasks.md` — the eleven-task breakdown from guide §13.2.
- `changelog.md` — recent changes.

## Relationship to DATADROP-1

v0.1 (DATADROP-1) stores events: small JSON payloads appended one at a time,
capped at a 1 MiB body. This ticket adds the object that model cannot express —
a large, finite, immutable body of data with a manifest and schema attached —
and a bridge that materializes dataset rows into v0.1 streams with full
provenance.

