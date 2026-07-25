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

---

## Step 2: Phase 0 — demolition, the token layer, and four defects it exposed

Deleted the shell and built the foundation under it: tokens, a reset, the
scrollbars, the `foundation/` and `layout/` primitives, Storybook with its
decorators, committed fixtures, and the layer-boundary rule. The phase was
supposed to be mechanical. It was not: extracting ~600 inline style objects into
a token layer, and then *looking at the result in a browser*, found four defects
— one in my own plan, one in the CSS, and two in shipped code that has been
green in CI since DATADROP-3.

The pattern across all four is worth naming up front. Each was invisible to the
thing that should have caught it: the plan was wrong about a command nobody had
run, the CSS bug produced a well-formed element with no visible content, and the
`defaultChart` defect produced a chart that drew correctly and answered the wrong
question. None raised an error anywhere.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Execute phase 0 of the guide end to end.

**Inferred user intent:** A foundation the later phases can be built on without
revisiting.

**Commits (code):** `f06dec4` — "phase 0 — demolish the shell, build the visual
foundation", plus this step's follow-up.

### What I did

- `git rm` on `App.tsx` and all eight components; `bun remove bootstrap`.
- Wrote `styles/{tokens,reset,scrollbars}.css`, `components/foundation/`
  (Text, SectionLabel, Divider, VisuallyHidden, Kbd) and `components/layout/`
  (Stack, Surface, Toolbar, AppBody).
- `scripts/make-tokens.ts` + `test/tokens.test.ts` for the duplicated palette.
- Storybook 10.5.4 with `withStore` and `withTile`, a11y at `test: "error"`, and
  the token sheet story.
- `scripts/make-fixtures.ts` + three committed fixtures, and
  `test/fixtures.test.ts` driving each through the real engine.
- `test/layers.test.ts` enforcing the §10.2 dependency graph.
- Drove the token sheet in a real browser and ran axe against it.

### Why

The token sheet is the deliverable that makes "stay close to pbui-gog" a
reviewable claim rather than a matter of taste, so it was worth building first
and looking at properly.

### What worked

- The aesthetic ports cleanly. The rendered sheet is recognisably the prototype:
  monospace, hairline hard borders, no radius, offset shadows, uppercase
  letterspaced section labels.
- Two invariants are now enforced rather than documented. `bun test` went from
  58 to 91 assertions covering: the CSS palette equals `model/plot.ts`, contrast
  thresholds for every text token, the layer graph, and every fixture charting
  through `defaultChart` → `evaluate` → `buildPlot`.
- The layer test was checked against a deliberate violation before being
  believed — a foundation file importing from layout, which it caught with a
  useful message.

### What didn't work

**1. `bun run build` clobbers the interface the binary serves.** The guide told
the implementer not to run `make ui` during the phase 0-3 interval. That is not
the dangerous command. `vite.config.ts` sets `outDir: "../pkg/webui/dist"` with
`emptyOutDir: true`, so *any* production build writes into the Go tree — which
is deliberate, and which means a routine "does it still compile?" replaced the
DATADROP-3 bundle with a placeholder.

Found by running it. Recovered with `git checkout -- pkg/webui/dist`, plus
`rm` on two newly-hashed assets that were untracked and therefore not restored
— `go:embed` would have shipped those orphans. Added `bun run build:check`,
which builds to a gitignored `dist-check`, and verified the served bundle is
still `index-B_spFeBu.js` by starting the binary and curling `/ui/`.

**2. The inverted surface rendered invisible text.** `Surface` set
`color: var(--pbui-paper)` for the shell bars, and `Text` set
`color: var(--pbui-ink)` for its default tone — the more specific rule won, so
every label on a dark bar was ink on ink. Measured: **1.00:1**.

The first instinct was to patch `Text`. The right fix is a layer down: on an
inverted surface, *re-point the tokens* for its descendants, so borders, faint
text and any future token consumer adapt without knowing what they sit on.

```css
.inverted { background: var(--pbui-ink); color: var(--pbui-paper); }
.inverted :where(*) {
  --pbui-ink: var(--pbui-paper);
  --pbui-faint: var(--pbui-faint-inverted);
  --pbui-line: var(--pbui-faint-inverted);
}
```

The override is on `:where(*)`, not on `.inverted` itself. A custom property
declared on an element applies to that element's own declarations, so
re-pointing `--pbui-ink` on the surface would make `background: var(--pbui-ink)`
resolve to paper and the bar would come out white. That cost a few minutes and
is exactly the kind of thing that reads as obvious afterwards.

It also needed a genuinely new token. `--pbui-faint` is tuned for pale surfaces
and measures 2.95:1 against the ink bars, so `--pbui-faint-inverted` (#918c85,
4.55:1) exists for descendants of an inverted surface.

**3. Two more contrast failures, one of which only shows on the alt surface.**
axe found `--pbui-ok` at 3.36:1. Auditing the rest properly rather than fixing
the reported one:

| token | was | pane | alt | now |
|---|---|---|---|---|
| `--pbui-faint` | #7b8087 | 3.98 | 3.51 | #696e75 (5.14 / 4.54) |
| `--pbui-danger` | #c2503a | **4.66** | 4.12 | #b64b37 (5.18 / 4.58) |
| `--pbui-ok` | #3f9d6b | 3.36 | 2.97 | #317a53 (5.20 / 4.59) |

`--pbui-danger` **passes on white and fails on the alt surface**. A check
against one background would have declared it fine, and it is used for problem
messages inside zebra-striped tables. Both surfaces, always.

The tone edges are a separate case and are deliberately *not* fixed. Most
measure 1.9-2.6:1, and darkening them to clear WCAG 1.4.11's 3:1 would destroy
the palette the design rests on. That is defensible only because a tone is never
the sole carrier of its information — a field chip states its type as a letter
as well as a hue. `test/tokens.test.ts` pins that premise with a test that
asserts the tones are *below* 3:1 and explains why, so anyone who later removes
a type badge to "clean up" has to come and read the reason they cannot.

**4. `defaultChart` colours by a boolean flag.** The fixture test failed:

```
Expected: "data.station"
Received: "data.ok"
```

`model/chart.ts` preferred the *fewest* distinct values. That reads as "keep the
legend short" and means "chart the flag": `data.ok` has 2 levels and
`data.station` has 4, so `lab/temps` opened as a chart about a boolean rather
than about its four sensors.

Reading further found a worse latent bug beneath it. `payloadFirst` establishes
an ordering and then `.sort()` by distinct count **reorders across that
boundary**, so ranking envelope columns lower does not survive. A stream whose
`stream` or `id` column happened to have fewer levels than its payload column
would be coloured by delivery metadata. The existing test passed only because
its numbers happened to fall the right way.

Both fixed together: envelope columns are now *excluded* rather than ranked
lower, and the survivors sort descending, since the ≤8 cap already handles
legibility and more levels carry more information. Two regression tests added,
one per rule, each stating the case the old code got wrong.

### What I learned

- **A test that reads a real fixture is worth more than one that builds a
  minimal table.** The `defaultChart` defect needed a table with both a boolean
  payload column and a multi-level one — a shape nobody constructs by hand for a
  unit test, and the shape every real sensor stream has.
- **Check contrast against every surface a colour appears on.** One of three
  failures was invisible from the white background.
- **A duplicated constant needs a test, not a comment.** The palette, the ink
  value and the faint value all exist in two places for good reasons; each pair
  now has an assertion.
- Storybook resolved to **10.5.4**, not the 9 the guide names. The configuration
  needed no changes beyond `viteFinal`.

### What was tricky to build

The `:where(*)` scoping on the inverted surface, described above: the underlying
cause is that custom properties declared on an element are visible to that
element's own declarations, so the naive version silently inverted the surface's
own background instead of its children's text.

The other sharp edge was Storybook inheriting `vite.config.ts`. Its `outDir`
points into the Go tree, so `build-storybook` would have written there too;
`main.ts` overrides `base`, `outDir` and `emptyOutDir` back to defaults, and the
build was checked with `git status pkg/webui/` afterwards to prove it.

### What warrants a second pair of eyes

- **The `defaultChart` change alters shipped behaviour.** A chart that previously
  opened coloured by a two-level field now opens coloured by a richer one. I
  believe this is right in every case I can construct, but it is a default that
  users may have formed habits around.
- The tone-edge exemption from WCAG 1.4.11 is a judgement call. It rests on
  every chip carrying a redundant textual cue — an obligation now on components
  that do not exist yet (phase 1).
- `--pbui-danger` is used both as text and as the accept outline. The darkened
  value clears 4.5:1 as text and 3:1 as a UI indicator, but it should be looked
  at once against a real pulsing chip.

### What should be done in the future

- Phase 1 `FieldChip` **must** render the type letter, not only the tone edge.
  The contrast exemption depends on it.
- `withPbui` joins the decorators in phase 1.
- Re-check the token sheet's axe report after atoms land, since the chips will
  introduce the first real colour-on-colour combinations.

### Code review instructions

- Start at `ui/src/styles/tokens.css` — it is the whole visual language, and the
  comments carry the reasoning for every value that deviates from the prototype.
- `ui/src/components/layout/Surface/Surface.module.css` for the `:where(*)`
  trick and why it is not on the element itself.
- `ui/src/model/chart.ts:82-105` for the `defaultChart` change; the two new
  tests in `ui/test/plot.test.ts` state the cases.
- Validate: `cd ui && bun test` (91), `bun run typecheck`, `bun run
  build-storybook`, then `git status pkg/webui/` to confirm the embedded bundle
  was not touched.
- Look at the token sheet: `bun run storybook`, then
  Design System / Foundation / Tokens. The Accessibility panel should report
  zero violations.

### Technical details

```
$ cd ui && bun test
 91 pass  0 fail  7022 expect() calls  across 8 files

$ bun run fixtures
readings.json — 360 rows × 13 fields
census.json — 24 rows × 4 fields
batches.json — 500 rows × 4 fields (truncated)
```

Contrast helper used throughout (WCAG 2.x relative luminance):

```
L = 0.2126 R + 0.7152 G + 0.0722 B,  channel c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)^2.4
ratio = (Lhi + 0.05) / (Llo + 0.05)
```

---

## Step 3: Phase 1 — the PBUI core, proven against fixtures

Built the presentation protocol: `Presentation`, the descriptor registry, the
accept mechanism, the object menu, the accept banner and the mouse documentation
line, plus the six atoms that draw them. Then drove it in a browser and turned
every check into a play function.

It works, and it works the way the prototype does. Right-clicking `data.station`
produces a menu headed `<field> data.station → chart α` offering *Map to x*,
*Map to color*, *Map to facet*, *Group by + count* — with *Map to y* present but
**disabled and annotated "y accepts quantitative"**. Pressing `⌖` beside the y
channel turns three of thirteen chips red and pulsing, leaves the other ten
inert, and a click on `data.humidity` three sections away resolves the promise
and remaps the channel.

The design changed in two places while building it, both because the code
pushed back.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 1 of the guide.

**Inferred user intent:** A working, provable interaction protocol before any of
it is committed to across a dozen applications.

**Commit (code):** this step's commit.

### What I did

- `src/pbui/`: `types.ts`, `verbs.ts`, `PbuiProvider.tsx`, `Presentation.tsx`,
  `usePbui.ts`, `registry.ts`, `parts.ts`, `conversions.ts`, `pbui.module.css`,
  `ObjectMenu.tsx`, `AcceptBanner.tsx`, `MouseDocLine.tsx`, and descriptors for
  `field`, `source` and `doc`.
- `src/components/atoms/`: `Chip`, `TypeBadge`, `ProvenanceBadge`, `FieldChip`,
  `SourceChip`, `DocChip`.
- `.storybook/withPbui.tsx`, the `Playground` story and four variants.
- `test/descriptors.test.ts` — 15 assertions, no DOM.
- Drove the protocol in Chromium; converted each manual check into the
  `AcceptFlow` play function.

### Why

Phase 1 is the phase that proves the design. Fifteen tiles are a bad place to
discover that accept feels wrong.

### What worked

- **Accept, exactly as specified.** Verified in the browser: with y accepting,
  the acceptable set was `data.temp_c`, `seq`, `data.humidity` — every
  quantitative column and nothing else. `data.station` stayed inert. The banner
  read `ACCEPTING <field> MAP Y ↦ click a FIELD anywhere`, the mouse-doc line
  switched to `ACCEPT MODE`, and Escape aborted without changing the chart.
- **Pure descriptors pay off immediately.** `test/descriptors.test.ts` asserts
  that a field owned by β emits `{kind: "setMapping", docId: "d2", …}` while α is
  active — the targeting rule that the value shape `{docId, name}` exists for,
  and the one the prototype gets wrong (pbui-gog.jsx:2599). One assertion, no
  store, no Provider, no DOM.
- axe reports **zero violations** on the playground, menu open.

### What didn't work

**1. The registry could not hold the chip component.** The guide's
`PresentationDescriptor` carried a `Chip: React.ComponentType`. That makes
`pbui` import from `components/atoms`, and atoms import `pbui` — a cycle, and a
layer violation `test/layers.test.ts` would have caught.

Fixed by splitting the responsibility: descriptors hold `label`, `describe`,
`actions` and `tone` and no React at all; the chip that draws a presentation
lives in atoms. This is better than the guide's version rather than a compromise
— it is what makes `registry.ts` a `.ts` file testable without a renderer.

**2. `pbui` needs `foundation`.** `MouseDocLine` needs `VisuallyHidden` for its
`aria-live` mirror, which the layer test rejected. I granted the exception
explicitly rather than routing around it: `foundation` imports nothing, so it
cannot create a cycle, and the alternative is pbui re-implementing the type
scale. The rule that matters — pbui must not import atoms or above — is intact
and still enforced.

**3. Verbs as data, not closures.** The guide had `actions` return closures over
`dispatch`. Phase 1 has no world slice to dispatch to, which forced the question
early, and the answer is better than the original: `actions` returns
`{label, verb, disabledBecause?}` where `verb` is a serialisable union.

Two things follow. A test can assert the exact verb a menu entry produces rather
than running a closure against a mock. And it is the seam between phases —
phase 1's provider collects verbs and displays them, phase 2 maps the same verbs
onto reducers, and no descriptor changes.

### What I learned

- **The layer test earned its keep on its first day**, twice, and both times by
  rejecting something the design document had specified. A dependency rule that
  only a human enforces is one that gets argued with.
- **Building against fixtures is the right constraint, not a limitation.** The
  entire protocol was exercised with no server and no world slice. If it had
  needed either, that would have been evidence of a coupling worth removing.
- The prototype's `P` component is eighty lines and I wrote about two hundred.
  Roughly half the difference is keyboard support and ARIA, which the prototype
  does not have; the rest is comments.

### What was tricky to build

**The pending resolver.** `accept()` returns a promise, so something has to hold
`resolve` until a click arrives. It cannot go in Redux (not serialisable) and it
cannot go in `useState` (setting state with a function value calls it as an
updater). It lives in a `useRef` beside a `useState` flag: the ref carries the
continuation, the flag drives the re-render that makes chips acceptable.

The related decision is refusing nested accepts. If a command is already
accepting, a second `accept()` resolves `null` immediately rather than replacing
the first. Two pending resolvers and one click is a bug I would rather not have
to find, and a command that silently displaced another's request would apply the
right argument to the wrong command.

**`stopPropagation` on both handlers.** Presentations nest — a datum inside a
tile inside a workspace — and without it the outermost wins, which is exactly
backwards: the most specific presentation is the innermost one.

### What warrants a second pair of eyes

- **`CONVERSIONS["doc->source"]` is a stub returning `undefined`.** The entry
  exists to document the intended pair (§8.6) but cannot be implemented until
  phase 2 knows what documents are. It is inert, and a reviewer should confirm
  an inert conversion cannot make a presentation *appear* acceptable — it cannot,
  because `matches` skips a conversion returning `undefined`, but that is worth a
  second reading.
- The `Presentation` keyboard handling treats `Enter` and `Space` identically to
  a click. For a chip whose default verb is destructive that may be too eager;
  none currently are.

### What should be done in the future

- Phase 2 replaces `withPbui`'s verb collector with a store dispatch. The
  provider's `onPerform` is the only seam that changes.
- The remaining eight descriptors (`step`, `geom`, `channel`, `datum`, `cat`,
  `chart`, `tile`, `workspace`) land with the applications that present them.
- `@storybook/addon-vitest` is installed but not yet wired into a CI command, so
  play functions currently run only when a story is opened. Wire it in phase 2.

### Code review instructions

- Read in this order: `pbui/types.ts` (the vocabulary), `pbui/verbs.ts` (the
  seam, and the argument for it), `pbui/Presentation.tsx` (the four click
  behaviours), `pbui/PbuiProvider.tsx` (the resolver ref and nested-accept
  refusal), `pbui/descriptors/field.ts` (the richest descriptor).
- `bun test test/descriptors.test.ts` for the targeting and disabling rules.
- `bun run storybook` → Design System / PBUI / Playground. Press `⌖` beside y
  and watch which chips light up; right-click `data.station` and read the
  disabled entries.

### Technical details

Acceptable set with y accepting, read out of the live DOM:

```
acceptable: data.temp_c (q, values), seq (q, envelope), data.humidity (q, values)
inert:      time (t), data.station (n), id (n), drop (n), stream (n), …
```

Menu on `data.station`:

```
header:   <field> data.station → chart α
enabled:  Map to x · Map to color · Map to facet · Filter on this field ·
          Group by + count · Sort output by (descending) ·
          Read as quantitative in this chart only · Inspect · Add to watchlist
disabled: Map to y  (chart α) — y accepts quantitative
          Map to size (chart α) — size accepts quantitative
```

```
$ bun test
 106 pass  0 fail  across 9 files
```

---

## Step 4: Phase 2 — the store, and the verbs land

Built the `world` and `layout` slices, the verb-to-action mapping that phase 1
designed the seam for, and defensive `localStorage` persistence. 31 new reducer
assertions, all pure, no DOM.

The phase produced one genuine trap and one correction to the plan's dependency
graph. Both were caught by tests written before the code was believed, which is
the argument for writing §16.2's list as a list rather than as prose.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 2 of the guide.

**Inferred user intent:** Serialisable state for documents and layout, so
phase 3 has something to assemble a shell around.

### What I did

- `store/world.ts` — documents, snapshots, pins, watchlist, a capped trace, and
  twenty reducers.
- `store/layout.ts` — workspaces and the five split-tree operations, ported from
  `pbui-gog.jsx:1126-1152`.
- `store/applyVerb.ts` — `Verb` → actions, plus `environmentFor`.
- `store/persist.ts` — versioned, validating `localStorage` persistence.
- `store/index.ts` — both slices wired, restored on load.
- `test/store.test.ts` — 31 assertions.

### What worked

The invariants that are easy to get subtly wrong are now pinned, and several
were worth the trouble:

- `updateNode` returns the **identical** object when nothing changed, and shares
  every untouched subtree. Asserted with `toBe`, because `toEqual` would pass on
  a full rebuild and the whole point is object identity.
- Deleting the active document reassigns `activeDocId`. Leaving it dangling
  makes every ambient verb a silent no-op, which for an interface built on
  ambient verbs is the worst available failure.
- Clearing the last type override leaves `undefined`, not `{}`, so a spec with
  no overrides serialises identically however it got there. Permalinks and
  snapshot equality compare the serialised form.
- Swapping two tiles exchanges `app` and `docId` and leaves the ids in place —
  DR-11 in one assertion.
- `findSecrets` walks the persisted payload for credential-shaped keys and
  `save` **refuses** rather than truncating. Losing a layout is an annoyance;
  writing a bearer token to durable storage, in a payload designed to be shared,
  is not.

### What didn't work

**1. `structuredClone` throws on an Immer draft.**

```
DataCloneError: The object can not be cloned.
  at reducer (src/store/world.ts:317:17)
```

`createSlice` runs reducers under Immer, so `doc.spec` is a Proxy over a draft
rather than a plain object, and a Proxy cannot be structurally cloned. Fixed
with Immer's `current()` to materialise the draft first.

Worth understanding rather than pattern-matching, because **the obvious
alternative does not throw**. A spread produces a shallow copy that aliases
`steps` and `mapping`, so every snapshot silently tracks the document it was
taken from — the exact defect the snapshot tests exist to catch, and one that
would survive review because the code reads correctly. The loud failure was the
lucky outcome.

**2. The guide's dependency graph had `pbui → store` backwards.** The layer test
reported seven violations at once:

```
store/world.ts (store) imports ../pbui/types (pbui) — store may import: model, api
store/applyVerb.ts (store) imports ../pbui/verbs (pbui) — …
```

Checking rather than assuming: nothing in `pbui/` has ever imported the store.
The real direction is `store → pbui` — the store speaks the presentation
vocabulary (`WatchEntry` carries a `PresentationType`, `applyVerb` maps a
`Verb`), never the reverse. Had I "fixed" it by adding `store` to pbui's allowed
list, I would have declared a cycle rather than a dependency.

**3. `preloadedState` broke type inference again**, the same way it did in phase
0 and one level in. A preloaded object whose `layout` key is conditionally
spread makes `configureStore` infer that the layout reducer must accept
`undefined`. Fixed by always supplying both slices.

### What I learned

- **A test that pins object identity catches things equality cannot.**
  `expect(updateNode(t, "absent", f)).toBe(t)` is the only way to state the
  structural-sharing contract, and structural sharing is the whole reason the
  window manager will be able to hold fifteen tiles.
- **When a boundary check fires, check the direction before relaxing the rule.**
  The reflex is to widen the allowed list; here that would have introduced the
  cycle the rule exists to prevent.
- Immer is invisible until it is not. Anything that leaves a reducer — a clone,
  a serialisation, a structural comparison — meets a draft first.

### What was tricky to build

The clone, described above. The second-order problem is that `cloneSpec` has to
work both inside a reducer (draft) and outside one (plain object), since
`restoreSnapshot` reads a stored spec that is itself a draft of stored state.
`isDraft(spec) ? current(spec) : spec` handles both and is worth the branch.

The other sharp edge was `snapshot` needing a timestamp. A reducer that calls
`Date.now()` is not a pure function of its inputs and a state tree that changes
when replayed is not replayable, so the instant is passed in by `applyVerb` and
the reducer stays pure.

### What warrants a second pair of eyes

- **`setDocSource` resets the pipeline and the encoding.** That is deliberate —
  keeping them would name columns the new source may not have, producing a chart
  that refuses to draw with no obvious cause — but it silently discards work if
  a user re-points a document at a similar source. Worth reconsidering once the
  source picker exists and the gesture is real.
- The persisted payload deliberately excludes the trace. If anyone later wants a
  cross-session transcript, it needs its own store and its own cap.

### What should be done in the future

- Phase 3 replaces `withPbui`'s verb collector with `actionsForVerb` + dispatch.
- `selectors.ts` with `makeSelectPipeline(docId)` is not written yet: there are
  no tiles to subscribe. It lands with the tiles in phase 3, and §14.1's warning
  about `createSelector` memoising one argument set applies then.
- A subscription writing `save(world, layout)` on change, debounced, is wired in
  phase 3 when there is a layout worth saving.

### Code review instructions

- `src/store/world.ts` — start at `cloneSpec` and its comment, then the snapshot
  and duplicate reducers.
- `src/store/layout.ts:updateNode` — the identity contract.
- `src/store/applyVerb.ts` — the seam; one case per verb, no dispatch.
- `src/store/persist.ts:findSecrets` and `validate`.
- `bun test test/store.test.ts` — 31 assertions, ~150 ms.

### Technical details

```
$ bun test
 137 pass  0 fail  across 10 files
```

The corrected layer graph:

```
model  →  pbui  →  store  →  atoms → molecules → organisms → pages
   ↘ foundation ↗
```
