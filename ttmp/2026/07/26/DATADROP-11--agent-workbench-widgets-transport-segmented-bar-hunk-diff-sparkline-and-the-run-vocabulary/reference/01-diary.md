---
Title: Diary
Ticket: DATADROP-11
Status: active
Topics:
    - frontend
    - design-system
    - pbui
    - widgets
    - atomic-design
    - trace
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: abs:///home/manuel/Downloads/pbui-agent-workbench(1).jsx
      Note: The 4309-line prototype this ticket draws from; the DSL is at :183, the fold at :284
ExternalSources:
    - /home/manuel/Downloads/pbui-agent-workbench(1).jsx
    - /home/manuel/Downloads/pbui-shell(1).jsx
Summary: The build log for the nine agent-workbench widgets, including what the gap analysis rejected and why.
LastUpdated: 2026-07-26T22:28:53.569080289-04:00
WhatFor: ""
WhenToUse: ""
---


# Diary

## Goal

Record the analysis, design and implementation of nine widgets ported in spirit
(not in code) from two React prototypes, plus the trace transport that is the
only feature-level idea among them.

## Step 1: Read both prototypes, inventory the gap, write the guide

The task began with two prototype files in `~/Downloads` and an instruction to
augment our design system with "widgets we don't have yet (or don't have a close
similar one)". The parenthetical is the whole difficulty: the failure mode of a
port like this is arriving with fourteen components that are restylings of things
already shipped. So the first work was not design, it was subtraction — reading
both prototypes, listing every visual primitive, and then arguing each one *out*
of the list unless it survived two questions.

The result is nine widgets out of roughly thirty candidates, a written record of
the rejections, and a guide that leads with the rejections because they are the
part a reviewer should check hardest.

### Prompt Context

**User prompt (verbatim):** "Now look at 'pbui-agent-workbench(1).jsx' and augment your tile / app / organisms / molecules with widgets we don't have yet (or don't have a close similar one). Create a new docmgr ticket and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then implement it, ALWAYS keep a diary as you work (see skill for format, NEVER FORGET). commit at appropriateintervals."

Followed mid-turn by: "Also do 'pbui-shell(1).jsx'"

**Assistant interpretation:** Compare two external React prototypes against our
design system, identify the visual primitives we genuinely lack, file a ticket,
write an intern-grade analysis/design/implementation guide into it, put that
guide on the reMarkable, and then build it — keeping a diary throughout and
committing per phase.

**Inferred user intent:** The prototypes contain interface ideas worth keeping,
and they will rot in a Downloads folder. The user wants the *ideas* extracted
into the design system as reusable components, with enough written rationale
that the next person understands why each one exists rather than re-deriving it.

**Commit (docs):** pending — this step is the ticket, the guide and the diary.

### What I did

- Located both files. `pbui-agent-workbench(1).jsx` is 4 309 lines;
  `pbui-shell(1).jsx` is 868. Confirmed the `(1)` copies differ from their
  unsuffixed siblings, and used the `(1)` versions as instructed.
- Read the agent workbench's architecture in detail: the `buildIR` DSL
  (`:183-244`), the `fold` simulator (`:284`), the `DS_DEFS` telemetry datasets
  (`:436-484`), the diff engine (`:130-176`), and the chip/app vocabulary
  (`:1798-2700`).
- Read the shell's window manager (`:160-230`).
- Inventoried our own system: 21 atoms, 27 molecules, 27 organisms, 25 apps,
  14 descriptors, 15 presentation types.
- Ran targeted existence checks for each candidate widget rather than relying on
  memory of the tree.
- Created ticket DATADROP-11 with seven phase tasks.
- Wrote the design guide and built it to PDF (14 pages, 0 missing glyphs).

### Why

The instruction to augment "with widgets we don't have yet (or don't have a close
similar one)" is an instruction to do a gap analysis, not a port. Porting
everything would produce duplicates of `Chip`, `Button`, `SelectInput` and
`SplitView`, all of which the prototype also has under different names.

### What worked

**The existence checks caught two would-be duplicates before they were written.**
I had the shell's Blender-style sticky dividers on the list — snap to 0.25, 1/3,
0.5, 2/3, 0.75 within a 0.022 threshold, four visual drag states — and then found
the whole thing already implemented in `SplitView.tsx:23-44` with `snapRatio` in
`store/layout.ts`. Same for drag-to-swap-or-dock, already in `Tile/useDrag.ts`.
Neither is a near-miss; they are the same feature.

**The negative checks were the useful ones.** `grep` for
`progressbar|Meter|ProgressBar` returns nothing across the entire `ui/src` tree,
which is how I know a proportional bar is a real gap rather than something I
failed to remember. Likewise `sparkline|MiniPlot` — nothing.

### What didn't work

**The reMarkable upload failed and is still outstanding.** Two errors in
sequence:

```text
ERROR: 2026/07/26 22:33:55 main.go:79: failed to build documents tree, last error: failed to mirror was not ok: request failed with status 400
ERROR: 2026/07/26 22:34:02 auth.go:53: failed to create user token from device token request failed with status 429
```

The 400 on `mirror` came first, twice, for `rmapi mkdir` and `rmapi put`. The
429 on the subsequent `rmapi ls` is a rate limit, which is a consequence of the
retries rather than the original cause. The PDF is built and correct; only the
transfer is pending. Retrying after a back-off rather than hammering it.

**The first PDF build had two missing glyphs**, which under the DATADROP-7
playbook is a build failure rather than a warning:

```text
[WARNING] Missing character: There is no ⏮ (U+23EE) (U+23EE) in font DejaVu Sans Mono/OT:script=la
[WARNING] Missing character: There is no ⏭ (U+23ED) (U+23ED) in font DejaVu Sans Mono/OT:script=la
```

Both are transport-control glyphs in the `TransportBar` ASCII screenshot — that
is, the missing characters were in the section about the control they depict,
which is exactly the case the playbook warns is easy to miss on a visual check.
Resolved by the playbook's own method: `fc-list ':charset=23EE' family` to find a
font that has the codepoint, confirm with `grep -cx 'Noto Sans Symbols2'`, then
map only those two codepoints. Rebuild reports 0 missing, 14 pages.

### What I learned

**The prototype's important idea is not a widget.** It is that every tile is a
pure function of `fold(cursor, overrides)` over an event timeline, and that user
manipulations are *overrides applied during the fold* rather than mutations
outside it — which is why reverting a hunk survives scrubbing and propagates
downstream. That is an architecture, and it maps onto something we already have
(the verb trace) that we currently treat as a write-only log.

**Our design system is further along than the shell prototype.** That was not
the expected result. The shell is the ancestor of our `Presentation`, `Tile` and
`SplitView`, and every shell-level feature I checked was already present, in some
cases with more care than the original — our divider has an ARIA
`role="separator"` with `aria-valuenow` and keyboard nudging, which the prototype
does not.

### What was tricky to build

**Deciding what "close similar" means, for `MoreBar` and `KindLegend`.** Both
have an adjacent component in our tree and both survived anyway, for reasons
worth recording because they are the two most arguable calls in the ticket.

`TruncationNotice` versus `MoreBar`: ours *states* that rows were dropped; the
prototype's is a *control* that reveals them. A passive notice and an active
disclosure are different components even though they occupy the same slot.

`Legend` versus `KindLegend`: ours maps categories to chart colours for a chart.
The prototype's maps kinds to counts and totals with a bar each, and is not
attached to a chart at all. Same visual family, different job.

I could be argued out of `KindLegend` by someone who wanted to generalise
`Legend` instead. The reason I did not is that `Legend` is coupled to the
encoding layer, and widening it to serve non-chart callers would drag chart
concepts into places that have no chart.

**Scoping the transport honestly.** The prototype scrubs a simulated run; we
have a real Redux store whose reducers mutate. Making our store a fold over the
verb log is a rewrite of `applyVerb.ts` and every reducer. I scoped phase 6 to
review-only — the cursor selects and explains an entry, it does not roll the
world back — and made the on-screen note about that limitation part of the
deliverable rather than a nicety, because an interface that looks like time
travel and is not is worse than one that says what it is.

### What warrants a second pair of eyes

- **The nine-versus-thirty cut.** Section 3 of the guide lists what I rejected
  and why. If any rejection is wrong, that is a component we should be building
  and are not.
- **`KindLegend` specifically**, per above — the weakest of the nine.
- **The decision not to add `ctxseg` and `sem` presentation types.** They appear
  in the prototype and I deliberately left them out, because nothing in our
  product produces those objects and a declared type with no descriptor is the
  exact defect DATADROP-4 left behind and DATADROP-8 had to repair. If we later
  build an agent-telemetry app, they come back.

### What should be done in the future

- **DATADROP-12: make the store a fold over the verb log**, which turns phase
  6's review-only transport into real time travel. Written up as a named
  follow-up in the guide rather than left implicit.
- **The telemetry-as-datasets trick.** The prototype exposes its own behaviour
  as tidy datasets and feeds them to the ordinary charting layer, so the agent's
  behaviour becomes chartable by machinery that already exists. We could do the
  same with the trace. Out of scope here; worth a ticket.

### Code review instructions

- Start with the guide's section 3 (the gap analysis table) — that is the claim
  the rest depends on.
- Verify a rejection by checking the named file, e.g. `SplitView.tsx:23-44` for
  the snapping claim.
- The PDF is at `DATADROP-11-agent-workbench-widgets.pdf` in the ticket
  directory; `grep -c 'Missing character' /tmp/pandoc11.log` is 0.

### Technical details

Gap analysis, condensed:

| Prototype widget | Our equivalent | Verdict |
|---|---|---|
| Sticky snapping dividers | `SplitView` + `snapRatio` | already have, incl. drag states |
| Drag tile to swap / dock | `Tile/useDrag.ts` | already have, edge vs centre |
| `Tag` | `Chip`/`TypeBadge`/`RoleBadge`/`ScopeChip` | have it four times |
| `Btn`/`Sel`/`Num` | `Button`/`SelectInput`/`TextInput` | have, and enforced |
| `StepChip`/`TaskChip` | `Chip` + tone | a prop |
| `MoreBar` | `TruncationNotice` | **different** — notice vs control |
| `Meter`/`Sparkline`/`CodeLine` | — | **absent**, verified by grep |
| `SegmentedBar` | — | **absent**, nothing composes presentations spatially |
| `DiffHunk` | `SpecDiff` | **different** — object diff vs text diff |
| `TransportBar` | — | **absent**, no cursor-into-history concept |

The PDF invocation is the DATADROP-7 playbook plus two lines:

```tex
\newunicodechar{⏮}{{\symbolfont ⏮}}
\newunicodechar{⏭}{{\symbolfont ⏭}}
```

## Step 2: The formatters and the three atoms

Phase 1 is the boring foundation, and it produced two findings worth more than
the components did. The first is that `model/format.ts` already existed — I was
about to create it — and its docstring already explained the layer reasoning
for why shared formatting lives in `model/` rather than in an app. Appending to
it rather than creating a rival was the whole of the work; noticing was the
part that mattered.

The second is that the "restore" half of break-verification has a failure mode
nobody had written down, and it bit me on the first attempt.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 1 of the plan — the shared number
formatting plus `Meter`, `Sparkline` and `CodeLine`, each with a CSS module, a
barrel and stories.

**Inferred user intent:** Working components in the design system, not a
document describing components.

**Commit (code):** `f6e9a54` — "DATADROP-11 phase 1: the formatters and three atoms"

### What I did

- Read `model/format.ts` before writing it, found `formatBytes` already there,
  and appended `clamp`, `kfmt`, `msfmt`, `pctfmt` instead of replacing the file.
- Found a private `clamp` in `model/plot.ts:102` and pointed it at the shared
  one, removing the duplicate.
- Built `Meter`, `Sparkline`, `CodeLine` — component, CSS module, barrel,
  stories each — and added all three to `components/atoms/index.ts`.
- Broke two guards, confirmed the failures, restored.

### Why

`kfmt` and `msfmt` were about to be reinvented three times, exactly as the
prototype reinvented them (`pbui-agent-workbench(1).jsx:41-47` has `fmt`,
`msfmt` and `kfmt` side by side). One implementation means one place to argue
about the rounding rules.

### What worked

**Reading before writing caught a would-be duplicate file.** `model/format.ts`
existed, with a docstring explaining that it lives in `model/` because
`components/molecules` may not import `apps` and the uploader was simply the
first thing to need it. Overwriting it would have deleted `formatBytes` and
broken three importers.

**Both guards fired precisely, naming the offending thing:**

```text
+   "atoms/Meter"
(fail) story coverage > every component directory has a story

+   "components/atoms/Meter/Meter.module.css: var(--pbui-tone-invented)"
(fail) design tokens resolve > every var(--pbui-…) in a stylesheet names a declared token
```

### What didn't work

**`git checkout --` did not restore the second break, and I nearly missed it.**
The sequence was: edit `Meter.module.css` to use an undeclared token, run the
suite, watch it fail correctly, then `git checkout -- <path>` to restore. That
last step printed:

```text
error: pathspec 'ui/src/components/atoms/Meter/Meter.module.css' did not match any file(s) known to git
```

The file was new and untracked, so there was no committed version to restore
from and the break stayed in the tree. The suite exited 1 immediately
afterwards, which is the only reason I noticed — had I broken something in an
already-committed file *and* something in a new one in the same sweep, the
checkout would have "worked" and I would have committed a live defect while
believing I had cleaned up.

The rule this yields: **restoring a break in an untracked file needs an edit,
not a checkout**, and the way to be sure either way is to re-run the suite after
restoring rather than assuming the restore worked.

**`--pbui-font-mono` is not a token.** I reached for it out of habit for
`CodeLine`. The whole design system's base `--pbui-font` is already IBM Plex
Mono, so there is no separate mono token and there does not need to be. Caught
by reading `styles/tokens.css` rather than by the test, though
`tokens-used.test.ts` would have caught it a minute later.

**Biome rejected the first `Meter.module.css`** with
`lint/style/noDescendingSpecificity` at :30, because `.track` was declared after
`.inline .track` and `.row .track`. It is right to: a reader scanning for what
`.track` does should meet the base rule before the overrides.

### What I learned

The `alarm` prop on `Meter` started as unconditional threshold colouring, copied
from the prototype's context bar, and that is wrong for a general-purpose atom.
The prototype's only meter measures a token budget, where "nearly full" is
genuinely bad. Ours will also measure things like lesson progress, where nearly
full is *good* — and a learner being told in red that they are running out of
tutorial is an interface actively lying about its own domain. Opt-in, defaulting
off.

### What was tricky to build

**The `Sparkline` domain has to include the threshold.** The obvious
implementation takes min and max of the data, which puts a budget line above
every observed value off the top of the box, where it is silently not drawn.
That is the same class of defect as the missing PDF glyphs — the thing you most
need to see is the thing that disappears. Fixed by including `threshold` in the
domain candidates.

**A flat series divides by zero.** `(v − lo) / (hi − lo)` with `hi === lo` is
NaN for every point, and an SVG path full of NaN renders nothing at all with no
error in the console. `|| 1` on the span, and a story that pins it.

### What warrants a second pair of eyes

- **`Meter`'s `tone` is ignored while alarming.** A bar cannot simultaneously
  say "this is the `step` colour" and "this is dangerous"; I chose dangerous.
  Someone might reasonably want the tone to win and the alarm to show elsewhere.
- **`CodeLine` renders a non-breaking space for an empty line.** It is the
  standard fix, but it means the rendered text differs from the source text by
  one character, which would matter to anyone copying out of the DOM.

### What should be done in the future

Nothing new from this phase. Phases 2-7 continue as planned in the guide.

### Code review instructions

- `ui/src/model/format.ts` — the appended half. Check the rounding cutoffs.
- `ui/src/components/atoms/Meter/Meter.tsx:54` — the clamp and the NaN path.
- `ui/src/components/atoms/Sparkline/Sparkline.tsx:44-47` — the domain
  including the threshold, and the `|| 1` span.
- Storybook: `Atoms/Meter → HostileInput` and `Atoms/Sparkline → Degenerate`
  are the two that would show a defect visually.

### Technical details

Verification, verbatim:

```console
$ mv ui/src/components/atoms/Meter/Meter.stories.tsx /tmp/ && bun run --cwd=ui test
+   "atoms/Meter"
(fail) story coverage > every component directory has a story
 1 fail

$ # var(--pbui-tone-neutral) -> var(--pbui-tone-invented)
+   "components/atoms/Meter/Meter.module.css: var(--pbui-tone-invented)"
(fail) design tokens resolve > every var(--pbui-…) in a stylesheet names a declared token
 1 fail

$ # after restoring both
 362 pass, 0 fail, 7635 expect() calls
```

## Step 3: Three molecules, and three defects the tests could not see

Phase 2 built `MoreBar`, `JsonBlock` and `KindLegend`, and substituted
`JsonBlock` into `InspectorPanel` so there is one JSON renderer rather than two.
The components are small. The interesting part is that the phase produced three
defects and only one of them was caught by a test — the other two were found by
measuring the rendered DOM after the suite was already green, which is the
second of this repository's two verification conventions and the one that keeps
earning its place.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 2 of the plan.

**Inferred user intent:** As Step 1.

**Commit (code):** `42d36dd` — "DATADROP-11 phase 2: MoreBar, JsonBlock, KindLegend -- and three defects"

### What I did

- Built the three molecules with CSS modules, barrels and stories.
- Replaced the inlined `<pre>` at `InspectorPanel.tsx:38` with `JsonBlock`, and
  deleted `InspectorPanel.module.css`, which had nothing left in it.
- Gave `JsonBlock` a `maxHeight` of `number | "none"`.
- Fixed three defects, below.

### What worked

**`no-raw-controls.test.ts` caught `MoreBar` on its first run**, naming the file
and the line and saying what to use instead:

```text
+   "components/molecules/MoreBar/MoreBar.tsx:17 — use Button or IconButton from components/atoms"
```

That is the guard genre working exactly as designed: I wrote a hand-rolled
`<button>` because the prototype's `MoreBar` is a clickable `<div>`, and the
test refused it before review.

**`stories.test.ts` caught all three story titles.** Molecules and organisms use
a `Component Library/` prefix; atoms, foundation and layout use `Design System/`.
I had assumed one convention covered all five and was wrong about three files.

### What didn't work

**`Meter` rendered `+Infinity` as an empty bar.** The guard was
`Number.isFinite(fraction) ? clamp(…) : 0`, which folds NaN and both infinities
into the same answer. They are not the same fact. NaN is `0/0` — nothing
measured yet — and an empty bar is honest. `+Infinity` is `x/0` with `x > 0`:
something used against a budget of nothing, which is unbounded overflow. An
empty bar there states "nothing used" about the one case where usage is
infinite. Measured:

```text
before: {label: "Infinity", valuenow: "0",   fillPct: 0}
after:  {label: "+Infinity …", valuenow: "100", fillPct: 100}
```

I had written the `HostileInput` story specifically to exercise this and still
did not see it, because the story renders four bars and three of them were
right. Reading the *numbers* found it; looking at the picture would not have.

**`KindLegend`'s `aria-label` never reached the DOM.** I passed it to `Stack`
with `as="ul"`. `Stack` accepts a fixed prop set — `children, direction, gap,
align, justify, wrap, grow, as, className` — and does not spread the rest, so
the attribute was dropped silently. TypeScript did not object. The rendered
element carried classes and nothing else:

```text
firstUlAttrs: ["class=\"_stack_1ilcn_8 _column_1ilcn_17 _gap-1_1ilcn_27 _list_1avd5_8\""]
```

The `<ul>` is now written out directly with its own flex column, and the
component owns its own attributes. **The general lesson is worth more than the
fix:** passing an accessibility attribute through a layout component that does
not spread props fails silently, in a way neither the compiler nor the test
suite can see. Any future `aria-*` on a `Stack`, `Surface` or `Toolbar` has the
same problem.

### What I learned

**Both conventions were needed, and they caught different things.** The
structural tests caught a rule violation and a naming violation — facts about
the source. The DOM measurement caught two facts about the *rendered result*
that no amount of source inspection would reveal. Neither convention subsumes
the other, which is the argument for keeping both.

**Measuring beats looking.** The last two cycles describe "read the rendered
output" as a visual check. Two of three defects here were found by computing
properties in the page — fill widths as a percentage of track width, the
attribute list of an element, row heights and contrast ratios — rather than by
looking at a picture. A screenshot of the `HostileInput` story shows four bars;
three are correct and the fourth is wrong only if you already know what it
should be. The number says so directly.

### What was tricky to build

**`InspectorPanel` wanted no height cap, and `Infinity` is not a CSS length.**
The first substitution passed `maxHeight={Number.POSITIVE_INFINITY}`, which
produces `max-height: Infinitypx` — invalid, silently ignored, and therefore
accidentally correct, which is the worst kind of working. The prop now accepts
`number | "none"` and the panel passes `"none"`, so the intent is in the type
rather than in a coincidence.

### What warrants a second pair of eyes

- **`Stack` silently dropping unknown props** is a trap that will catch someone
  else. It might deserve a rest-spread, or a documented refusal. Out of scope
  here, but I would rather it were decided than left.
- **`MoreBar`'s full-width geometry lives in the molecule's wrapper**, stretching
  the `Button` from outside. The alternative is a `fullWidth` prop on the atom,
  which one caller wants and every other would ignore. I think the wrapper is
  right; it is a judgement call.

### What should be done in the future

- Consider a structural test asserting that `aria-*` props are not passed to
  layout components that do not forward them. It is checkable — the layout
  components are a known, short list.

### Code review instructions

- `ui/src/components/atoms/Meter/Meter.tsx:54-65` — the NaN / ±Infinity split.
- `ui/src/components/molecules/KindLegend/KindLegend.tsx:48-53` — why the `<ul>`
  is not a `Stack`.
- `ui/src/components/organisms/InspectorPanel/InspectorPanel.tsx` — the
  substitution, and the deleted stylesheet.

### Technical details

Rendered-DOM verification after the suite was green:

```text
KindLegend/SortsItself
  ariaLabel:           "deliberately shuffled input"
  renderedOrder:       ["file", "tool", "system", "memory"]   (input was shuffled)
  barsShareLeftEdge:   true
  barsShareWidth:      true
  worstContrast:       {t: "8.4k · 12", ratio: 5.14}

CodeLine/BlankLines
  allRowsHaveHeight:   true
  distinctHeights:     [11]        ← the two blank rows are 11px like the rest
  guttersAlignWithText: true

Meter/HostileInput
  NaN         valuenow 0   fillPct 0
  +Infinity   valuenow 100 fillPct 100
  1.4         valuenow 100 fillPct 100
  -0.3        valuenow 0   fillPct 0
```

## Step 4: SegmentedBar, and the overflow claim that was not true

Phase 3 built the widget I said I would build first if I could only build one.
It went smoothly. The finding was not in the code but in the prose I wrote
around it: the story asserted a property the component does not have, and I only
noticed by measuring the rendered geometry of the case the prose was about.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 3 — `SegmentedBar`.

**Inferred user intent:** As Step 1.

**Commit (code):** `e2dac48` — "DATADROP-11 phase 3: SegmentedBar, and an honest note about overflow"

### What I did

Built the component, its CSS module, barrel and six stories, and measured the
degenerate and overflow cases in the browser.

### What worked

**Flex weights were the right geometry.** Percentage widths accumulate rounding
error across many segments and leave a visible gap at the right edge, which on a
bar whose whole job is "these add up to the whole" reads as a defect. At 60
segments the measured widths distribute cleanly.

**`renderSegment` matched an existing pattern rather than inventing one.** I had
planned it as a novel escape hatch and then found `Legend` already does exactly
this with `renderEntry`, documented as DR-38. Using the same shape means one
idea in the codebase rather than two.

### What didn't work

**The overflow story asserted something false.** I wrote:

> The border turns and the bar says OVER, because the alternative — silently
> renormalising so it still fits — would draw an over-budget state identically
> to an exactly-full one.

Then measured the overflow story: three segments of 774 + 378 + 203 px inside a
1355px bar. **That is renormalising.** Flex distributes the available width in
proportion to the weights and has no way to express "wider than the container",
so an over-budget bar has exactly the same segment geometry as an exactly-full
one. The red border and the OVER badge carry the entire signal.

The prose was not describing a design decision. It was describing a design
decision I had imagined making. Both the story and the component now say what is
actually true, including that a caller needing overflow legible *as size* wants a
different widget.

This is the second time in this project that a story's prose has contradicted
what the story renders, and both times the prose was the confident part.

### What I learned

**Writing the explanation before measuring the result produces authoritative
fiction.** The sentence was well-formed, plausible, and would have survived
review — a reviewer reading "we do not renormalise" has no reason to open a
browser and check. The measurement took thirty seconds.

### What warrants a second pair of eyes

- The 2px minimum segment width. Below it a segment is invisible, and an
  invisible segment is indistinguishable from an absent one — so the floor is
  right, but it means the bar stops being proportional in the tail, and the
  `Density` story says so rather than hiding it.

## Step 5: DiffHunk, and a split-view algorithm that was quietly wrong

Phase 4 produced the most serious defect of the ticket, in code rather than
prose, and it came from copying the prototype's structure without checking it.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 4 — `DiffHunk`, unified then split.

**Inferred user intent:** As Step 1.

**Commit (code):** `906dc05` — "DATADROP-11 phase 4: DiffHunk, and a wrong split-view algorithm caught"

### What I did

- Built `DiffHunk` with unified and split rendering, a header, and the row cap
  behind `MoreBar`.
- Found the split pairing wrong, rewrote it, extracted it as `pairRows()`, and
  pinned it with seven cases in `ui/test/diff-pairing.test.ts`.
- Fixed the blank-cell height.

### What didn't work

**The split-view pairing was wrong.** The algorithm I wrote — and the one the
prototype uses at `pbui-agent-workbench(1).jsx:2280-2284` — pushes context rows
to both sides, removals to the left, additions to the right, then renders to the
longer column. It passes every balanced hunk.

On an unbalanced one the two columns advance at different rates and nothing
re-synchronises them. One removal answered by three additions leaves the left
column two entries short, so **every context row after that change faces an
addition instead of facing itself.** Measured in the browser on the six-row
example this file ships:

```text
{ l: {op: "context", text: "}"},
  r: {op: "add", text: "if (!s || s.expiresAt < Date.n"} }
```

The closing brace sat opposite an unrelated conditional. Both columns held the
right rows in the right order, so the output reads as a completely plausible
diff while asserting that unrelated lines correspond — which is the worst thing
a diff can do, because the reader's entire reason for choosing the split view is
to see correspondence.

**The blank cell was the wrong height.** `min-height: 1.4em` measured 16px
against a `CodeLine`'s 11px, so every unpaired row drove the two columns a
further 5px apart. Alignment is the whole value of a side-by-side view.

### What I learned

**Copying a prototype's structure carries its bugs, and the bugs are in the
parts that look too simple to check.** I read `diffLines` carefully — it is a
real LCS with head/tail trimming and it is correct — and skimmed the eight-line
pairing beneath it because eight lines of pushing into two arrays cannot be
wrong. The complicated part was fine. The simple part was not.

**Extracting the logic was worth more than fixing it.** The rewrite could have
stayed inside the component, verified by the browser measurement that found it.
Pulling `pairRows` out as a pure function made it testable with literals, and
that test is what will catch the next person who "simplifies" it back.

### What was tricky to build

The correct rule is not obvious from first principles: a context row is a
**synchronisation point**. Consecutive removals and additions accumulate into
blocks; a context row, or the end of the hunk, flushes them with the shorter
side padded, then lands on both sides at the same index. Within a block the
pairing stays positional, which is what makes a substitution read as a
substitution rather than as a deletion followed by an unrelated insertion.

### What warrants a second pair of eyes

- **`pairRows` pads within a block only.** Two adjacent change blocks separated
  by a context row pad independently, which is correct, but means a hunk with no
  context rows at all pads once across the whole thing. That is the right
  behaviour and it is worth someone agreeing.

### Code review instructions

- `ui/src/components/molecules/DiffHunk/DiffHunk.tsx:89-144` — the docstring
  explains the wrong version before the right one, deliberately.
- `ui/test/diff-pairing.test.ts` — seven cases. The first is the regression.

### Technical details

The guard verified by restoring the naive algorithm:

```text
error: a context row faced something other than itself — the columns have drifted
+   "}  ||    if (!s || s.expiresAt < Date.now()) return null;"
(fail) split-view pairing keeps the two columns in step > a context row always faces itself
(fail) split-view pairing keeps the two columns in step > the closing context row is the last pair on both sides
```

After restoring the correct version: 369 pass across 27 files.

Geometry, measured after the fix — every pair the same height, every context
row facing itself:

```text
contextRowsAlwaysFaceThemselves: true
allPairHeightsEqual: true
heights: [11]
```

## Step 6: The transport, and a story that threw while the suite was green

Phases 5 and 6 gave the trace a presentation type and a cursor. The widget work
was straightforward. The finding was a class of defect this repository's test
suite **structurally cannot see**, and it took opening a browser to notice.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phases 5 and 6 — the `traceEntry` type and
`TransportBar`, wired into `TracePanel`.

**Inferred user intent:** As Step 1.

**Commit (code):** `79a5364` — "DATADROP-11 phases 5+6: traceEntry, TransportBar, and a scrubbable trace"

### What I did

- Added `traceEntry` to the union, wrote its descriptor, registered it, added a
  tone token.
- Built `TransportBar` and wired it into `TracePanel` with a `reviewing` state.
- Allow-listed the `<input type=range>` in `no-raw-controls.test.ts`, with a
  reason.

### What didn't work

**Every `TracePanel` story threw at render time while `bun test` reported 369
passing.** The story file declared `parameters: { pbui: false }`, which was
correct while the panel contained no presentations. Making the current entry a
`<traceEntry>` made the provider mandatory:

```text
Error: usePbui outside a PbuiProvider — a presentation cannot be live without one
    at usePbui (src/pbui/usePbui.ts:14:9)
    at Presentation (src/pbui/Presentation.tsx:9:15)
```

`stories.test.ts` asserts that every component directory *has* a story with the
right title prefix. It does not render one. So a story can be broken — not
subtly wrong, but throwing — and every structural guard in the repository stays
green. **This is a hole in the genre, not an oversight in one test**, and it is
worth saying plainly: the structural tests check that documentation exists, and
nothing checks that it works.

### What I learned

**The guide told me to use an array index and the guide was wrong.** Section 6
specified `traceEntry` as `{ index: number }`. `TRACE_CAP` in the world slice
drops entries from the front, so an index silently comes to mean a different
entry once the cap is reached, and a verb carrying `{index: 3}` would act on
whatever had slid into position 3. The value is `{ seq }`. I wrote that guide
four hours earlier and still had to catch it by reading the slice.

### What was tricky to build

**`reviewing` is `number | null`, and the null is load-bearing.** A bare number
cannot distinguish "the reader is looking at the last entry" from "the reader is
following the tail and the last entry happens to be current". Without the
distinction the auto-scroll fights a reader who has scrubbed backwards — which
is exactly the defect DATADROP-7 hit with the tour's auto-advance, arrived at
from a different direction.

### What warrants a second pair of eyes

- **The review-only scope.** The note on screen says the transport does not roll
  the workbench back and names DATADROP-12. If anyone thinks shipping a control
  that looks like time travel without being it is worse than not shipping it, I
  want to hear that before it reaches users.
- **The `<input type=range>` exemption.** One caller. If a second transport
  appears it should become a `RangeInput` atom, and the allow-list entry says so.

## Step 7: The break sweep, and two silent guards

The last phase is the one the guide says is most likely to be skipped. It found
two guards that were not guarding, and the test written to close them found a
defect that had been shipping since DATADROP-5.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Phase 7 — barrels, story coverage, and the break
sweep with verbatim failures recorded.

**Inferred user intent:** As Step 1.

**Commit (code):** `d835a76` — "DATADROP-11 phase 7: descriptor coverage, and a tone that never existed"

### What I did

Broke each guard this ticket touched, one at a time, and recorded what happened.
Two produced nothing. Wrote `ui/test/descriptor-coverage.test.ts` to cover both,
fixed what it found, and verified it by breaking all three of its assertions.

### What didn't work — which is the point of the sweep

**Removing a descriptor from the registry failed nothing.** Zero tests. That is
precisely the DATADROP-4 defect: `tile` and `workspace` were declared
presentation types wrapped in real `<Presentation>` elements with no descriptors
behind them, so right-clicking a tile said "no verbs for this object yet" for
two tickets. DATADROP-8 repaired the instance and nothing prevented the class.

**Deleting a tone token while keeping the reference failed nothing.**
`tokens-used.test.ts` scans stylesheets, and a descriptor's `tone` is a token
reference written in TypeScript. The earlier break in step 2 — putting
`var(--pbui-tone-invented)` in a `.module.css` — passed cleanly and gave me
false confidence that token references were covered. They are covered *in CSS*.

### What worked

**The new test earned itself on its first run**, which is the best available
outcome for a structural guard:

```text
upload: tone names --pbui-tone-datum, which is not declared
```

`upload.ts` has named `--pbui-tone-datum` since DATADROP-5 (`39e607e`) and that
token has never existed. An undeclared `var()` with no fallback resolves to
nothing, silently, so every upload chip has rendered with no tone for two
tickets and nobody noticed — including me, three hours earlier, when I read that
exact file to inventory the descriptors.

### What I learned

**A break sweep is not a formality and "the tests pass" is not evidence.** Three
of the six things I broke across this ticket produced no failure at all, and
each of those was a place I would have said, unprompted, that we had coverage.

**One break passing does not generalise to its class.** Step 2's token break
went through a stylesheet and passed; I concluded token references were guarded.
They were guarded in the one medium I happened to test. The lesson is to break
the specific mechanism you are relying on, not a cousin of it.

### What should be done in the future

- **Story rendering is unguarded.** A story that throws at render is invisible to
  every test here. A smoke test that mounts each story would close it; Storybook
  ships a test-runner for exactly this. Worth its own ticket — it would have
  caught the `pbui: false` defect in step 6 automatically.

### Technical details

The sweep, before and after:

```text
BEFORE the new test
  remove traceEntry from the registry     -> 0 fail   ← silent
  delete --pbui-tone-traceEntry           -> 0 fail   ← silent
  remove the TransportBar allow-list      -> 1 fail   ✓ names file:line

AFTER
  remove traceEntry from the registry     -> "every declared presentation type
                                              has a descriptor" fails, naming it
  delete --pbui-tone-traceEntry           -> "every descriptor's tone names a
                                              declared token" fails, naming both
  exempt a type that has a descriptor     -> "every exemption is still exempt" fails
```

Final: 374 tests across 28 files, typecheck clean, biome clean over 502 files.
