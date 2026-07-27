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
