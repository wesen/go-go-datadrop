---
Title: 'Portable workspaces: stages, tile and workspace import/export, stored templates, and duplicable tiles'
Ticket: DATADROP-8
Status: active
Topics:
    - frontend
    - layout
    - workspaces
    - import-export
    - clipboard
    - pbui
    - architecture
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-26T13:56:34.559313911-04:00
WhatFor: ""
WhenToUse: ""
---

# Portable workspaces: stages, tile and workspace import/export, stored templates, and duplicable tiles

## Overview

Make the workbench's *arrangement* a first-class, portable object. A tile, a
workspace or a whole stage becomes a small JSON bundle that can be copied to
the clipboard, pasted into another browser or another account, and stored under
a name in a template library.

Five things were asked for, and they turn into six:

1. **Tile import / export to the clipboard.** Export writes a bundle; import
   opens a text area, prefilled from the clipboard when the clipboard holds a
   bundle of the right kind.
2. **The same four verbs for a workspace**, plus store and load.
3. **A "global workspace" layer** — named a **stage** here — which is the full
   view we have today, reachable from a control at the top right that also
   leads to account management and the template library.
4. **Per-stage and per-workspace application allow-lists.** A sign-in stage
   that offers only sign-in and help; a welcome stage that offers the tutorial.
5. **Duplicable and renamable tiles**, with singletons that a workspace may
   hold at most one of.
6. *(falls out)* **The `tile` and `workspace` presentation types finally get
   descriptors.** Both have been declared since DATADROP-4 and neither has ever
   had a menu — right-clicking a tile says "no verbs for this object yet", and
   the workspace strip has been advertising "R for duplicate / delete" for a
   feature that does not exist. Every action in items 1, 2 and 5 is a verb of
   one of those types, so the mechanism to deliver them already exists and is
   already wired.

**Status: designed, not implemented.** The design guide is complete and the
seven phases are in `tasks.md`. Nothing has been built.

### Read this first

`design/01-stages-bundles-and-the-clipboard-…md` — 2 607 lines, four parts,
sixteen decision records (DR-58 … DR-73). Part I orients; Part II is the
design; Part III is the file table, the API reference and the seven phases;
Part IV is the decision records, the failure modes, the open questions and a
glossary.

The three decisions to understand before writing any code:

- **DR-64 — ids do not travel.** A bundle carries documents by content and its
  leaves reference them by array index. The obvious implementation
  (`JSON.stringify(node)`) compiles, runs, produces a plausible bundle, and
  silently destroys the property that two tiles on one document stay in
  lockstep.
- **DR-67 — import never depends on `navigator.clipboard.readText`.** Firefox
  does not implement it for web content. The dialog is a focused text area; the
  prefill is an optimisation that is allowed to fail.
- **DR-61 — the effective application allow-list is the intersection** of the
  instance's, the stage's and the workspace's. It is the only composition in
  which adding a constraint cannot remove one.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- frontend
- layout
- workspaces
- import-export
- clipboard
- pbui
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
