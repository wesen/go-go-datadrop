---
Title: Diary
Ticket: DATADROP-6
Status: active
Topics:
    - design-system
    - storybook
    - atomic-design
    - frontend
    - refactor
    - coverage
    - pbui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/07/25/DATADROP-6--design-system-coverage-story-every-primitive-and-split-pbui-and-apps-into-reusable-atoms-molecules-and-organisms/design/01-design-system-coverage-and-decomposition-analysis-design-and-implementation-guide.md
      Note: the guide this diary records the writing of
    - Path: repo://AGENT.md
      Note: gained a diaryGuidelines block in step 3, at the user's instruction
    - Path: repo://ui/src/apps
      Note: the 3 528 lines analysed in step 1
    - Path: repo://ui/test/layers.test.ts
      Note: the graph whose one incidental edge shaped the whole design
ExternalSources: []
Summary: "Analysis of the datadrop UI and the rag-evaluation-site reference package, and the writing of the DATADROP-6 design guide."
LastUpdated: 2026-07-25T15:40:00.000000000-04:00
WhatFor: "Recording what was found, what was decided and what is still open, step by step."
WhenToUse: "Before continuing DATADROP-6, and when a decision in the guide needs its reasoning."
---

# Diary

## Goal

Record the analysis and design of DATADROP-6: raising the datadrop workbench
from 24 component directories and five Storybook stories to a covered design
system, by extracting the primitives currently inlined in the application layer.
This diary covers the analysis and the guide; implementation phases will be
appended as they are done.

## Step 1: Reading both codebases

Two systems had to be understood before a line of the guide could be written:
the datadrop UI as it stands, and the reference structure the user named. I read
the reference first, because it sets the vocabulary — its `GUIDELINES.md` turns
out to be the single most useful artifact in it, stating the layer test as a
question about the component ("if a component answers *where do regions go?* it
belongs in layout") rather than as a size heuristic.

Then the datadrop side, which is where the real work was. The headline is not
that the design system is small; it is that its *middle* is missing. Nine of the
eleven atoms are presentation chips — field, source, doc, user, token, role —
and there is no button, no input, no select, no checkbox. The application layer
absorbed that gap, and the measurements in §7 of the guide are what that
absorption looks like from the outside.

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to add extensive coverage of all atoms/molecules/organisms, and splitting up existing pbui/apps into more reusable primitives (atoms/molecules/organisms). \n\nUse the following structure: /home/manuel/workspaces/2026-07-13/rag-eval-ttc/rag-evaluation-system/packages/rag-evaluation-site \n\nFirst, analyze it all and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create DATADROP-6; analyse the datadrop UI and the
rag-evaluation-site package; write an intern-oriented analysis/design/
implementation guide with prose, bullets, pseudocode, diagrams, API references
and file references; store it in the ticket and upload it to reMarkable.

**Inferred user intent:** The UI has a design system that stopped halfway. They
want it finished, they want the finished state to be enforceable rather than
aspirational, and they want the reasoning written down well enough that someone
new can execute it without them.

### What I did

- Read the reference package end to end: `GUIDELINES.md` (12 KB, the enforcement
  document), `README.md`, `.storybook/main.ts` and `preview.ts`, `package.json`,
  a representative atom (`Button` — component, module, story, widget adapter,
  widget manifest, barrel), a molecule with recipes (`DataTable`), and
  `scripts/focused-checks.mjs`.
- Counted its layers: foundation 8, atoms 19, layout 15, molecules 47,
  organisms 27 — 116 components across 334 `.tsx` files, with **127 story
  files**.
- Read the datadrop UI: `layers.test.ts` in full, `tokens.css` in full,
  `pbui/registry.ts`, `pbui/parts.ts`, `apps/registry.ts`, `Chip.tsx` +
  `Chip.module.css`, `Text.tsx`, and the five largest applications
  (`UploadApp` 491, `PipelineApp` 299, `TokensApp` 262, `ChartApp` 260,
  `MemberList` 177).
- Measured the duplication rather than asserting it. The commands and their
  outputs are in guide §7 so they can be re-run as a baseline.

### Why

The user asked for a guide "for a new intern". That raises the bar on the
analysis specifically: an intern cannot be told "the applications have too much
inline styling" and act on it. They need the file, the line, the count and the
reason. So the analysis had to produce numbers that survive being checked.

### What worked

The measurement approach found something an inspection would have missed.
Grepping for `const btn: React.CSSProperties` returned six hits; diffing the six
showed they are identical **except for one property**:

```text
GalleryApp, CompareApp, ChartsApp    fontSize: var(--pbui-fs-tiny)     9.5px
EncodingApp, PipelineApp, SourceApp  fontSize: var(--pbui-fs-small)   10.5px
```

The drift has already happened, on screen, unintentionally. That converts the
whole ticket from an aesthetic argument into an empirical one, and it became
guide §7.2 — the most load-bearing paragraph in the analysis.

The second measurement was as useful: four character-identical text-input style
literals, in `UploadApp`, `TokensApp`, `MemberList` and `SignInApp`. All four
were written within hours of each other by one author during DATADROP-5. That
is the honest version of the argument: duplication does not need a large team or
a long time, only that there be nothing to import.

### What didn't work

**`cd` inside a compound command left the shell somewhere unexpected, twice.**
`cd deploy/compose && grep …` succeeded and moved the persistent shell, so a
later `ls deploy/compose` failed with `(eval):cd:1: no such file or directory`,
and a glob that had worked minutes earlier reported `no matches found`. Nothing
was lost, but two tool calls were wasted diagnosing a state change I had caused.
The fix is to use absolute paths in one-off commands rather than relying on the
persistent working directory.

**A first attempt to count raw elements returned zeroes:**

```text
$ grep -ro "<$tag[ >]" --include="*.tsx" .
(eval):1: bad math expression: operand expected at `>'
button: 0
```

zsh was interpreting `[ >]` inside the double-quoted pattern. Switching to
`grep -roE "<${tag}\b"` fixed it. Worth recording because a grep that returns 0
looks exactly like a clean codebase, and I nearly wrote "no raw buttons" into
the analysis.

### What I learned

- **`GUIDELINES.md` as a package-root artifact is the reference's best idea**,
  and datadrop's equivalent policy is real but distributed across a design guide
  §10.3, a comment in `layers.test.ts`, and a comment in `tokens.css`. Each is
  well written; none is findable by someone who does not already know it exists.
  That became DR-39 and phase 6.
- **The reference and datadrop converged independently on pure-logic
  extraction.** The reference has `TimeGrid.logic.ts` tested by a plain Node
  `assert` script; datadrop has `apps/UploadApp/upload.ts` tested by
  `test/upload.test.ts` with no DOM, no server and no file picker. datadrop's
  version is better, because it is inside the test runner already in CI. So the
  guide generalises datadrop's pattern rather than importing the reference's.
- **`Pbui.stories.tsx` contains a second copy of `EncodingApp`'s channel row.**
  The story needed one, had nothing to import, and wrote its own. The two have
  been drifting since. This is §7.2's failure in a different costume, and it is
  the cleanest possible illustration of why "a component without a story" and "a
  story without a component" are the same problem.

### What was tricky to build

**The reference's organism pattern is illegal under datadrop's layer graph, and
finding out why took the longest single stretch of the analysis.**

The reference's organisms are presentational panels with DTO-shaped props;
containers supply the data. Mapped onto datadrop that means `apps/TokensApp`
keeps the RTK Query hooks and `components/organisms/TokensPanel` renders. But
`layers.test.ts:74` forbids `apps -> organisms`.

The symptom was easy to see and the cause was not. I traced the constraint back
and found it rests on a single import:

```ts
// components/organisms/Tile/Tile.tsx:2
import { appFor, allApps } from "../../../apps/registry";
```

`organisms -> apps` is permitted for that one line, and the reverse edge is
forbidden by a *separate* test (`layers.test.ts:167`) specifically to keep the
pair acyclic. So the whole constraint exists to protect one edge that exists for
one import of a 49-line file that is not an application at all — it is the
contract applications register against, sitting in `apps/` for historical
reasons.

The resolution is to move `apps/registry.ts` to `src/appkit/registry.ts`, delete
the `organisms -> apps` edge, and add `apps -> organisms`. The cycle cannot form
because `organisms` no longer names `apps`. That is DR-33, and it is the
smallest change that unblocks the largest part of the ticket — but it took
reading the test's own comments to be confident the edge was incidental rather
than load-bearing. The comment at `layers.test.ts:60` says as much, which is a
good argument for the codebase's habit of explaining constraints in prose.

**Deciding what *not* to copy was harder than deciding what to copy.** The
reference has a Widget IR layer: JSON-serialisable UI nodes, a `WidgetRenderer`,
per-component `.widget.tsx` adapters, `.widget.yaml` manifests, and a Goja DSL
so server-side JavaScript can author pages. It is coherent and substantial, and
it exists because that product's pages are defined server-side. datadrop's UI is
authored in TypeScript and compiled into the binary; there is no server-side
page author to serve. Adopting it would mean a second way to describe every
component with no consumer. The same reasoning killed the palette provider
(datadrop has one palette, contrast-tested at two thresholds — offering
alternatives would imply they had been tested too) and the publishing apparatus
(one consumer, `pkg/webui`, which embeds the assets). That is DR-37.

### What warrants a second pair of eyes

- **DR-33, the graph change.** It is the only part of the ticket that moves
  files across layers, and it deletes an edge that a test currently protects. I
  am confident the edge is incidental; a reviewer should confirm that
  `apps/registry.ts` really has no application-level dependency (it imports two
  types, `DocId` and `NodeId`, and nothing else) before phase 5 starts.
- **The 57-component target.** It is a consequence of the extraction list in
  §15, not a quota, but a list that long invites padding. §21 states the
  anti-goal explicitly; a reviewer should push back on any component in §15 that
  is used once and has no state worth a story.
- **`Button`'s `opacity: 0.4` for unavailable actions.** Phase 1 reproduces the
  existing behaviour exactly so the substitution is provably a no-op, and phase
  6 fixes it. The current behaviour is a real accessibility defect — at 0.4 on
  `--pbui-pane-alt` the label is well under 3:1 and the button stays clickable
  because opacity is not `disabled`. A reviewer should check that phase 6 does
  not quietly get dropped.
- **The security properties of DATADROP-5 must survive the extraction.** The
  bearer token stays in `sessionStorage`, secrets stay out of Redux and out of
  presentation values, `credentials` stays `"same-origin"`. §20.1 and §21 say
  so; `test/api-surface.test.ts` is the automated guard. The one-time token
  secret in particular must not become a Storybook control with a default.

### What should be done in the future

- Phases 0 through 6 as listed in `tasks.md`.
- The four open questions in guide §29.3 are genuinely undecided: whether the
  tutorials should be extracted at all, whether `Legend` is a molecule or an
  organism, whether `busy?: string` is the right shape, and whether the
  anti-regression test should try to police `style={{`.

### Code review instructions

- Start with guide §7 and re-run the four command blocks. They are the baseline
  and the acceptance criteria; if a number does not reproduce, the analysis is
  wrong somewhere and everything downstream is suspect.
- Then §12 and DR-33 — the only structural change.
- Then §15, the extraction inventory, against §16, the five questions that
  decide a layer. Every row in §15 should be justifiable by §16 in one sentence.
- Validate: nothing to run yet; this step produced documents only.

### Technical details

The measurements, for reference:

```text
raw <button> outside stories            42
raw <select>                             9
raw <input>                             14
inline style={{ … }}                    80
const btn: React.CSSProperties           6   (3 tiny, 3 small — drifted)
identical TextInput style literals        4
apps/*.tsx total                     3 528 lines
component directories                   24   (2 with a story)
reference package components           116   (127 story files)
```

## Step 2: Writing the guide

The guide is 1 745 lines in four parts, ordered so each part answers the
question the previous one raises: analysis (§1–§8), the reference structure
(§9–§14), design (§15–§22), implementation (§23–§29). It carries one mermaid
diagram of the bundle's dependency structure, eight decision records (DR-32
through DR-39), a full props reference for all 33 new components, a file
reference split into created/modified/**not** modified, and four open questions
stated as open rather than resolved.

The structural choice I am least sure about is putting the reference study
(Part II) *between* the analysis and the design rather than in an appendix. It
delays the design by five sections. I kept it because the design's most
contested decision — DR-33, the graph change — only makes sense once you have
seen the pattern it is trying to make legal, and an appendix would be read after
the design or not at all.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Write the guide itself, intern-oriented, with the
specific ingredients named: prose paragraphs, bullet points, pseudocode,
diagrams, API references, file references.

**Inferred user intent:** A document someone can be handed on their first day
and execute from, without the author present.

### What I did

- Wrote §1–§8 (analysis) from step 1's measurements, including a §1.1 that
  states what the ticket is *not*, because "add more stories" is the wrong
  framing and would produce the wrong work.
- Wrote §9–§14 (the reference), including §11 "what we should not copy".
- Wrote §15–§22 (design): the full 57-component target inventory as five tables
  with a Source column so no extraction starts from a blank file; §16's five
  ordered questions for deciding a layer, with two worked examples; §17's
  per-application extraction list with line ranges; §18's coverage contract
  including "the awkward mode" for each organism; §19's two enforcement tests as
  pseudocode; §22's eight decision records.
- Wrote §23–§29 (implementation): seven phases, `Button` in full as the worked
  example, the props reference, the file reference, and §28.3 on proving there
  is no visual change without a screenshot-diffing tool.
- Added the seven phases to `tasks.md` via `docmgr task add`.

### Why

Two of these deserve their reasoning recorded.

**§18.2, "the awkward mode".** DATADROP-5 shipped three UI defects found only by
opening a browser: provider prose shown in token mode, an empty "Signed in on"
heading for root, and "you are a admin". Each is a *state* of a component, and
each needs a specific server configuration to reach by clicking — token mode, a
root credential, an admin membership. Each is two lines of props in a story. So
rather than asking for "good coverage", §18.2 names the specific awkward state
each of the five new organisms must have a story for. That turns the coverage
requirement from a judgement call into a list.

**§28.3, proving no visual change.** The ticket's biggest risk is that
substituting `Button` into 42 call sites changes how something looks. The
obvious answer is a screenshot-diffing tool, and adding one is out of scope and
would be its own ticket. So §28.3 gives three cheaper checks in increasing order
of confidence and asks the implementer to record in the diary which they ran.
"I read the transcription and swept the applications" is a real answer; "it
looks fine" is not.

### What worked

Writing §7 (the evidence) before §15 (the target inventory) meant the inventory
could be derived rather than invented — every new component in §15 has a Source
column pointing at the lines it comes from, and the components with no source
are the ones I had to justify individually (`CodeText`, `Inline`, `ScrollRegion`,
`StateGlyph`).

`StateGlyph` is the one I would defend hardest: the upload item states are
currently distinguished by a word inside a faint-coloured span, which fails the
codebase's own rule that meaning is never carried by colour alone —
`Chip.module.css`'s `.stale` rule has a comment naming exactly this defect
class. Extracting a glyph atom is how the rule gets applied to code written
after it.

### What didn't work

Nothing failed in this step. One thing was avoided rather than solved: I did not
re-run the guide through pandoc while writing it. DATADROP-5's guide hit
`YAML parse exception at line 9, column 2, while scanning a block scalar`
because pandoc reads any `---`…`---` region as metadata and a body separator
followed by a table starting with `|` looks like a YAML block scalar. This guide
uses `***` for its four body separators from the start, which is the fix applied
retroactively last time.

### What was tricky to build

**Deciding where `Legend` goes, and admitting I could not.** It is used by one
application, and it needs a `renderEntry` escape hatch so `ChartApp` can wrap
each entry in a `Presentation` without the molecule importing `pbui`. A
component with one consumer and a render-prop is a smell in both directions:
too general for a molecule, too specific for a shared one. I put it in
`molecules` and listed it as open question 2 in §29.3 rather than manufacturing
a justification.

The `renderEntry` / `renderChip` / `renderMapped` pattern itself is the trickiest
thing in the design, and it is worth stating why it exists. DR-38 forbids
extracted components from wrapping themselves in `Presentation`, because a
component that does needs a `PbuiProvider` in every story and can no longer be
rendered in isolation — which is the entire property the ticket buys. But some
of these components' contents genuinely *are* live presentations in the
application. The render prop is the seam: the molecule renders a plain chip by
default, and the application passes a function that wraps it. Three components
need it (`Legend`, `MemberRow`, `ChannelRow`), which is few enough to be a
pattern rather than an architecture.

### What warrants a second pair of eyes

- **§15's 33 new components.** Specifically whether `CountBadge`, `ScopeChip`
  and `Inline` earn their place, or whether they are the padding §21 warns
  about.
- **The phase ordering.** Phase 2 (substitution) before phase 3 (stories for
  existing components) is deliberate — substitution is where a visual regression
  would enter, and doing it while the tree is otherwise unchanged makes
  `git diff` readable. A reviewer might reasonably argue for stories first.

### What should be done in the future

- Upload the guide to reMarkable (step 4).
- Nothing else; the remaining work is the seven phases.

### Code review instructions

- Read §1.1 first. If the reviewer disagrees that this is two tickets' worth of
  work described as one, the phase ordering is the thing to argue about.
- Check §15's Source column against the files. Every "new" row should point at
  real lines.
- Check §26 (props) against §17 (extraction): a component whose props do not
  match what its source lines need is a design error that will surface as a
  half-day of rework in phase 4.

### Technical details

Guide structure:

```text
Part I    §1–§8    analysis        what exists, and the evidence
Part II   §9–§14   the reference   what to copy, what not to
Part III  §15–§22  design          the inventory, the rules, DR-32..DR-39
Part IV   §23–§29  implementation  seven phases, props, files, verification
```

Decision records added: DR-32 coverage follows decomposition; DR-33 `appkit`
and the deleted edge; DR-34 `PARTS` stays small; DR-35 coverage is a test;
DR-36 raw controls fail the suite; DR-37 no Widget IR, no palette provider, no
publishing; DR-38 no self-wrapping in `Presentation`; DR-39 `ui/GUIDELINES.md`.

## Step 3: Making the diary rule permanent

The user interrupted mid-turn to say that a detailed diary and regular commits
are not something to be asked for each time, and to put that in `AGENT.md`. That
is a correction as much as an instruction: I had written 1 745 lines of guide
before starting this diary, which is exactly the failure mode the rule exists to
prevent. Steps 1 and 2 above are therefore reconstructed rather than recorded
live, and they are missing at least one thing a live diary would have — the
order in which I read the reference package, and which of its files turned out
to be dead ends.

### Prompt Context

**User prompt (verbatim):** "keep a detailed diary as you work, and commit at appropriate intervals (look at diary skill on how to do that). NEVER FORGET IT, in fact, add it to the AGENT.md"

**Assistant interpretation:** Keep the diary in the required format from now on,
commit at sensible intervals, and encode both as a standing rule in `AGENT.md`
so it applies to every future ticket without being restated.

**Inferred user intent:** They have had to ask for this before — the same
instruction appears in DATADROP-4 and DATADROP-5. Making it a repository rule is
the fix for a recurring correction.

### What I did

- Added a `<diaryGuidelines>` block to `AGENT.md`, between the library and
  debugging guidelines, stating the rule, the working loop, and the specific
  requirement to record failures with exact errors.
- Wrote this diary with steps 1 and 2 backfilled and marked as such.

### Why

The instruction says "NEVER FORGET IT", and the honest reading is that a rule
that lives only in a conversation is forgotten by the next conversation.
`AGENT.md` is read at the start of every session in this repository, which makes
it the only durable place for it.

I made the block say "do it from the first step, not retroactively at the end"
explicitly, because that is the part I got wrong here and it is the part that
loses the most: a backfilled diary reliably records what worked and reliably
omits what was tried and abandoned.

### What worked

`AGENT.md` already has a section-per-concern structure with XML-ish tags
(`<goGuidelines>`, `<webGuidelines>`, `<debuggingGuidelines>`), so the new rule
had an obvious shape and place.

### What didn't work

N/A — but see the admission above: the diary itself was late, which is the
failure this step exists to fix.

### What was tricky to build

Nothing technically. The judgement call was how much of the diary skill to
restate in `AGENT.md`. Copying the whole step format would duplicate the skill
and go stale; naming the skill alone would be too thin to act on. The block
names the skill for the format and states the four things most often skipped —
prompt context, verbatim errors, the commit-hash loop, and commit granularity.

### What warrants a second pair of eyes

Whether `<diaryGuidelines>` belongs in `AGENT.md` at all, or in a repo-level
`CLAUDE.md`. `AGENT.md` is currently about *how to build this project*; a
process rule about documentation is a different category. I put it there because
that is the file the user named.

### What should be done in the future

Apply it. The next step in this ticket (the reMarkable upload) gets its own
entry, written as the work is done rather than after.

### Code review instructions

- `AGENT.md:56` — the new block. Check it against the `diary` skill for
  contradictions.

### Technical details

```text
AGENT.md   +21 lines, <diaryGuidelines> between <libraryGuidelines> and <debuggingGuidelines>
```

## Step 4: Ticket bookkeeping, commit, and the reMarkable upload

Filled in the ticket index with the overview, the eight decision records and the
evidence summary; added the seven phases to `tasks.md`; updated the changelog;
committed everything as `945027b`; converted the guide to a 30-page PDF and
uploaded it to the device.

Written before doing the work rather than after, which is the point of step 3.

### Prompt Context

**User prompt (verbatim):** (see Step 1 — "Store in the ticket and the nupload to remarkable.")

**Assistant interpretation:** Complete the ticket's own documents, commit, and
put the guide on the reMarkable.

**Inferred user intent:** They read long documents on the device rather than on
screen. A guide that only exists in `ttmp/` will not actually be read.

**Commit (docs):** `945027b` — "DATADROP-6: analysis and design for design-system coverage and decomposition"

### What I did

- Wrote the ticket `index.md` overview: the measurements, what the ticket is and
  is not, the structure reference, the AGENT.md override note, and the DR table.
- `docmgr task add` × 7 for the phases; `docmgr changelog update`.
- Committed `945027b` (7 files: AGENT.md plus the whole ticket).
- `pandoc → xelatex → PDF`, then `rmapi mkdir Projects/2026/07` and
  `rmapi put`. Verified with `rmapi ls Projects/2026/07`.

### Why

`Projects/2026/07` is a new folder. I searched the device for the DATADROP-5
guide first — root, `Design`, `ai`, `Notes`, `Projects` — and did not find it,
so there was no existing convention to follow. `Projects/YYYY/MM` matches the
Obsidian vault's layout, which is the closest thing to a convention this
material has.

### What worked

`docmgr ticket list | grep -c DATADROP-6` returned 2 before committing. That
check exists because DATADROP-5 was silently dropped from the listing by
invalid YAML in a `RelatedFiles` note — a note beginning with a `"` character.
Running it *before* the commit rather than after is the cheap version of that
lesson.

### What didn't work

**The first PDF was missing five glyphs.** With pandoc's default Latin Modern
fonts:

```text
[WARNING] Missing character: There is no ✕ (U+2715) in font [lmmono10-regular]
[WARNING] Missing character: There is no ⌖ (U+2316) in font [lmmono10-regular]
[WARNING] Missing character: There is no ↕ (U+2195) in font [lmmono10-regular]
[WARNING] Missing character: There is no ✓ (U+2713) in font [lmmono10-regular]
[WARNING] Missing character: There is no ≤ (U+2264) in font [lmroman10-regular]
```

Missing characters render as *nothing* — not as a box — so the failure is
silent on the page. That matters here specifically because the glyphs are the
subject of §15.3 (`StateGlyph`, `IconButton`): a guide arguing that `✓` and `✕`
carry meaning without colour, printed with the glyphs invisible, would be
absurd.

Switching to DejaVu (`-V mainfont="DejaVu Serif" -V monofont="DejaVu Sans Mono"`)
fixed four of the five. `⌖` U+2316 POSITION INDICATOR — the accept-protocol
glyph — survived, because DejaVu does not have it either. `fc-list
':charset=2316' family` found which fonts do:

```text
FreeSerif, Noto Sans Symbols2, PragmataPro Liga
```

so a three-line header file maps that one codepoint to a fallback family:

```tex
\usepackage{newunicodechar}
\newfontfamily\symbolfont{Noto Sans Symbols2}
\newunicodechar{⌖}{{\symbolfont ⌖}}
```

passed with `-H fallback.tex`. Second build: no warnings at all.

### What I learned

**`fc-list ':charset=XXXX' family` answers "which installed font has this
codepoint"** in one command. That is the tool for this class of problem, and I
did not know it before today; the alternative is guessing at font names.

**Missing glyphs in xelatex are silent in the output and loud in the log.** The
practical rule for any future pandoc-to-PDF step: grep the pandoc output for
`Missing character` and treat a hit as a build failure, not a warning. A visual
check of a rendered page would not have caught this — I checked pages 6 to 8,
and none of the five glyphs appears on them.

### What was tricky to build

Only the font fallback, described above. Worth noting the shape of the mistake
that nearly happened: I first considered removing the glyphs from the guide.
That would have "fixed" the build by damaging the document — the glyphs are the
literal subject matter of two sections. Fixing the renderer rather than the
content is almost always the right direction when the content is the point.

### What warrants a second pair of eyes

- The device location. If the DATADROP-5 guide is in fact somewhere I did not
  search, this one should move to sit beside it.

### What should be done in the future

- Phase 0. Nothing in this step blocks it.
- If more guides are going to the device, put the pandoc invocation with its
  font flags and the `fallback.tex` into a ticket playbook so the glyph problem
  is solved once.

### Code review instructions

- `index.md` — check the DR table against guide §22; a table that disagrees
  with the guide is worse than no table.
- Re-run `docmgr ticket list | grep -c DATADROP-6` after any frontmatter edit.

### Technical details

```bash
pandoc GUIDE.md -o DATADROP-6-design-system-coverage-and-decomposition.pdf \
  --pdf-engine=xelatex -V geometry:margin=2cm -V fontsize=9pt \
  -V mainfont="DejaVu Serif" -V monofont="DejaVu Sans Mono" \
  -V sansfont="DejaVu Sans" -H fallback.tex --toc --toc-depth=2

rmapi mkdir Projects/2026/07
rmapi put DATADROP-6-design-system-coverage-and-decomposition.pdf Projects/2026/07
```

Result: 30 pages, 206 KB, no missing characters, at
`Projects/2026/07/DATADROP-6-design-system-coverage-and-decomposition` on the
device.

## Step 5: Phase 0 and Phase 1 — the control atoms

Phase 0 recorded the baseline. Phase 1 built the six control atoms the design
system never had — `Button`, `IconButton`, `TextInput`, `SelectInput`,
`CheckboxRow`, `LinkAction` — each with a component, a CSS module, a story and a
barrel entry, and nothing substituted into the applications yet.

The phase found something the analysis had missed, and it changes the shape of
`Button`: there are **two** visual treatments of a button in this codebase, not
one, and the guide's design assumed one. §7.2 measured the six copies of
`const btn` and concluded "the design system has no button". True — but it also
means the other twenty-nine hand-written buttons were not unstyled by
oversight. They were *deliberately* bare, because `reset.css` strips buttons
down to text.

### Prompt Context

**User prompt (verbatim):** "Implement the ticket / refactor. Keep a frequent detailed diary, commit at appropriate intervals. The dairy should be in the skills diary format. NEVER FORGET DIARY."

**Assistant interpretation:** Execute DATADROP-6's seven phases, writing a diary
step per phase in the skill's format and committing per phase.

**Inferred user intent:** They want the work done and they want the record of it
to be usable afterwards — including the parts that did not go to plan.

**Commit (code):** `0ab9e4e` — "DATADROP-6 phase 1: the six control atoms"

### What I did

- Recorded the phase 0 baseline (see Technical details).
- Read `styles/reset.css`, which turned out to be the decisive file.
- Built the six atoms, each as `Component.tsx` + `Component.module.css` +
  `Component.stories.tsx` + `index.ts`, and extended `atoms/index.ts` with a
  comment separating the presentation chips from the new controls.
- Wrote 19 stories across the six.
- `bun run --cwd=ui typecheck`, `bun test --cwd ui` (166 pass),
  `bun run --cwd=ui build-storybook` (succeeds).

### Why

**`Button` has `variant: "bare" | "framed"` because the codebase has both.**
`reset.css:71` is:

```css
button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
```

so `<button type="button"><Text size="small">Commit</Text></button>` — the form
every DATADROP-5 application uses — renders as plain text with a pointer
cursor. Meanwhile the six chart applications apply `style={{...btn}}` and get a
bordered, alt-background, bold control. Twenty-nine bare, thirteen framed.

A single-treatment `Button` would have silently restyled twenty-nine call sites
in phase 2, which is precisely the visual regression §21 forbids. Making the
default `bare` means the majority substitution is a literal no-op.

**The `opacity: 0.4` question resolved itself by reading the call sites.** The
guide (§24.1) planned to carry it as a `dim` prop and fix it in phase 6. But
every site that dimmed also set `disabled`:

```tsx
disabled={index === 0}  style={{ ...btn, opacity: index === 0 ? 0.4 : 1 }}
disabled={!mapped}      style={{ ...btn, opacity: mapped ? 1 : 0.4 }}
```

so the opacity *was* the disabled treatment, written out longhand at each site
with the condition duplicated. It moves to `.root:disabled` and the prop is not
needed. That is strictly better than the plan: a disabled button can no longer
look enabled, which is the failure that shape invites. The 0.4 value is still
too low and phase 6 still owns raising it — the CSS says so where someone will
find it.

### What worked

Writing the stories immediately, in the same commit as the components, rather
than deferring them to phase 3. Two of the six changed shape because of a story:

- `SelectInput` gained `placeholder` as a real prop after writing the
  `WithPlaceholder` story and realising UploadApp's "choose a drop…" is a
  *state*, not decoration — the surface below it is disabled and says why while
  it is selected. So the placeholder option has to stay selectable, which is a
  decision I would not have reached from the call site alone.
- `SelectInput`'s `Empty` story (no writable drops) is the state a first-day
  account sees, and it made me keep `options: []` working rather than assuming
  at least one entry.

### What didn't work

**`satisfies Meta<typeof Component>` requires `args` on the meta when the
component has required props**, and eight stories failed with:

```text
src/components/atoms/TextInput/TextInput.stories.tsx(28,14): error TS2322:
  Property 'args' is missing in type '{ render: () => React.JSX.Element; }'
  but required in type '{ args: { children?: ReactNode; ... } }'
```

`Button`, `IconButton` and `CheckboxRow` had `args` already and passed;
`TextInput` and `SelectInput` did not. The fix is a meta-level `args` with
placeholder values, and it needs a comment, because those values are the
control-panel defaults and are *not* what any story renders — every story here
uses a `Live` wrapper with `useState`. Someone reading `args: { value: "" }` and
looking for an empty field on screen would be confused.

**A typo shipped into a story and the typechecker caught it:**
`<Text size="tiny" tone="danger" size2>`. Worth recording only because it is the
argument for the strict meta typing that caused the previous failure — the same
mechanism that made me write boilerplate `args` also caught a real mistake four
lines later.

### What I learned

**A controlled input in a story needs a `Live` wrapper or the story is
misleading.** `<TextInput value="readings" onValueChange={() => {}} />` renders
correctly and cannot be typed into. A reviewer clicking it concludes the
component is broken. Every input story here therefore wraps the component in a
five-line local with `useState`, which is a pattern the remaining phases will
reuse for `ScopeChecklist`, `MemberInvite` and the upload form.

**`reset.css` is load-bearing for component design, not just for normalisation.**
I read it looking for a button default and found the reason two treatments
exist. Any future atom that wraps a native element should start by reading what
the reset already does to it.

### What was tricky to build

**Deciding whether `LinkAction` should exist at all**, given DR-21's general
suspicion of near-duplicate components. The case for it is narrow and specific:
an OIDC authorization request is a top-level navigation, the provider answers
with HTML on another origin, and it cannot be a `fetch`. So the element must be
an `<a href>` — but if its appearance is written inline next to a `Button`, the
two drift, and the sign-in affordance stops reading as an action of the same
kind as everything else.

What settled it was writing the `MatchesButton` story, which puts a
`LinkAction` and a `Button` side by side in both variants. That story is the
regression test for the thing the atom exists to prevent, and it only works
because the two are separate components with deliberately identical CSS. I also
gave `LinkAction` an `Omit<…, "onClick">` so it cannot become a button wearing a
link's clothes — that breaks middle-click, copy-link and open-in-new-tab, and it
is the mistake this shape invites.

**`IconButton`'s required `label`.** Making it required rather than optional is
the whole reason it is a separate atom instead of `<Button>✕</Button>`. Every
hand-written glyph button in the tree happens to have an `aria-label` — six
authors remembering six times — and the seventh would have been the bug. The
type checker now holds it.

### What warrants a second pair of eyes

- **`Button`'s default variant.** `bare` is right by headcount (29 of 42) but it
  means the more visible treatment is the one you have to ask for. A reviewer
  might prefer no default at all, forcing the choice at every call site.
- **`.root:disabled { opacity: 0.4 }`.** Deliberately reproducing a bad value.
  Phase 6 must not be dropped; the CSS comment is the reminder but a reviewer is
  the guarantee.
- **`min-width: 1.5em` on `IconButton`.** A compromise between WCAG 2.5.8's 24px
  target and a deliberately dense interface. It is a judgement call and it is
  the kind that should be made once, visibly, rather than per call site.

### What should be done in the future

- Phase 2: substitute all six into the 20 applications. That is where a visual
  regression would enter, so it goes in its own commit with nothing else in it.
- **Guide correction:** §15.2 proposes an `Inline` layout primitive. `Stack`
  already takes `direction="row"` with the same gap scale, so `Inline` would be
  a second name for one thing — exactly the padding §21 warns about. It is
  dropped, and phase 4's count goes from 3 new layout primitives to 2.
- **Guide correction:** §24.1's `Button` sketch has one variant and a `dim`
  prop. Both are wrong, for the reasons above. The implemented shape is
  `variant` × `tone` × `size` with disabled handled by CSS.

### Code review instructions

- Start with `styles/reset.css:71` and `atoms/Button/Button.module.css`. The
  `.bare` block restates what the reset already does; if that reads as
  redundant, the two-treatment argument has not landed and the rest of the
  review will not either.
- Then `Button.stories.tsx` → `BothSizes`. It is the finding from guide §7.2 put
  on screen deliberately.
- Validate:
  ```bash
  bun run --cwd=ui typecheck
  bun test --cwd ui
  bun run --cwd=ui build-storybook
  make storybook   # Design System/Atoms/*
  ```

### Technical details

Phase 0 baseline, recorded 2026-07-25T15:42:41-04:00:

```text
raw <button> (excl. stories)   42
raw <select>                    9
raw <input>                    14
inline style={{                80
React.CSSProperties             8
component directories          24
story files                     2
apps/*.tsx total            3 528 lines
```

Phase 1 result: 30 component directories, 8 story files, 166 tests still
passing, `build-storybook` succeeds. No application file was touched.

## Step 6: Phase 2 — substitution across the whole tree

Every hand-written control is gone. 42 buttons became `Button` or `IconButton`,
9 selects became `SelectInput`, 12 of the 14 inputs became `TextInput` or
`CheckboxRow`, and all six copies of `const btn: React.CSSProperties`
disappeared. Inline style objects fell from 80 to 51.

The phase found a **third** button treatment that neither the guide nor phase 1
had seen, and it found two elements that must stay raw for reasons worth
recording. Both are the kind of thing only substitution surfaces: reading a
component tells you what one call site does; replacing every call site tells you
what the set of them does.

### Prompt Context

**User prompt (verbatim):** (see Step 5)

**Assistant interpretation:** Replace every hand-written control with the phase 1
atoms, changing nothing visible.

**Inferred user intent:** Bank the value of phase 1 before doing anything
structural, in a diff a reviewer can actually read.

**Commit (code):** `6e80eda` — "DATADROP-6 phase 2: substitute the control atoms across the tree"

### What I did

- Substituted in 14 application files, `DocBar`, `Tile` and `WorkspaceStrip`.
- Added a **`raised`** variant to `Button` and grounded `TextInput`'s and
  `SelectInput`'s size and width scales in the call sites that asked for them.
- Added `hideLabel` to `CheckboxRow`.
- Verified: typecheck, 166 tests, `build-storybook`, `vite build`, and a browser
  sweep of the build and explore workspaces against a real server.

### Why

**The `raised` variant.** LauncherApp, WatchlistApp, `WorkspaceStrip` and the
tutorials all draw a button with `border-firm` + `shadow-hard` + a tone fill.
`tokens.css` names it:

```css
--pbui-shadow-hard: 2px 2px 0 var(--pbui-ink); /* buttons */
```

The token system anticipated a raised button and nothing implemented one, so
four sites implemented it four times. It takes a `fill` prop — a string, not an
enum, and the same shape as `Chip`'s `tone` — because LauncherApp fills each
button with the tone of the application it launches. That is data, not a design
choice made in the atom.

**The size and width scales were invented in phase 1 and are now grounded.** I
had written `width: "narrow" | "normal" | "wide"` with max-widths of 90/180/320,
none of which anything asked for. What the call sites actually want is:
`auto` (the four DATADROP-5 fields), `narrow` = **64px** exactly (ChartsApp's
document name), `compact` = 96px (PipelineApp's step editor, which caps at
60–110px so a step stays on one line), and `fill` (SourceApp's token field).
Three font sizes, likewise: `base` from `font: inherit`, `small` from ChartsApp,
`tiny` from SourceApp. Every value now traces to a line of code.

### What worked

**Replacing a hand-rolled selected-state with `selected` deleted a conditional
at three sites.** SourceApp's row-budget buttons were:

```tsx
style={{ ...btn, background: limit === option ? "var(--pbui-selected)" : "var(--pbui-pane-alt)" }}
```

and are now `selected={limit === option}`. The fill is identical, and the button
now reports `aria-pressed`, which none of the three did. Same for EncodingApp's
y-scale pair.

**The browser sweep caught nothing, which is the result I wanted.** The build
workspace renders the framed step buttons, the `⌖`/`×` channel icon buttons, the
selected `linear` and the disabled `log`; the explore workspace renders the
filling token field, the framed drop select and the row-budget row with `2,000`
selected. Both match what was there before.

### What didn't work

**`bun test`'s regex habits cost me a wrong measurement.** I counted remaining
raw elements with `grep -coE '<button\b'` and then, in a later pass, with a
Python `re.findall(r'<button.')` — the trailing `.` does not match a newline, so
`<button\n  type="button"` was invisible and UploadApp reported `i=0` while it
still held a `<input type="file">`. The same class of mistake as step 1's zsh
glob. Recounting with `grep -coE '<button'` gave the true numbers.

**Two of my substitutions were wrong and I reverted them before committing:**

- I gave ProfileApp's access toggle `selected={expanded === drop.name}`. It never
  had a selection fill, and the label already changes between "access" and
  "hide access", so the state was already carried. Adding a yellow background is
  a visual change, and phase 2 forbids those.
- I gave MemberList's email field `invalid={error !== null}`. That would add a
  dashed border the field never had. The `aria-invalid` association it also
  brings is a genuine fix — the error text is currently not associated with the
  field at all — so it moves to phase 4 with `MemberInvite` and a story.

Both were improvements. Both were out of scope, and a substitution commit that
also contains improvements is a commit nobody can verify by reading.

### What I learned

**Not every `<button>` is a Button, and the exceptions are principled.** Two
survive:

- `pbui/ObjectMenu.tsx:88` — `role="menuitem"`, `data-part={PARTS.menuItem}`, its
  own module class. It is also in `pbui/`, which **may not import `atoms`**
  under the layer graph, so it could not use the atom even if the semantics
  matched.
- `organisms/SplitView/SplitView.tsx:88` — `role="separator"` with
  `aria-orientation` and `aria-valuenow`. It is a resize handle that happens to
  be a `<button>` for focusability. Giving it Button's appearance would be
  actively wrong.

And two `<input>` elements survive:

- UploadApp's `<input type="file" hidden>`, which moves into `FileDropZone` in
  phase 4.
- `WorkspaceStrip`'s inline rename field, which is **uncontrolled by design**:
  `defaultValue` plus a read on Enter, with Escape discarding. `TextInput` is
  controlled, so converting it would change behaviour in a phase that forbids
  that. It wants an `InlineRename` molecule, which is a phase 4 decision.

This directly changes the anti-regression test planned in guide §19.2. Its
allowlist cannot just be "components/atoms" — it needs `pbui/` (which cannot
import atoms at all) and a rule for elements carrying a non-default ARIA role.

**`Tile`'s `TileButton` became a four-line wrapper rather than disappearing.**
Six title-bar buttons all want framed + tiny + a glyph. Keeping the local
wrapper for those three defaults is less repetitive than spelling them six
times, and it is now a wrapper over the atom rather than a second `<button>`.

### What was tricky to build

**Deciding how strict "no visual change" should be, three times.** The two
reverts above were easy once stated. The third is not, and it shipped:

ChartsApp's document-name field had `border` and `background` but **no
padding**. `TextInput` has `padding: 2px 4px`, from the four DATADROP-5 fields.
So that one field gains 2px of vertical padding inside its 64px box. I kept the
padding — four call sites had it and one did not, and adding a `padding` prop to
satisfy the outlier is exactly the styling-API leak §20.3 forbids. But it *is* a
visual change, it is the only one, and it is recorded here rather than
discovered later.

Similarly EncodingApp's log-scale button dimmed to `0.45` while everything else
used `0.4`. Both are now `0.4` from `:disabled`. Converging two values that
differed by accident is the point of the ticket; I mention it because "no visual
change" and "reconcile accidental divergence" are in tension, and the resolution
is that the divergence has to be *named* when it is reconciled.

**PipelineApp's step editor had six unlabelled selects.** `SelectInput` requires
`label`, so I had to invent names: "field to filter on", "comparison", "left
operand", "aggregate", "direction", "rows to keep". A screen reader previously
announced all six as "combo box" and nothing else. This is the one behaviour
change in the substitution and it is a fix — but it is worth noticing *how* it
happened: a required prop on an atom found six missing accessible names that no
review had. That is the argument for required props doing work, and it is the
same mechanism as `IconButton`'s required `label`.

### What warrants a second pair of eyes

- **The ChartsApp padding change**, above. It is the single pixel-level
  difference in the phase and someone should agree it is the right trade.
- **The six invented select labels** in PipelineApp. They are my words for
  someone else's controls; a reviewer who uses the pipeline editor may have
  better ones.
- **SourceApp's token field became controlled.** It was
  `defaultValue={readToken()}` with a write-through `onChange`. It is now
  `useState` plus the same write-through. Equivalent as far as I can see, but it
  is the one place where an uncontrolled input became controlled.

### What should be done in the future

- Phase 3: stories for the 24 pre-existing components, and turn on
  `stories.test.ts`.
- Carry into phase 6: the anti-regression test's allowlist must cover `pbui/`
  and non-default ARIA roles, not just `components/atoms`.
- Carry into phase 4: `InlineRename` for WorkspaceStrip, `FileDropZone` for
  UploadApp's hidden input, and `MemberInvite`'s `aria-invalid` association.

### Code review instructions

- Read `git show --stat` first: 17 files, and every one should be a
  like-for-like replacement.
- Then `ui/src/apps/SourceApp/SourceApp.tsx` — it has all three interesting
  cases in one file: the controlled-token conversion, the framed select, and the
  `selected` replacement for a hand-rolled background conditional.
- Then `Button.module.css` `.raised` against the four sites it replaced.
- Validate:
  ```bash
  bun run --cwd=ui typecheck && bun test --cwd ui
  bun run --cwd=ui build-storybook
  make ui && ./datadrop serve --auth none   # then sweep the workspaces
  ```

### Technical details

```text
                         before   after   note
raw <button>                 42       2   ObjectMenu (menuitem), SplitView (separator)
raw <select>                  9       0
raw <input>                  14       2   UploadApp file input, WorkspaceStrip rename
const …: React.CSSProperties  6       0
inline style={{               80      51
```

Both surviving buttons carry a non-default ARIA role; one of them is in `pbui/`,
which the layer graph forbids from importing `atoms` at all.
