---
Title: Diary
Ticket: DATADROP-13
Status: active
Topics:
    - frontend
    - design-system
    - charts
    - plot-engine
    - geoms
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-27T10:00:46.912952316-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Record the analysis and implementation of the three coordinate-system gaps found
in the basketball prototype: reference lines, radar, and marks on a spatial
backdrop.

## Step 1: Read the prototype for ideas, not for shapes

The previous ticket's gap analysis failed by comparing prototypes to our system
*by shape*, which is blind to ideas — a listener and a log look identical — and
it cost a whole widget. So this pass used a different rule, written into the
guide before any reading started: **for each app, find the one line that makes
it non-obvious; if there is none, it is a demo.**

That rule did real work. It rejected five of nine apps in a sentence each, and
it caught three things a component-list scan would have called "charts".

### Prompt Context

**User prompt (verbatim):** "Now handle @~/Downloads/pbui-basketball.jsx"

**Assistant interpretation:** Give this prototype the same treatment as the
previous two — analyse it against our design system, file a ticket with an
intern-grade guide, upload the guide to the reMarkable, then implement, keeping
a diary and committing per phase.

**Inferred user intent:** A third prototype worth mining before it rots in a
Downloads folder. "Handle" is short because the pattern is established.

**Commit (docs):** pending — this step is the tickets, the guide and the diary.

### What I did

- Read all 984 lines, per app, looking for the non-obvious line.
- Checked our plot engine's actual capabilities rather than recalling them:
  four geoms, five channels, three Mark kinds, cartesian only.
- Verified the two architectural claims in the prototype's own header and found
  **both already true of us** — accept-from-any-tile, and two tiles tracking one
  state — so neither produced work.
- Created DATADROP-13 with four phases, and DATADROP-12 (below).
- Wrote the guide, built it to PDF (7 pages, 0 missing glyphs), uploaded it.

### What worked

**The one-non-obvious-line rule.** `LeadersApp` is a sortable table,
`StandingsApp` is win% bars, `WatchlistApp` is a list of presentations — three
rejections in three sentences, each checkable. And it found `EfficiencyApp`'s
value, which is not "a scatter" but two dashed lines at the league means that
turn a cloud into four named quadrants.

**Checking capability instead of recalling it.** I would have said we could
draw a reference line. `grep` for `strokeDasharray|refLine|referenceLine` across
`ui/src` returns nothing, and `Mark` has exactly three kinds.

### What didn't work

**I had shipped a dangling reference into the product.** `TracePanel.tsx:101`
renders the string *"It does not roll the workbench back (see DATADROP-12)"* to
users, and DATADROP-12 did not exist — I named it in prose last ticket and never
created it. Anyone following that pointer would have found nothing.

Fixed by creating DATADROP-12 as a real ticket for the fold, and taking
DATADROP-13 for this work. The tempting shortcut — reuse 12 for basketball,
since it was unclaimed — would have made the on-screen note point at an
unrelated ticket, which is worse than pointing at nothing.

**The reMarkable upload worked first try**, which is only notable because five
consecutive attempts failed yesterday. The fix was the rmapi bump from the end of
DATADROP-11.

### What I learned

**Two of the prototype's headline claims were already true of us, and checking
cost five minutes.** The header advertises accept-from-any-tile and
"two tiles = two views of one state" as its distinguishing features. Both
describe our system. Had I taken the header at face value I would have written a
phase for each.

The second is worth stating precisely, because the mechanisms differ and ours is
the more capable one. The prototype gets cross-tile propagation by making app
state a world-level singleton — `w.focus` is one player, and every tile reads it,
so two Trends tiles necessarily show the same thing. We get it by binding tiles
to *documents*: two tiles on one document track each other, and two tiles on
different documents do not. Their version cannot express the second case.

### What was tricky to build

Deciding that radar is **not a geom**. It is the obvious framing and it is wrong:
a geom is a mark shape drawn inside a coordinate system, and point/line/bar/area
all consume the same `px`/`py` from the same scales. Radar has no x, no y, no
`padL`, no axis ticks. Adding it as a fifth geom would put a branch inside
`buildPlot` that invalidates every cartesian assumption around it. It is a
sibling function, `buildRadar`, with the same refusal contract.

### What warrants a second pair of eyes

- **The three-gap cut.** §1 of the guide lists every rejection with its reason.
  A wrong rejection is a component we should be building and are not.
- **Whether `BackdropPlot` is a real generalisation or one example wearing a
  costume.** I argued it from a court to floor plans, rack elevations and wafer
  maps. We have no such data today, and that is the honest counter-argument.

### What should be done in the future

- **Spatial binning.** The shot chart's zone summary (`AT RIM 68% 15/22`) is an
  aggregation by *position* — distance from the hoop. Our pipeline summarizes by
  category and has no spatial bin. Out of scope, recorded.

### Code review instructions

- Guide §1's rejection table is the claim everything rests on.
- Verify one rejection: `Meter` (DATADROP-11) versus `StandingsApp`'s win% bars.
- The PDF is `DATADROP-13-coordinate-systems.pdf`; `grep -c 'Missing character'`
  on the build log is 0.

## Step 2: Reference lines, and a channel the engine did not have

Phase 1 was meant to be the easy one — twenty lines of geometry, no new
coordinate system. It was, and then it ran into a limitation in the engine that
had been there since DATADROP-3 and had never been exercised.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 1 — reference lines in the plot engine.

**Inferred user intent:** As Step 1.

**Commit (code):** `d022e5c` — "DATADROP-13 phase 1: reference lines, and a notices channel"

### What I did

- `ReferenceLine` in `model/chart.ts`, `references?` on `ChartSpec`.
- A `rule` Mark kind, domain extension for both axes, emission per panel.
- Rendering in `ChartPanel`, with intent-dependent stroke and a clipped marker.
- Eight tests asserting coordinates, and three break-verifications.

### What worked

**The discriminated union did the work.** Adding `rule` to `Mark` broke
`ChartPanel` at compile time and named the three properties it did not handle —
`w`, `h`, `fill`. No chance of an unhandled kind silently rendering nothing,
which is the failure mode a `switch` with a `default` would have allowed.

**Emitting rules before data marks** so points draw on top. A rule painted over
a point hides the observation it exists to contextualise. Asserted by index, and
verified by sorting rules last and watching the test fail.

### What didn't work

**There was no channel for "drew, but partially".** The eighth test — an x
reference on a banded axis, which has no numeric position — failed. I had pushed
to `problems`, and the success path hardcodes `problems: []`, so the message
never left the function.

Fixing that by returning the accumulated `problems` on the success path would
have been much worse than the bug. `ChartPanel` treats `problems.length > 0` as
*nothing was drawn* and renders a refusal **instead of** the chart. A partial
failure in that field would have hidden a chart that exists and drew correctly.

So `notices: string[]` — the chart drew, and here is what could not be honoured.
Rendered above the plot rather than below, because a reader who scrolls away
never learns their reference line is missing.

The general shape is worth naming: **`problems` and `notices` are different
severities and one field cannot carry both**, because the consumer's behaviour
branches on emptiness. Any future partial failure in this engine belongs in
`notices`.

### What I learned

**The interesting case for a reference line is the one outside the data.** My
first instinct was to skip a reference that falls outside the domain — it cannot
be drawn where it means, so why draw it. That is exactly backwards: a target
line above every observation is the most informative state the chart has, and it
says *you are nowhere near it*. Dropping it hides the fact it exists to show, and
pinning it silently to the top edge says the opposite — that you are at target.

The domain stretches instead, and where stretching is impossible (a log scale
and a non-positive constant) the mark carries `clipped: true` and the renderer
adds an arrow.

This is the third time in two tickets the same defect class has come up:
`Sparkline`'s threshold had to be included in its domain for the identical
reason, and `Meter` had to distinguish NaN from +Infinity. **A value that cannot
be displayed at its true position must not be displayed at a false one.**

### What was tricky to build

Placing the x-domain extension *before* the 5% padding rather than after. After
the padding, a reference at the extreme sits flush against the panel edge and
reads as clipped when it is not; before it, the breathing room applies to the
combined range.

### What warrants a second pair of eyes

- **`notices` is a new public field on `Plot`.** Every construction site had to
  be updated and there were only two, but a third would fail to compile rather
  than silently return `undefined` — worth confirming that is still true if
  anyone adds one.
- **Intent styling.** `reference` is faint and dashed, `target` is green,
  `limit` is red and finely dashed. Those are my choices, not the prototype's,
  which used one style for everything.

### Technical details

```text
break: stop extending the y domain for references
  (fail) the y domain stretches to include a target above every observation
  (fail) a target inside the stretched domain is not marked clipped

break: draw an x reference horizontally
  (fail) on: "x" draws a VERTICAL line — it is a constant in x, perpendicular…

break: sort rules after the data marks
  (fail) the rule is emitted before the data marks, so points draw on top of it
```

## Step 3: Radar, which is not a geom

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Build phase 2 — the radar coordinate system.

**Inferred user intent:** As Step 1.

**Commit (code):** see below.

### What I did

`model/radar.ts` as a sibling of `buildPlot`, eleven tests, a `RadarPanel`
organism with five stories, and three break-verifications.

### Why a sibling and not a fifth geom

This was decided in the guide before any code and it is the decision the phase
turns on. A geom is a mark shape drawn *inside* a coordinate system — point,
line, bar and area all consume the same `px`/`py` from the same cartesian
scales. Radar replaces the coordinate system. There is no x, no y, no `padL`, no
axis ticks; every cartesian assumption in `buildPlot` is wrong inside it.

Adding it as `geom: "radar"` would have meant a branch inside `buildPlot` that
invalidates the two hundred lines around it — the scales, the ticks, the facet
layout, the legend gutter. A separate function with the same contract shape
costs nothing and keeps both readable.

### What worked

**The four-axes-at-maximum case makes the test exact.** With four spokes all at
their maximum the vertices land on the top, right, bottom and left of the
circle, and those four coordinates can be written down by hand. A test asserting
"four vertices were produced" would pass for a radar rotated by any angle,
including the one where the first spoke is at three o'clock.

### What was tricky to build

**Three details that are each one character wide and each change the picture:**

`-Math.PI / 2` puts the first spoke at the top. Without it the whole chart is
rotated by a quarter turn and looks subtly wrong in a way that is hard to name.

The `0.05` floor. A zero collapses that vertex onto the centre, and a polygon
with a vertex at the centre **self-intersects into a bowtie** — which reads as a
rendering fault rather than as a low value.

`axes[i]`, not `axes[0]`. Per-axis normalisation is the whole semantics of a
radar, and normalising every spoke against one axis's maximum produces a
perfectly plausible shape that means nothing.

All three are verified by breaking, because all three would have shipped.

### What warrants a second pair of eyes

- **Per-axis normalisation is a claim, and the plot carries the sentence.**
  `RadarPlot.normalisation` is a string the panel renders. Putting it in the
  data rather than leaving it to the caller is deliberate — a caller who omits
  it ships a chart that invites a false reading — but it is unusual and someone
  may object to text in a geometry type.
- **`MAX_SERIES = 3`.** Copied from the prototype's `.slice(-3)`. It is a
  judgement about legibility, not a fact.

**Commit (code, step 3):** `5ceb85a` — "DATADROP-13 phase 2: radar, a second coordinate system"

## Step 4: Backdrop, and the sweep

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Phases 3 and 4 — the backdrop mechanism, then the
guards and the break sweep.

**Inferred user intent:** As Step 1.

**Commits (code):** `62f7815` (phase 3), and this step's docs.

### What I did

`BackdropPanel`, four stories including a non-basketball frame, and a sweep over
every guard the ticket touches.

### What worked

**Deliberately doing no scale computation.** Marks arrive in the backdrop's own
coordinates. That makes the component trivially correct and pushes the only hard
question — how do my data coordinates map onto this frame — to the caller, who is
the only one who can answer it. The alternative, inferring a mapping from the
data's range, would silently place marks somewhere plausible and wrong.

**The rack-elevation story is the argument.** A court is one example; a second
frame with different coordinates and the same component is what distinguishes a
generalisation from one example wearing a costume. It was cheap and it is the
story I would point a sceptic at.

### What didn't work

**A story I wrote demonstrated the opposite of what it claimed**, and only
looking caught it. `AnUndrawableReference` maps a bar chart's y to the original
column after a `summarize` step — but summarize renames the field to
`mean_temp`, so `buildPlot` refused entirely and the story rendered "Nothing to
draw yet". It claimed to show the *notice* path and showed the *refusal* path.

Both are grey boxes with text in them. Nothing in typecheck, lint or the test
suite distinguishes them, and a reviewer reading the story's prose would have
had no reason to doubt it. After the fix: five bars drawn, notice shown, no
refusal.

That is the third story-level defect in two tickets found by opening a browser
after the suite was green, and all three had the same shape — the code was fine
and the *demonstration* was wrong.

### What I learned

**My verification selector was too broad, and I nearly reported a wrong number.**
Counting shot marks with `g > circle` returned 19 for 16 shots, because the
court's hoop and free-throw circles match too. The encoding was correct — 8
filled, 8 hollow, exactly the fixture — but for a moment the measurement said
otherwise. Worth recording because measuring the DOM is the technique this
project now leans on hardest, and a bad selector produces a confident wrong
answer just as easily as a bad implementation does.

### Technical details — the sweep

```text
remove BackdropPanel's story        -> + "organisms/BackdropPanel"
                                       (fail) every component directory has a story
undeclared token in RadarPanel.css  -> + "components/organisms/RadarPanel/RadarPanel.module.css:
                                            var(--pbui-line-invented)"
                                       (fail) every var(--pbui-…) names a declared token
model/radar.ts imports a component  -> + "model/radar.ts (model) imports ../components/atoms
                                            (atoms) — model may import: nothing"
                                       (fail) the layer graph
```

Plus the six from phases 1 and 2, all restored, 393 tests green across 30 files.

### What should be done in the future

- **Spatial binning.** The zone summary is an aggregation by *position* —
  distance from the hoop — computed in the story. The pipeline summarizes by
  category and has no spatial bin. A real shot chart would want one.
- **A story smoke test.** Three story-level defects in two tickets, all found by
  hand. Storybook ships a test-runner that mounts every story; it would have
  caught the `pbui: false` throw in DATADROP-11 automatically, though not this
  ticket's wrong-but-rendering story.
