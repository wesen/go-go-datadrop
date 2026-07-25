---
Title: 'PBUI shell: presentation-based workbench and atomic design system with Storybook'
Ticket: DATADROP-4
Status: active
Topics:
    - frontend
    - pbui
    - clim
    - grammar-of-graphics
    - design-system
    - storybook
    - atomic-design
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-24T23:56:03.264770865-04:00
WhatFor: ""
WhenToUse: ""
---

# PBUI shell: presentation-based workbench and atomic design system with Storybook

## Overview

DATADROP-3 shipped a working visualization workbench: a server-side typed table
projection (`pkg/tabular`), three new endpoints, an embedded SPA (`pkg/webui`),
and a complete grammar-of-graphics engine in the browser (`ui/src/model/`) ported
from the `pbui-gog` prototype.

What it did **not** ship is the prototype's other half: the *interaction* model.
`pbui-gog.jsx` is a CLIM / Genera "Dynamic Windows" style presentation-based user
interface, in which every visible thing is a typed live object with a menu of
verbs, any command can pause and accept an argument by pointing at it anywhere on
screen, and a chart is an editable composition rather than a picture.

This ticket turns that prototype into the real UI:

- a **PBUI core** — presentations, a type registry, the accept protocol, object
  menus, and the mouse documentation line;
- a **window manager** — split-tree tiles, workspaces, drag-to-dock, with tiles
  as views over shared documents;
- **multiple chart documents**, snapshots, compare and a trace;
- and a proper **atoms / molecules / organisms design system with Storybook**,
  replacing the flat `ui/src/components/` directory and the prototype's inline
  styles.

The engine (`ui/src/model/`) does not change. It is pure, React-free, and tested,
and it is the part of the system a bad afternoon cannot silently break.

## Key Links

- **Design guide**: [design/01-pbui-shell-analysis-design-and-implementation-guide.md](./design/01-pbui-shell-analysis-design-and-implementation-guide.md)
  — the full analysis, design and implementation guide. Read it before writing code.
- **Reference artifact**: `/home/manuel/code/wesen/2026-03-29--serve-claude-experiments/imports/pbui-gog.jsx`
  (2 772 lines; line ranges mapped in guide §3)
- **Preceding ticket**: DATADROP-3 — the table endpoints, `pkg/webui`, and the
  grammar-of-graphics engine this ticket builds a shell around.
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- frontend
- pbui
- clim
- grammar-of-graphics
- design-system
- storybook
- atomic-design

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
