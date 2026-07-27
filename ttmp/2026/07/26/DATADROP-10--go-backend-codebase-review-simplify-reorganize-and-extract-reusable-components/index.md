---
Title: 'Go backend codebase review: simplify, reorganize, and extract reusable components'
Ticket: DATADROP-10
Status: review
Topics:
    - backend
    - design
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Go-side codebase review covering current architecture, correctness and security findings, reusable component boundaries, and a phased no-legacy refactoring plan.
LastUpdated: 2026-07-26T16:58:18.593132837-04:00
WhatFor: Navigate the DATADROP-10 Go backend review and its implementation recommendations.
WhenToUse: Before planning or reviewing Go backend refactors; the web-side review is a separate follow-up.
---


# Go backend codebase review: simplify, reorganize, and extract reusable components

## Overview

DATADROP-10 reviews the Go half of `go-go-datadrop` as a current system rather than as a sequence of MVP tickets. It maps event, dataset, content, schema, streaming, authentication, authorization, client, CLI, and embedded-UI adapter behavior; identifies concrete correctness and security defects; and proposes a smaller modular-monolith architecture that assumes hard cutovers are allowed.

The report intentionally does not inspect React/TypeScript/PBUI implementation under `ui/`. That is the second review step.

## Key Links

- [Go backend architecture review and hard-cutover refactoring guide](design-doc/01-go-backend-architecture-review-and-hard-cutover-refactoring-guide.md) — primary 10,000-word intern-oriented report, issue inventory, target design, and implementation phases.
- [Investigation diary](reference/01-investigation-diary.md) — commands, evidence, failures, and chronological decisions.
- [Tasks](tasks.md) — delivery checklist.
- [Changelog](changelog.md) — ticket updates.

## Status

Current status: **review** — analysis, docmgr validation, and reMarkable delivery are complete.

## Topics

- backend
- design

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- `design-doc/` — architecture review and implementation guide
- `reference/` — chronological investigation diary
- `tasks.md` — tracked deliverables
- `changelog.md` — ticket history
