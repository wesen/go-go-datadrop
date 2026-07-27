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
