---
Title: Implementation diary
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
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation journal for the PBUI shell: what was built, what broke, and what the failures taught."
LastUpdated: 2026-07-25
WhatFor: "Continuation and review. Read the latest step to know where the work stands."
WhenToUse: "Before resuming DATADROP-4, and when reviewing any commit on it."
---

# Diary

## Goal

Turn the `pbui-gog` prototype into the real datadrop web UI: a CLIM/Genera-style
presentation-based shell over the grammar-of-graphics engine DATADROP-3 shipped,
decomposed into an atoms/molecules/organisms design system with Storybook, and
with no CSS framework.

The plan is `design/01-pbui-shell-analysis-design-and-implementation-guide.md`.
Section references below (§4.4, DR-13, …) point into it.

---

## Step 1: The salvage walk, before deleting anything

Phase 0 begins by deleting `ui/src/App.tsx` and all eight files in
`ui/src/components/` (DR-17). The guide's §4.4 exists because the value in those
1 341 lines is not the code — it is a handful of behaviours that were learned
expensively during DATADROP-3, three of which were found only by driving a
browser and produced a screen that looked like it was working. This step is the
walk through them with the files still on disk, so that the replacements in
phases 1–4 are written against what was actually there rather than against my
memory of it.

The walk paid for itself immediately: it turned up **two live defects and one
error in my own design guide**. That is a better outcome than a clean
confirmation would have been, and it is the argument for doing a salvage pass at
all rather than trusting a summary written a day earlier.

### Prompt Context

**User prompt (verbatim):** "Implement the ticket, keep a detailed diary as you work, commit at appropriate intervals"

**Assistant interpretation:** Begin executing the DATADROP-4 plan phase by phase,
maintaining a diary in the format of the `diary` skill, and committing at
coherent boundaries rather than at the end.

**Inferred user intent:** Get the PBUI shell actually built, with a reviewable
trail that makes it possible to resume or hand off mid-flight.

### What I did

- Read all eight components and `App.tsx` in full before touching anything.
- Verified the split by line count: 1 341 lines deletable
  (`App.tsx` 252 + `components/` 1 089), 2 569 lines kept (`model/`, `api/`,
  `export/`, `main.tsx`, `ui/test/`).
- Confirmed `bun test` green beforehand: 58 tests, 148 assertions, 5 files,
  147 ms.
- Recorded each §4.4 behaviour against the actual source rather than the guide.

### Why

DR-17 deletes the shell rather than migrating it. A delete is irreversible in
practice — the code stays in git, but nobody reads deleted code — so the
knowledge has to move out first, into a place the phase-3 implementer will
actually look.

### What worked

Seven of the nine salvage entries confirmed exactly as written. The four that
matter most, with the line that carries them:

| Behaviour | Where | Confirmed |
|---|---|---|
| named SSE frames | `LiveToggle.tsx:41` — `es.addEventListener("append", …)` | yes, with a 5-line comment explaining the silent-failure mode |
| file list needs the version endpoint | `SourcePicker.tsx:97-102` | yes, and the comment explains *why* the detail endpoint omits files |
| truncation notice not dismissible | `TruncationBanner.tsx` — no dismiss control exists | yes |
| no scale arithmetic in the renderer | `PlotSvg.tsx:6-8` | yes |

Two more worth carrying that §4.4 did not name:

- `LiveToggle.tsx:14-19` — `EventSource` cannot set an `Authorization` header.
  That is a browser limitation, and the component's response is to disable the
  control and explain, rather than smuggling the token into a query string where
  it would reach server logs and browser history. The replacement must keep that
  posture; a fetch-based SSE reader is the recorded way out.
- `PipelineEditor.tsx:240-243` — the `summarize` editor states inline that the
  step drops every column except the key and the aggregate. `evaluate` really
  does this (`pipeline.ts:288-291`), and it costs an afternoon when undocumented.

### What didn't work

Three findings, all of which change something.

**1. `TruncationBanner` prints the same number twice.** `TruncationBanner.tsx:26-27`:

```tsx
Showing {which} {table.row_count.toLocaleString()} of at least{" "}
{table.row_count.toLocaleString()} rows
```

Which renders *"Showing the most recent 2,000 of at least 2,000 rows"* — a
sentence that says the sample is the whole source, in a banner whose entire job
is to say the opposite. The prose around it is right and the reasoning in the
docstring is right; the second number is wrong. When a table is truncated the
server has proved there is at least one more row (it requests `limit + 1` and
discards the extra), so the honest figure is `row_count + 1`.

Nobody caught this because both numbers look plausible and the sentence is
grammatical. It is a good example of why the guide insists that a view which is
not the whole truth must say so *specifically*: a vague warning and a wrong
warning fail the same way.

**2. `EncodingEditor` silently blanks a stale mapping.** `EncodingEditor.tsx:62-73`
filters the options to the types a channel accepts, then sets
`value={spec.mapping[channel] ?? ""}`. If a `summarize` step removes the mapped
column, the field is no longer among the options, so the `<select>` falls back to
rendering blank — the mapping *looks* cleared while `spec.mapping` still holds
the dead name and `buildPlot` still refuses with
`y ↦ mean_x is not in the pipeline output`. The control and the chart disagree
about what the chart is trying to do.

**3. My own guide was wrong about this.** §4.4 credited `EncodingEditor.tsx` with
"a mapped field no longer in the pipeline output renders stale, with a warning."
That is the *prototype's* behaviour (`pbui-gog.jsx:1818`), not ours. I wrote the
salvage table from the design intent rather than from the file. Corrected in the
guide; the entry now names it as a defect to fix rather than a behaviour to
preserve.

A fourth, smaller: `EncodingEditor` filters on `field.type` rather than the
effective type, so a per-chart `typeOverrides` entry does not change which
channels will accept the field. Harmless today because nothing sets overrides;
it becomes wrong the moment §13.4 lands.

### What I learned

- **A salvage pass is a code review with a deadline.** Reading nine files with
  the explicit question "what must survive?" found two defects that ordinary
  review had not, because the question forces you to articulate what each line
  is *for* — and a line whose purpose you cannot state is a line worth staring
  at.
- **Design documents drift from code within a day.** I wrote §4.4 about
  `EncodingEditor` from what the component *should* do. Verifying against the
  file is cheap; not verifying produces a guide that quietly teaches the wrong
  thing to whoever reads it next.
- The truncation defect and the stale-mapping defect are the same shape: **the
  interface asserting something the state contradicts.** Both are invisible
  because the assertion is well formed. That is now a thing to look for in the
  replacements.

### What was tricky to build

Nothing was built in this step. The tricky judgement was scoping the walk: the
temptation is to fix the two defects immediately, in files that are about to be
deleted. That is wasted work and it muddies the demolition commit. Both are
instead recorded as acceptance criteria for the components that replace them —
`TruncationNotice` and `ChannelRow`, both phase 3 — and this diary is the handoff.

### What warrants a second pair of eyes

- The `row_count + 1` claim rests on `handlers_table.go` requesting `limit + 1`
  and discarding the extra. Confirm against the handler before the replacement
  ships: "at least N+1" is only honest if the server really has seen row N+1.

### What should be done in the future

- `TruncationNotice` must print `row_count + 1` as the lower bound. Acceptance
  test: a truncated table of 2 000 rows renders "of at least 2,001".
- `ChannelRow` must render a mapped-but-absent field as a stale chip with a
  warning, not as a blank select.
- Every field-type comparison in the new components goes through
  `effectiveType(field, overrides)`, never `field.type`.

### Code review instructions

- No code changed in this step. Every claim above is checkable against
  `ui/src/components/*.tsx` at commit `115c0e4`, the last commit before the
  demolition.
- `cd ui && bun test` — 58 tests, the baseline that must stay green through
  every phase.

### Technical details

Baseline before demolition:

```
$ cd ui && bun test
 0 fail
 148 expect() calls
Ran 58 tests across 5 files. [147.00ms]

$ wc -l ui/src/App.tsx ui/src/components/*.tsx | tail -1
 1341 total
$ wc -l ui/src/model/*.ts ui/src/api/*.ts ui/src/export/*.ts ui/src/main.tsx ui/test/*.ts | tail -1
 2569 total
```
