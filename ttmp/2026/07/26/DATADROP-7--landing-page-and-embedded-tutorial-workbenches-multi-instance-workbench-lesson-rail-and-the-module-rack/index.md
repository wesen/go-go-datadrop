---
Title: 'Landing page and embedded tutorial workbenches: multi-instance workbench, lesson rail, and the module rack'
Ticket: DATADROP-7
Status: active
Topics:
    - frontend
    - landing-page
    - tutorial
    - pbui
    - architecture
    - embedding
    - storybook
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Embed multiple independent workbench instances in one scrolling page, with a lesson rail whose steps complete by observing world state. Removes seven singletons, splits the shell from the application, and adds a fixture data path so the page needs no server."
LastUpdated: 2026-07-26T11:21:21.962274679-04:00
WhatFor: ""
WhenToUse: ""
---

# Landing page and embedded tutorial workbenches: multi-instance workbench, lesson rail, and the module rack

## Overview

A prototype (`sources/pbui-landing.jsx`, 2 719 lines) embeds **five independent
copies of the whole workbench into one scrolling page** — each with its own
documents, tile layout, pipeline engine and accept protocol, sharing nothing.
Beside each sits a rail of lesson steps that tick themselves off by **watching
world state**, so any route to the goal counts, including routes the lesson
author never anticipated.

This ticket implements that in the real application. The work divides cleanly:

- **Phases 1–3 are architectural** and are worth landing on their own. They
  remove seven module-level singletons, split four application concerns out of
  the workbench shell, and add a fixture data path so a page can render charts
  with no server.
- **Phases 4–7 are the teaching layer**: fourteen new components, four lesson
  tracks, a module rack documenting all 21 registered applications, and the page
  that composes them.

### The finding that makes this tractable

Our workbench is **already instance-scoped everywhere that matters**. The store
is a factory (`ui/src/store/index.ts:45`), and across 246 source files there is
**exactly one runtime import of the store singleton** — line 9 of
`ui/src/main.tsx`. Every other file imports only `type RootState`.

```console
$ grep -rn 'from "[./]*store"' src .storybook test | grep -v 'import type'
src/main.tsx:9:import { store } from "./store";
```

Multi-instance embedding is therefore not a rewrite. It is the removal of seven
named singletons, each of which is one line.

### The seven singletons

| # | Singleton | File:line | Failure with five instances | DR |
|---|---|---|---|---|
| 1 | `export const store` | `store/index.ts:79` | none yet — but the wrong import works | DR-46 |
| 2 | persistence key | `store/persist.ts:20` | **silent**: the reader's real layout is overwritten by whichever tutorial section they last scrolled past | DR-47 |
| 3 | `height: 100vh` | `Workbench.module.css:5` | five viewport-height panels on a scrolling page | DR-51 |
| 4 | `?first=1` read | `Workbench.tsx:61` | five instances race for one query parameter; four discard their seeded layout | DR-52 |
| 5 | signed-out gate | `Workbench.tsx:41,52` | every embedded instance shows the sign-in tile to an anonymous visitor — which a landing page's visitor always is | DR-52 |
| 6 | data path | `useTable.ts:31` | the page needs a server, an account and a drop | DR-48 |
| 7 | seeded document | `store/index.ts:94` | correct behaviour, wrong place | DR-46 |

Four of the seven are in `Workbench.tsx`, and all four are *application*
concerns — routing, authentication, session — that ended up in the shell because
there was only ever one shell.

## What this ticket is not

- Not a rewrite of the pipeline, plot or presentation engines. Those are
  unchanged.
- Not a change to what an existing user sees. The tour is built at `/ui/tour`
  and the `/` → `/ui/` redirect is left alone; whether the landing page becomes
  the front door is a product decision this ticket does not make (guide §24).
- Not a port of the prototype's code. Roughly 60 % of that file re-derives
  things we already have and have already refactored better; guide §12 lists six
  things not to carry across.

## Decision records

| DR | Decision |
|---|---|
| DR-45 | One store per embedded workbench; the store is the instance boundary |
| DR-46 | `store/index.ts` exports the factory and nothing else |
| DR-47 | Persistence is a parameter; `null` means memory-only |
| DR-48 | Fixture data arrives through a `baseQuery`, not through components |
| DR-49 | Lesson predicates read `RootState`; there is no probe |
| DR-50 | A lesson completes by predicate, never by button press |
| DR-51 | The shell accepts its height; it does not declare one |
| DR-52 | `Workbench` splits into `WorkbenchShell` and the application |
| DR-53 | The registry stays global; the visible set is per instance |
| DR-54 | Lesson content is a layer (`tour/`), not a component |
| DR-55 | The rail renders inside the instance's `PbuiProvider` |
| DR-56 | Progress is not persisted; reset is remount |
| DR-57 | `WorkbenchInstance` lives in `components/pages/`, not `appkit` |

## Component inventory

Fourteen new components, each of which needs a story —
`ui/test/stories.test.ts` fails the build otherwise.

- **1 atom**: `Tick` (already exists open-coded at `apps/tutorials/Tutorial.tsx:56-73`)
- **6 molecules**: `LessonStep`, `PredictPrompt`, `HintList`, `GoalItem`,
  `ModuleCard`, `CheatCard`
- **3 organisms**: `LessonRail`, `BriefChecklist`, `ModuleRack`
- **4 page/appkit**: `WorkbenchInstance`, `WorkbenchShell`, `TourSection`,
  `LandingPage`

Five things the prototype has that we deliberately do **not** build: `Btn`,
`Sel`, `Num`, `TBtn` (we have the atoms), and `useNarrow` (a media query).

## Progress

**Phase 1 is done** (commit `4796da2`). The store is a factory and only a
factory; `persistKey` is a parameter defaulting to null; `test/instances.test.ts`
holds ten guards, two of them verified by breaking them. 187 tests pass.

Phase 1 also found two defects that one store could not reveal: `layoutSlice`'s
`initialState` is evaluated once at module load, so every unpreloaded store
began with the same workspace id; and the fallback layout was a single launcher
tile rather than `defaultSpaces()`, which means the shell's own Storybook story
had been rendering an empty workbench since it was written.

**The guide's largest open risk is settled** (DR-57). `appkit → components`
would not have failed `layers.test.ts` — the test does no cycle detection, it
checks declared edges — so the edge would have been accepted while leaving the
table asserting `appkit → pages` and `pages → appkit` at once.
`WorkbenchInstance` goes in `components/pages/` instead, needing no new edge.

That gap in `layers.test.ts` is real and is recorded in guide §27. It is not
fixed here: the one edge that would have needed it is gone, and adding cycle
detection is a larger change than this ticket wants.

## Key Links

- **The guide**: [design/01](./design/01-the-landing-page-the-embedded-workbench-and-the-lesson-rail-analysis-design-and-implementation-guide.md)
  — analysis, design and implementation, written for someone joining the project.
- **The prototype**: [sources/pbui-landing.jsx](./sources/pbui-landing.jsx).
  Read lines 1466–1761 (embeddability) and 1763–1988 (the lesson machinery);
  skim the rest.
- **Predecessor**: DATADROP-6, whose design/02 leaves phases 1–6 open. Those are
  independent of this ticket and neither blocks the other.

## Status

Current status: **active**

## Topics

- frontend
- landing-page
- tutorial
- pbui
- architecture
- embedding
- storybook

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- sources/ - The imported prototype
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
