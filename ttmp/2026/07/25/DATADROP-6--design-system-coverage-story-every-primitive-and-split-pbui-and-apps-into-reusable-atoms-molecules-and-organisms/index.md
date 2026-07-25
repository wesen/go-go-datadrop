---
Title: 'Design system coverage: story every primitive, and split pbui and apps into reusable atoms, molecules and organisms'
Ticket: DATADROP-6
Status: review
Topics:
    - design-system
    - storybook
    - atomic-design
    - frontend
    - refactor
    - coverage
    - pbui
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ui/src/components
      Note: the design system as it stands — 24 component directories, 2 of them with a story
    - Path: repo://ui/src/apps
      Note: 3 528 lines holding the primitives this ticket extracts
    - Path: repo://ui/test/layers.test.ts
      Note: the enforced dependency graph; DR-33 changes exactly one edge in it
    - Path: repo://ui/src/apps/registry.ts
      Note: the 49-line contract whose location forces the organisms-to-apps edge
    - Path: repo://ui/src/styles/tokens.css
      Note: the whole visual vocabulary, and the reason a wrong 8px is visible here
    - Path: repo://ui/src/pbui/parts.ts
      Note: the data-part contract, and the policy that keeps it short
    - Path: repo://AGENT.md
      Note: gained the standing diary-and-commit rule while this ticket was being written
ExternalSources:
    - https://bradfrost.com/blog/post/atomic-web-design/
    - https://storybook.js.org/docs/writing-stories/play-function
    - https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
Summary: "Raises the workbench from 24 component directories and 5 stories to 57 components each with a story, by extracting the primitives currently inlined across 3 528 lines of application code. Modelled on the rag-evaluation-site package and adapted to datadrop's presentation-based architecture."
LastUpdated: 2026-07-25T15:45:00.000000000-04:00
WhatFor: "Finishing a design system that stopped halfway, and making the finished state enforceable rather than aspirational."
WhenToUse: "Before writing any component under ui/src/components, and before adding UI to any application."
---

# Design system coverage: story every primitive, and split pbui and apps into reusable atoms, molecules and organisms

## Overview

DATADROP-4 built a design system and DATADROP-5 built on top of it. What the
two of them left is a system with a strong foundation, a strong protocol, and a
missing middle.

The measurements are in guide §7 and every one is reproducible:

- **24 component directories**, of which **2 have a story**.
- Nine of the eleven atoms are *presentation* chips — field, source, doc, user,
  token, role. There is **no button, no input, no select, no checkbox**.
- The application layer absorbed the gap: **42 hand-written `<button>`
  elements, 14 `<input>`, 9 `<select>`, 80 inline style objects** across 3 528
  lines.
- **Six copies of the same button style constant.** They are identical except
  for `fontSize` — three use 9.5px, three use 10.5px. *The drift has already
  happened*, on screen, unintentionally. That is the argument for this ticket in
  one line.
- **Four character-identical text-input style literals**, all four written
  during DATADROP-5 within hours of each other by one author. Duplication needs
  only that there be nothing to import.

This ticket does two things, and it matters that they are two:

1. **Decomposition** — extract the primitives currently written inline into
   `atoms`, `molecules` and `organisms`, so they exist once and are named.
2. **Coverage** — every public component gets a story, with a required state
   list per layer.

Coverage is downstream of decomposition. You cannot write a story for nine lines
of JSX in the middle of a 491-line application file.

The return, stated concretely: the three UI defects DATADROP-5 shipped —
identity-provider prose in token mode, an empty heading for the root principal,
"you are a admin" — are each a *state* of a component, each expensive to reach
by clicking, each two lines of props in a story. **Storybook catches exactly the
defects manual testing does not.**

## Structure reference

Modelled on
`/home/manuel/workspaces/2026-07-13/rag-eval-ttc/rag-evaluation-system/packages/rag-evaluation-site`
(116 components, 127 story files). We adopt its layer split, its folder layout,
its Storybook title prefixes and its required-state list. We deliberately do
**not** adopt its Widget IR layer, its palette provider or its publishing
apparatus — guide §11 says why for each.

## Note for anyone reading AGENT.md

`AGENT.md` says to use bootstrap CSS for web applications. It has been otherwise
indicated for this application since DATADROP-4, and DR-13's reasoning is
restated in guide §4: the entire visual language is 137 lines of tokens, and
that is what lets fifteen tiles fit on a screen and stay readable.

## Key Links

- **Design guide**: [design/01-design-system-coverage-and-decomposition-analysis-design-and-implementation-guide.md](./design/01-design-system-coverage-and-decomposition-analysis-design-and-implementation-guide.md)
  — 1 745 lines in four parts. §7 is the evidence and the acceptance criteria.
  §12 and §16 are the two sections to read twice.
- **Diary**: [reference/01-diary.md](./reference/01-diary.md)
- **Preceding tickets**: DATADROP-4 (the shell and the design system this ticket
  finishes), DATADROP-5 (the four account applications that supplied most of the
  duplication).
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## The decisions, in brief

Full statements with alternatives and costs are in guide §22.

| | |
|---|---|
| DR-32 | Coverage follows decomposition, not the reverse |
| DR-33 | `apps/registry.ts` moves to `src/appkit/`; the `organisms -> apps` edge is deleted |
| DR-34 | `PARTS` stays small; new components get `data-testid`, not `data-part` |
| DR-35 | Coverage is a test, not a checklist |
| DR-36 | Raw form elements outside `atoms/` are a test failure |
| DR-37 | No Widget IR, no palette provider, no publishing apparatus |
| DR-38 | Extracted components never wrap themselves in `Presentation` |
| DR-39 | `ui/GUIDELINES.md` becomes the single home for UI policy |

## Status

Current status: **review**

## Topics

- design-system
- storybook
- atomic-design
- frontend
- refactor
- coverage
- pbui

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
