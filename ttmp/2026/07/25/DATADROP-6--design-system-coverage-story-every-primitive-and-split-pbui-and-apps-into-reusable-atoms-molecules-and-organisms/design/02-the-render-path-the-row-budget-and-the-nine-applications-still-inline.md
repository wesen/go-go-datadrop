---
Title: The render path, the row budget, and the nine applications still inline
Ticket: DATADROP-6
Status: active
Topics:
    - design-system
    - performance
    - pbui
    - storybook
    - refactor
    - frontend
DocType: design
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ui/src/apps/useTable.ts
      Note: useTableFor now evaluates the pipeline on every call, and FieldChip calls it during render
    - Path: repo://ui/src/pbui/descriptors/field.ts
      Note: resolveField reads only table.fields; statistics is the only thing that needs rows
    - Path: repo://ui/src/model/pipeline.ts
      Note: schemaAfter computes the post-pipeline schema without touching a row
    - Path: repo://ui/src/pbui/types.ts
      Note: PbuiEnvironment, the interface this document splits in two
    - Path: repo://ui/src/components/atoms/FieldChip/FieldChip.tsx
      Note: calls resolveField in its render body — the hot path
    - Path: repo://ui/src/components/organisms/SourcePanel/SourcePanel.tsx
      Note: offers a 50 000-row budget, which is the number that makes this urgent
    - Path: repo://ui/src/apps/PipelineApp/PipelineApp.tsx
      Note: 293 lines, the largest application still unextracted
ExternalSources: []
Summary: "Two pieces of follow-up from DATADROP-6. A measured performance defect — FieldChip resolves through an environment that now evaluates the whole pipeline, in its render body, costing 158 ms per render at the largest row budget — fixed by splitting the environment so the render path gets a schema and only the inspector gets rows. And the nine applications still holding their UI inline, with an extraction order derived from what each would gain."
LastUpdated: 2026-07-25T20:16:29.177918813-04:00
WhatFor: "Fixing a performance regression introduced by a correctness fix, and finishing the application extraction."
WhenToUse: "Before touching PbuiEnvironment, and before extracting any remaining application."
---

# The render path, the row budget, and the nine applications still inline

## Overview

Two pieces of work, related only by both being unfinished business from
DATADROP-6.

The first is a **performance defect that a correctness fix introduced**, and it
is measured rather than suspected. Making `useTableFor` return the pipeline
output fixed field chips rendering as stale — but that function is called from
`FieldChip`'s render body, so a table header of thirteen columns now runs the
pipeline thirteen times per render. At the 50 000-row budget the source browser
offers, that is **158 ms of pipeline evaluation per render**, or about ten
dropped frames.

The second is the **nine applications that still hold their user interface
inline**, with no panel and therefore no story. `stories.test.ts` cannot see
them: it checks that every component has a story, and there is no component for
it to find missing.

The two share one property worth stating up front. Neither was visible to a
green test suite. The first was found by measuring after a reviewer asked
whether the memoisation was sound; the second by a reviewer asking why the
applications were not in Storybook. Both are the kind of question the
enforcement built in DATADROP-6 is structurally unable to ask.

***

# Part I — The render path

## 1. What changed, and why it was right

DATADROP-6's follow-up fixed a real defect. `resolveField` resolves a field chip
against `env.tableFor(docId)`, which returned the **source** table from the RTK
Query cache. So any column a pipeline step *produces* — `mean_data.temp_c`, a
derived column — was not found, and the chip rendered stale: dashed border,
warning glyph, "not in the pipeline output". It is precisely the pipeline
output; it is the source it is absent from.

The encoding editor made this a visible contradiction. It computes staleness
correctly from `pipeline.fields` and then drew a chip beside it that computed
the opposite answer.

The fix was to evaluate:

```ts
// apps/useTable.ts, useTableFor
const out = evaluate(data, doc.spec.steps, doc.spec.typeOverrides);
return { ...data, fields: out.fields, rows: out.rows };
```

That is correct and it stays. It also settled a second question: a descriptor's
statistics now describe the rows the chart drew rather than the rows the server
sent, which is what a presentation of something on screen should report.

## 2. What it cost

The diary recorded this as "runs once per menu open over at most the row budget,
so this is very probably fine". **That was wrong**, and the error is worth
naming because it is a reasoning failure rather than a typo: descriptors *are*
mostly called from menu handlers, but `resolveField` is not a descriptor method.
It is a helper, and `FieldChip` calls it during render:

```tsx
// components/atoms/FieldChip/FieldChip.tsx:25
const { field, type } = resolveField(ref, pbui.environment);
```

Every field chip, every render, evaluates the entire pipeline.

### 2.1 The measurement

Timed with `bun`, over the `readings` fixture repeated to each row budget, with
two steps (a filter and a sort), after a warm-up loop so the first figure is not
measuring JIT compilation:

```text
  2000 rows   13x evaluate     5.5 ms
 10000 rows   13x evaluate    24.6 ms
 50000 rows   13x evaluate   158.5 ms
```

Thirteen because that is how many columns the `readings` fixture has, and the
table header renders one `FieldChip` per column of pipeline output.

**158 ms is roughly ten dropped frames.** It happens on every render of that
header — which includes every keystroke in the pipeline editor, every divider
drag, and every arriving event on a live stream.

The 2 000-row default is tolerable. The 50 000-row budget is not, and the source
browser offers it as one of four buttons.

### 2.2 The scale of the exposure

| Site | Field chips per render |
|---|---|
| `TablePanel` header | one per pipeline column — 13 for the fixture, unbounded in general |
| `EncodingApp` channels | up to 5 |
| `PipelineApp` step editors | 2 |
| `AboutApp` | 2 |

The table header is the problem. The others are bounded by the grammar.

## 3. The fix: the render path needs a schema, not a table

The decisive observation is that **`resolveField` never touches a row**:

```ts
export function resolveField(ref: FieldRef, env: PbuiEnvironment) {
  const table = env.tableFor(ref.docId);
  const field = table?.fields.find((f) => f.name === ref.name) ?? null;   // fields only
  if (!field) return { table, field: null, type: null };
  return { table, field, type: effectiveType(field, env.overridesFor(ref.docId)) };
}
```

It wants the post-pipeline **schema**. `model/pipeline.ts` already computes
exactly that, without evaluating anything:

```ts
export function schemaAfter(
  table: Table,
  steps: Step[],
  upto?: number,
  overrides?: Record<string, FieldType>,
): Field[]
```

`schemaAfter` walks the steps and transforms a list of field descriptors. It is
**O(steps), independent of row count**. Measured against the same budgets:

```text
  2000 rows   13x evaluate   5.5 ms   13x schemaAfter  0.017 ms      331x
 10000 rows   13x evaluate  24.6 ms   13x schemaAfter  0.016 ms    1 511x
 50000 rows   13x evaluate 158.5 ms   13x schemaAfter  0.013 ms   11 985x
```

Four orders of magnitude at the budget that matters, and flat as the data grows.

Only `statistics()` in `field.ts:28` needs rows, and it is called from
`describe()` — the inspector — which runs when a menu entry is chosen, not
during render. That is the boundary the interface should have.

### 3.1 The shape

Split `PbuiEnvironment` in two along that line:

```ts
export interface PbuiEnvironment {
  /**
   * The post-pipeline SCHEMA. Cheap, O(steps), safe in a render body.
   *
   * Everything that resolves a field for display uses this.
   */
  fieldsFor(docId: DocId | null): Field[];

  /**
   * The post-pipeline TABLE, rows and all. Evaluates the pipeline.
   *
   * Only for descriptors' `describe()` and `actions()`, which run from a menu
   * handler. Never call this during render.
   */
  tableFor(docId: DocId | null): Table | null;

  activeDocId: DocId | null;
  nameOf(docId: DocId): string;
  overridesFor(docId: DocId | null): Record<string, FieldType> | undefined;
}
```

**PSEUDOCODE** for the resolver split:

```ts
// resolveField — the render path. No rows, no evaluate.
export function resolveField(ref: FieldRef, env: PbuiEnvironment) {
  const field = env.fieldsFor(ref.docId).find((f) => f.name === ref.name) ?? null;
  if (!field) return { field: null, type: null };
  return { field, type: effectiveType(field, env.overridesFor(ref.docId)) };
}

// The descriptor's describe() — the menu path. Rows are wanted and affordable.
describe(ref, env) {
  const table = env.tableFor(ref.docId);
  ...statistics(ref, table, type)
}
```

Note that `resolveField` stops returning `table`. Its callers use only `field`
and `type`; returning a table it did not need is what made the cheap call look
like an expensive one.

### 3.2 The environment builder

```ts
// store/applyVerb.ts, environmentFor
fieldsFor: (docId) => schemaOf(docId ?? world.activeDocId),
tableFor:  (docId) => tableOf(docId ?? world.activeDocId),
```

with `useTableFor` gaining a sibling:

```ts
export function useFieldsFor(): (docId: DocId | null) => Field[] {
  // The same cache lookup; schemaAfter instead of evaluate.
}
```

### 3.3 Memoisation, and why it is the second choice

The obvious alternative is to memoise `useTableFor` on `(docId, table identity,
steps identity)`. It would work: RTK Query holds a stable table reference until
a refetch, and the reducers update `spec.steps` immutably, so both identities
are stable — the same three-way stability `useDocPipeline` already relies on.

It is the second choice for two reasons.

**It caches a computation the render path should not be doing at all.** A cache
that turns 158 ms into 12 ms is a worse outcome than a call that never costs
more than a microsecond, and it leaves the cost one cache miss away — a spec
edit invalidates it, and a spec edit is exactly when the pipeline editor is
re-rendering hardest.

**It hides the interface defect.** `tableFor` returning rows to a render path is
the actual mistake; memoising makes it survivable rather than removing it, and
the next component to call `tableFor` during render pays the same cost again
with no warning.

Memoisation is still worth adding *behind* the split, for the menu path: opening
the same field's menu twice should not evaluate twice. But it is an
optimisation, not the fix.

### 3.4 What this does not solve

`useDocPipeline` still evaluates once per document per render pass, memoised on
identity. That is correct and cheap — one evaluation, not thirteen — and it is
what feeds the chart and the table. Nothing here changes it.

## 4. Guarding it

A comment saying "never call this during render" is a comment. Two cheap
guards:

**A development-mode counter.** `tableFor` increments a counter and warns above
a threshold within one tick:

```ts
// PSEUDOCODE, development builds only
let calls = 0;
queueMicrotask(() => { calls = 0; });
if (++calls > 4) console.warn("tableFor called %d times in one tick — is this a render path?", calls);
```

**A test over the components.** `resolveField` is used by exactly one atom; a
test can assert that nothing under `components/` calls `tableFor` at all, in the
style of `no-raw-controls.test.ts`. That is the stronger guard because it fails
in CI rather than in a console nobody is reading.

## 5. Verification

- Re-run the benchmark. The render path should be flat in row count.
- The `TablePanel → Summarized` story must still show non-stale header chips:
  the split must not reintroduce the defect the evaluation fixed.
- The `EncodingApp` contradiction must stay fixed — a summarized mapping shows
  the same staleness in the row and in the chip.
- 177 tests, and a story build.

***

# Part II — The nine applications still inline

## 6. Where the extraction stands

Eight applications have panels. Nine do not, plus four tutorials.

| Application | Lines | Hooks | State worth a story |
|---|---|---|---|
| `PipelineApp` | 293 | 4 | empty pipeline, dropped rows, summarize warning, five step editors |
| `EncodingApp` | 159 | 4 | stale mapping, log scale unavailable, unmapped channels |
| `GalleryApp` | 118 | 6 | no snapshots, pinned A/B |
| `ChartsApp` | 117 | 5 | one document, many documents, the undeletable last one |
| `CompareApp` | 116 | 5 | neither pinned, one pinned, specs that differ |
| `AboutApp` | 108 | 0 | none — static prose |
| `WatchlistApp` | 89 | 4 | empty, mixed presentation types |
| `TraceApp` | 85 | 2 | empty, a long trace |
| `InspectorApp` | 50 | 2 | nothing inspected, a deep object |
| `apps/tutorials/*` | 440 | — | genuinely open, see §9 |

## 7. The order, and the reason for it

Ordered by what a story would catch, not by size.

**1. `PipelineApp` (293).** The largest, and the one whose states are hardest to
reach: a step that dropped rows, a summarize step's column-loss warning, and
five different step editors each with their own controls. `StepRow` is already
extracted and adopted; what remains is `StepEditor`, which is a five-way switch
that nothing has ever rendered outside a running pipeline.

**2. `EncodingApp` (159).** `ChannelRow` is extracted and adopted, so this is
mostly the geom picker and the y-scale toggle. Its awkward mode is *log scale
unavailable* — it needs a y domain that includes a non-positive value, which
means loading a specific source.

**3. `TraceApp` and `InspectorApp` (85, 50).** Small, and both are almost
entirely an empty state and a populated one. Cheap coverage.

**4. The snapshot family: `GalleryApp`, `CompareApp`, `ChartsApp` (351
together).** These three share a shape — a list of world objects with actions
per row — and should be looked at together before any is extracted, because the
right answer may be one `SnapshotList` molecule and three thin panels rather
than three panels.

**5. `WatchlistApp` (89).** Interesting only for its mixed-type list: a
watchlist holds `field`, `source`, `doc`, `step`, `datum` and `cat`
presentations at once, which is a state no other component produces.

**6. `AboutApp` (108).** Static prose with two field chips. There is nothing to
story that a page-level story would not already cover. **Candidate for leaving
alone**, and §9 says why that is a real option.

## 8. What each extraction must preserve

The rules the eight completed panels established, restated because they are what
makes these extractions mechanical rather than exploratory.

- **The container keeps the hooks and the fetches.** The panel takes data and
  callbacks.
- **The panel does not wrap itself in `Presentation`** — it takes a render prop
  (DR-38). The two exceptions, `ChartPanel`'s marks and `TablePanel`'s cells,
  are exceptions because a render prop per mark or per cell is an absurdity
  rather than a seam. A third exception needs a better argument than either.
- **Stories drive the real engine.** `fixtures/charts.ts` supplies `chartSpec`,
  `chartPlot`, `pipelineOf` and `tableAfter`. A story that hand-writes rows is
  asserting what the pipeline produces rather than showing it.
- **A story of a transformed relation passes `tableAfter(spec)` through
  `parameters.pbui.table`**, or its field chips resolve against the source and
  render stale — the defect Part I is about, reappearing in the story layer.
- **Story tiles must be wider than any fixed-width child.** `reset.css` sets
  `svg { max-width: 100% }`, so a plot drawn at 560px in a narrower tile is
  scaled down and clips.

## 9. The open question about the tutorials

The four tutorial applications are 440 lines of prose interleaved with controls
that dispatch real verbs. They are the one case where inline JSX may be correct:
each is a one-off document, no two share structure, and a `Tutorial` organism
taking a step DTO would be a generic solution to a problem with four specific
instances.

The argument for extracting anyway is that a tutorial has states — a completed
step, a step whose precondition is not met — that nobody has ever looked at.

**Recommendation: leave them, and revisit if a fifth tutorial is written.** A
fifth would be evidence of a pattern; four written together is evidence of one
afternoon.

## 10. Acceptance

```text
                                              now      after
applications with a panel                       8         16
applications with no story                      9          1   (AboutApp, deliberately)
apps/*.tsx total lines                      2 592    ≈ 1 900
stories                                       208      ≈ 260
pipeline evaluations per table-header       13/render     0
  render
cost at the 50 000-row budget               158 ms      ~0 ms
```

The last row is the one to check first, because it is the only one a user would
notice.

## 11. Decision records

**DR-40 — The render path resolves a schema; only the inspector resolves rows.**
`PbuiEnvironment` gains `fieldsFor`, and `resolveField` uses it. *Alternative:*
memoise `tableFor`. *Cost:* caches a computation that should not happen, and
leaves the cost one invalidation away — a spec edit, which is exactly when the
pipeline editor re-renders hardest.

**DR-41 — `resolveField` stops returning a table.** Its callers use only `field`
and `type`. *Alternative:* keep the shape. *Cost:* a cheap call that looks
expensive, which is how the next person reintroduces the problem.

**DR-42 — A test forbids `tableFor` under `components/`.** In the style of
`no-raw-controls.test.ts`, with a named allowlist. *Alternative:* a comment.
*Cost:* DATADROP-6's entire premise is that a written-down convention is one
that has already been broken somewhere nobody has looked.

**DR-43 — The tutorials stay inline until there is a fifth.** *Alternative:*
extract a `Tutorial` organism now. *Cost:* a generic solution to four specific
instances, which the first guide's §21 calls padding.

**DR-44 — The three snapshot applications are designed together or not at all.**
*Alternative:* extract them one at a time. *Cost:* three panels that should have
been one molecule and three thin containers, discovered on the third.

## 12. Phases

| Phase | Work |
|---|---|
| 1 | `fieldsFor` on the environment, `useFieldsFor`, `resolveField` split; benchmark before and after |
| 2 | The guard: a test forbidding `tableFor` under `components/`, plus the development counter |
| 3 | `PipelinePanel` and `StepEditor`, with the five step-kind stories |
| 4 | `EncodingPanel`, `TracePanel`, `InspectorPanel` |
| 5 | The snapshot family, designed together |
| 6 | `WatchlistPanel`; decide `AboutApp` and the tutorials explicitly rather than by omission |

Phase 1 and 2 are independent of 3 to 6 and should land first: they are a
user-visible regression, and the extraction is not.
