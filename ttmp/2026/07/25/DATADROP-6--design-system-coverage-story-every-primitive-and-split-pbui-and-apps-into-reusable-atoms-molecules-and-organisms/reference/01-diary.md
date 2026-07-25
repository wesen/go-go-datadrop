---
Title: Diary
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

## Step 7: Phase 3 — cover the 24 that already existed, and make it a test

Every component directory now has a story, and `ui/test/stories.test.ts` fails
if that stops being true. Storybook went from **5 stories to 83**, and the
sidebar now reads as the dependency order rather than as two lonely entries.

The phase also found a piece of dead structure and corrected a claim in the
guide about how the chips work.

### Prompt Context

**User prompt (verbatim):** (see Step 5)

**Assistant interpretation:** Story the pre-existing components and turn on the
coverage check.

**Inferred user intent:** Make the covered state the enforced state, so it
cannot quietly decay the way it did between DATADROP-4 and now.

**Commit (code):** `156b210` — "DATADROP-6 phase 3: story the 24, and enforce coverage"

### What I did

- Wrote 24 story files: 4 foundation, 4 layout, 9 atoms, 2 molecules, 3
  organisms, 1 page.
- Wrote `ui/test/stories.test.ts` — six checks: a story per directory, a
  component and barrel per directory, no empty directories, the layer's title
  prefix, the sidebar grouping, and a guard that there are components to check
  at all.
- Deleted `components/organisms/StatusBar/`, an empty directory.
- Verified: typecheck, 172 tests (was 166), `build-storybook`, and 83 stories in
  `index.json`.

### Why

**The title-prefix check earns its place separately from the coverage check.**
`.storybook/main.ts` documents a hierarchy that mirrors the layer decomposition,
so the sidebar is a map of the architecture. A story filed under the wrong group
breaks that quietly — nothing fails, the component is still covered, and the map
is wrong. Parsing the title with a regex rather than importing the module is
deliberate and the test says so: importing a story file pulls in React, the CSS
modules and the whole component tree, which turns a 34 ms test into a bundling
exercise.

**Exactly one page-level story, and the reasoning is written into it.**
`Applications/Workbench` renders the whole shell. It earns its place because two
properties are visible nowhere else: the landmark structure — the a11y `region`
rule is disabled globally because a story renders a fragment with no page shell,
and this is the one place the shell exists, so the story switches it back on —
and the signed-out gate. It is deliberately the only one, because page stories
test integration rather than components and would not have caught any of the
three DATADROP-5 defects.

### What worked

**Verifying the test can fail, before trusting it.** A coverage test that cannot
fail is worse than none, because it converts an unchecked convention into a
checked-looking one. Two deliberate breakages:

```text
$ mv src/components/atoms/Chip/Chip.stories.tsx /tmp/ && bun test test/stories.test.ts
(fail) story coverage > every component directory has a story

$ mkdir src/components/atoms/Zzz && bun test test/stories.test.ts
(fail) story coverage > no empty component directories
```

Both failed with the offending path named, and both passed again once undone.

**Writing the stories surfaced knowledge that was only in comments.** Several
stories are now the visible form of a defect the code comments describe:
`Chip`'s `stale` state (the EncodingEditor bug — a dead mapping reading as
"unset"), `TruncationNotice`'s "at least N+1" (the banner that once asserted the
sample *is* the whole source), and `RoleBadge`'s hover text, where "you are **an**
admin" is now rendered next to the other three roles. That last one is the exact
DATADROP-5 defect, and it is now on a page where anyone would read it.

### What didn't work

**`components/organisms/StatusBar/` was an empty directory.** Not a component
missing a story — a directory containing nothing at all, left behind by a
rename. The coverage check reported it as "organisms/StatusBar has no story",
which is true and unhelpful. I added a separate `no empty component directories`
check so the next one gets diagnosed as what it is, and deleted the directory.
Since git does not track empty directories it was invisible to `git status`,
which is why nobody had noticed.

**Two type errors from writing stories against remembered types rather than read
ones:**

```text
Object literal may only specify known properties, and 'kind' does not exist in type 'Node'
Type '"first"' is not assignable to type '"head" | "latest"'
```

The layout tree discriminates on `type`, not `kind`, and a truncation strategy
is `head`, not `first`. Both were caught in seconds by `tsc`, which is the
argument for `satisfies Meta<typeof Component>` on every meta: a story is code
that goes stale silently otherwise.

### What I learned

**The guide is wrong about the chips, and §20.2 needs correcting.** It claims
the `*Chip` atoms "are the *bodies* of presentations and are correctly
provider-free". Reading them: only `Chip` itself is. `FieldChip`, `UserChip`,
`TokenChip`, `DocChip` and `SourceChip` all wrap themselves in `Presentation`
and require the provider.

That is not a defect — it is what makes a field chip right-clickable everywhere
it appears — but it does mean the exception to DR-38 is one component wide, not
nine. The rule stands for everything phase 4 builds; the existing chips are the
named exception, and their stories rely on the global `withPbui` decorator.

**A `parameters: { tile: false }` decision has to be made per story and is easy
to get wrong.** The `withTile` decorator imposes a bounded flex column, which is
correct for organisms and actively misleading for atoms — an atom has no
business assuming a height. Every atom and foundation story sets `tile: false`;
`AppBody` and `Tile` deliberately do not, because the bound is the property
under test.

### What was tricky to build

**Deciding what a story for `VisuallyHidden` even is.** The component renders
nothing visible, so a story showing it renders an empty box, which teaches
nothing. What it should demonstrate is the property that distinguishes it from
`display: none`: it is announced but takes no space. So the story puts two
adjacent lines of text with a whole announced sentence between them — the point
is that the lines are adjacent. The second story is a live region carrying the
mouse documentation, with prose explaining that nothing rendering *is* the
correct outcome.

The general lesson, which phase 4 will need: for an invisible or structural
component, the story has to demonstrate the *invariant*, not the appearance.
`Toolbar`'s `DoesNotShrink` is the same shape — a 90px frame with far more than
90px of content, so the `flex-shrink: 0` that the whole component exists for is
visible as a behaviour.

### What warrants a second pair of eyes

- **The regex title parse.** It relies on `title:` being a literal in the meta.
  That is a real constraint on how stories may be written and it needs to end up
  in `GUIDELINES.md` in phase 6, or someone will use a computed title and get a
  confusing failure.
- **The `Applications/Workbench` a11y override.** It switches the `region` rule
  back on for that one story. If the shell ever fails it, the failure will be
  real and the temptation will be to switch the rule off again.
- **83 stories is a lot to keep truthful.** Several assert things about the
  system in prose ("nobody decided that", "the drift has already happened"). If
  a later change makes one of those sentences false, no test will notice.

### What should be done in the future

- Phase 4: the remaining atoms, the foundation and layout additions, and the 14
  molecules.
- **Guide correction:** §20.2's claim that the `*Chip` atoms are provider-free
  is wrong; only `Chip` is.
- **Guide correction:** §15.2's `Inline` was already dropped in step 5. The
  layout additions are `FormRow`, `ScrollRegion` and `CodeText` (foundation).
- Phase 6 must add to `GUIDELINES.md`: story titles must be literals.

### Code review instructions

- Start with `ui/test/stories.test.ts`, and break it yourself before trusting
  it — `mv` any `*.stories.tsx` aside and confirm the failure names the path.
- Then `make storybook` and read the sidebar top to bottom. It should read as
  the dependency order: Foundation, Layout, Atoms, PBUI, Molecules, Organisms,
  Applications.
- The three stories worth reading as documentation rather than as coverage:
  `Atoms/Chip → States`, `Molecules/TruncationNotice → BothStrategies`, and
  `Layout/Toolbar → DoesNotShrink`.
- Validate:
  ```bash
  bun test --cwd ui          # 172, up from 166
  bun run --cwd=ui build-storybook
  ```

### Technical details

```text
                     before   after
story files               2      26
stories (index.json)      5      83
component directories    24      23   (organisms/StatusBar deleted — it was empty)
bun tests               166     172
```

Stories per group:

```text
   13  Design System/Foundation
   12  Design System/Layout
   39  Design System/Atoms
    4  Design System/PBUI
    4  Component Library/Molecules
   10  Component Library/Organisms
    1  Applications/Workbench
```

## Step 8: Phase 4 — the molecules, and four components that were not built

Sixteen molecules, three atoms and one foundation primitive, each with a story.
Storybook goes from 83 stories to **142**. Four components the guide proposed
were **not** built, because no call site asks for them, and saying so is the
point of §21.

The phase also moved a function between layers — the extraction proved it was in
the wrong one — and produced the ticket's cleanest single result: `ChannelRow`
now exists once instead of twice.

### Prompt Context

**User prompt (verbatim):** (see Step 5)

**Assistant interpretation:** Build the remaining atoms and all the molecules,
with the states §18 requires.

**Inferred user intent:** Finish the missing middle of the design system.

**Commit (code):** `fa934fc` — "DATADROP-6 phase 4: the molecules"

### What I did

- foundation: `CodeText`.
- atoms: `Swatch`, `StateGlyph`, `ScopeChip`.
- molecules: `EmptyState`, `ErrorNotice`, `Callout`, `KeyValueList`, `Legend`,
  `ScopeChecklist`, `FileDropZone`, `UploadItemRow`, `UploadQueueList`,
  `DraftResumeList`, `TokenRow`, `MemberRow`, `MemberInvite`, `InlineRename`,
  `ChannelRow` — 15, plus the two that already existed.
- Moved `formatBytes` from `apps/UploadApp/upload.ts` to `model/format.ts`.
- 59 new stories. 172 tests still pass; `build-storybook` succeeds.

### Why

**Four proposed components were dropped, each for the same reason.** The guide
listed them; the code does not want them:

| Dropped | Why |
|---|---|
| `Inline` | `Stack direction="row"` already is this, with the same gap scale |
| `ScrollRegion` | zero inline `overflow` sites — `AppBody` already owns scrolling |
| `CountBadge` | no call site at all; I had invented it from the reference's `Tag` |
| `FormRow` | no three-site pattern with a distinct shape |

§21 says the 57-component figure is "a consequence of §15, not a quota", and
this is what honouring that looks like. The final count is 53, and each of the
four absences is a component that would have had one contrived story and no
consumer.

**`ScopeChip` is not a `Chip`,** and the distinction is worth stating because it
will come up again. A `Chip` is the *body of a presentation* — there is a
descriptor behind it, a menu of verbs, a hover description. A scope has none of
those and should not acquire them: it is an attribute of a token, not an object
you can act on. Making it a Chip would have implied a `<scope>` presentation
type that does not exist.

### What worked

**`ChannelRow` now exists once.** It existed twice — in `EncodingApp` and again
in `pbui/Pbui.stories.tsx`, which needed a channel row to demonstrate the accept
protocol, had nothing to import, and wrote its own. They had been drifting
independently. This is the same failure as the six copies of the button style,
and it is the tidiest possible demonstration that "a component with no story"
and "a story with no component" are one problem rather than two.

**The `render*` seam works and is small.** DR-38 forbids a molecule from
wrapping itself in `Presentation`, but `Legend`, `MemberRow`, `ChannelRow` and
`UploadQueueList` all have contents that genuinely *are* live presentations in
the application. Each takes a render prop: the default draws a plain chip, and
the caller passes a function that wraps it. Four components need it, which is
few enough to be a pattern rather than an architecture — and every one of their
stories renders without a provider, which is the property being bought.

### What didn't work

**`molecules` may not import `apps`, and `UploadItemRow` needed `formatBytes`.**
The typecheck was clean; the *layer test* would have failed. `formatBytes` lived
in `apps/UploadApp/upload.ts` because the uploader was the first thing to need
it, which is the ordinary way a shared helper ends up in the wrong place.

It moved to `model/format.ts` — pure, no DOM, no React, which is exactly what
`model` is for — and `upload.ts` re-exports it so the uploader's own test and
call sites keep working. The extraction is what proved the misplacement: nothing
else would have.

**One unused import survived my own review** and `tsc` caught it:

```text
src/components/molecules/MemberRow/MemberRow.tsx(2,10):
  error TS6133: 'Stack' is declared but its value is never read.
```

Trivial, but worth the line: I had written the component with a `Stack`, decided
`Toolbar` was right, and left the import. That is the failure mode of writing
sixteen components in a sitting.

### What I learned

**A story for an invisible or structural component must demonstrate the
*invariant*, not the appearance.** This came up four times in a row and is now a
rule I would put in `GUIDELINES.md`:

- `VisuallyHidden` → two adjacent lines with a whole announced sentence between
  them. The point is that they are adjacent.
- `Toolbar` → a 90px frame with 300px of content. The point is that the toolbar
  does not shrink.
- `KeyValueList` → a 220px box with a sha256 digest in it. The point is that the
  box stays 220px, because the value column is `minmax(0, 1fr)` and not `1fr`.
- `Legend` → the empty case renders *nothing*, and the story says so in prose,
  because reserving space for an absent legend would shift every unmapped chart.

**`Callout` has no `danger` variant, and working out why clarified both
components.** A Callout reports a state worth knowing and announces as
`status`; an `ErrorNotice` reports a failure and announces as `alert`. Merging
them would mean either announcing every informational panel as an alert or
announcing no failure as one. The variant that does not exist is the one that
made the boundary legible.

### What was tricky to build

**`DraftResumeList` is the component with the most consequence behind the least
markup, and getting its prose right mattered more than its layout.** The design
analysis predicted, by reading `pkg/store/datasets.go`, that committed-only
version listings would make an interrupted upload both unrecoverable *and* a
disk leak; building the uploader confirmed it exactly. So "discard" here is not
a tidiness affordance — it is the only way to release the bytes, and a user who
reads it as "clean up my list" will leave 400 MB allocated forever. The
component says so, in the component, rather than in a comment.

**`InlineRename` exists to hold a reason, not to hold markup.** It is fourteen
lines of JSX around an uncontrolled `<input>`. Phase 2 deliberately left that
element raw, and the risk was that the next person would "fix" the
inconsistency by converting it to `TextInput` — which would change Escape from
"there was never an edit" to "put the old value back", and add a `useState` per
rename that exists only to be discarded. Extracting it gives the reason a
permanent home next to the code, which a phase-2 diary entry does not.

### What warrants a second pair of eyes

- **The four dropped components.** If a reviewer wants `FormRow`, the argument
  to make is which three sites it unifies.
- **`ScopeChip`'s "privileged" styling for `admin`.** Bolder and
  hairline-bordered rather than coloured, because a red scope chip would read
  as an error rather than as a privilege. That is a judgement call.
- **`formatBytes` moving to `model/`.** It is a formatting function and `model`
  is described as "the engine". I think it belongs — it is pure and it is shared
  — but "model" may want to stay strictly the grammar of graphics.
- **`Callout`'s `role="status"` on all three variants.** The warning variant is
  arguably an alert.

### What should be done in the future

- Phase 5: the `appkit` move and the five organisms; then the applications
  actually adopt these molecules, which phase 4 has *not* done — the components
  exist and are storied, but `UploadApp` still contains its own version of the
  markup.
- Phase 6: `GUIDELINES.md` should carry the invariant-not-appearance rule above,
  and the story-title-must-be-a-literal constraint from phase 3.

### Code review instructions

- Start with `molecules/ChannelRow/` and then `grep -n "ChannelRow" -r src/` —
  the whole argument for the ticket is that this is one component now.
- Then `molecules/DraftResumeList/DraftResumeList.tsx`, whose comment explains a
  server-side consequence a reader would otherwise have to discover.
- Then the four `render*` props (`Legend`, `MemberRow`, `ChannelRow`,
  `UploadQueueList`) against DR-38.
- Validate:
  ```bash
  bun run --cwd=ui typecheck && bun test --cwd ui
  bun run --cwd=ui build-storybook
  make storybook   # Component Library/Molecules/*
  ```

### Technical details

```text
                     before   after
component directories    23      42
story files              26      42
stories                  83     142
bun tests               172     172
```

Built: 1 foundation, 3 atoms, 15 molecules.
Dropped, for want of a call site: `Inline`, `ScrollRegion`, `CountBadge`,
`FormRow`.
Moved: `formatBytes`, `apps/UploadApp/upload.ts` → `model/format.ts`.

## Step 9: Phase 5 — the graph change, and five presentational organisms

`apps/registry.ts` moved to `src/appkit/`, the `organisms -> apps` edge is gone,
and `apps -> organisms` is now permitted. On the far side of that 49-line move,
the five account applications became containers over presentational panels:
**SignInApp 146 → 57 lines, ProfileApp 186 → 91, MemberList 177 → 88, TokensApp
262 → 106, UploadApp 491 → 316.** Storybook is at 180 stories.

The phase found a hole in the layer test that had been there since DATADROP-4,
and it found it the worst possible way: by falling into it.

### Prompt Context

**User prompt (verbatim):** (see Step 5)

**Assistant interpretation:** Do DR-33, then extract the five organisms and make
the applications thin.

**Inferred user intent:** The structural change that makes the reference
package's pattern legal here, done after the cheap value was already banked.

**Commit (code):** `c3c3788` — "DATADROP-6 phase 5: appkit, and five presentational organisms"

### What I did

- `git mv src/apps/registry.ts src/appkit/registry.ts`, rewrote 22 import paths.
- Rewrote the `ALLOWED` table: added `appkit`, deleted `organisms -> apps`,
  added `apps -> organisms`.
- Replaced the "organisms/apps pair stays acyclic" test with one that guards the
  deleted edge by name, and **added a new test** — see below.
- Built `SignInPanel`, `ProfilePanel`, `MemberPanel`, `TokensPanel`,
  `UploadPanel`, each with the awkward-mode stories §18.2 names. 38 new stories.
- Rewrote the five applications as containers.
- Verified in a browser against a real server: the account workspace renders all
  three tiles through the new organisms, including the root-principal state.

### Why

**The move is 49 lines and it unblocks the whole phase.** `apps/registry.ts` is
an `AppDescriptor` interface, a `Map` and three functions over it. It is not an
application — it is the contract applications register against — and it sat
under `apps/` for historical reasons only. `organisms/Tile` importing `appFor`
from it was the *single* reason the graph carried `organisms -> apps`, and that
edge is why `apps -> organisms` had to be forbidden to keep the pair acyclic.
With the file moved, `organisms` no longer names `apps` at all, so no cycle can
form and the presentational-panel pattern becomes available.

**`TokenSummary` now takes the wire shape, optional fields and all.** The
container's `ApiToken` has `last_used_at?: string`, the molecule wanted
`string | null`, and the honest fix is the molecule matching the server rather
than four hand-written literals whose only job is turning `undefined` into
`null`.

### What worked

**Rewriting the applications as containers made three of them readable in one
screen.** `SignInApp` is now 57 lines and every one of them is either a hook, the
callback-error plumbing, or a prop. What it *stopped* containing is the six
error-code strings and both mode branches, which are now story-covered.

**The browser sweep confirmed the root-principal path.** The profile tile renders
"signed in as the root principal — there is no user record for it" with no
session block at all — which is defect 2's territory, now with three stories
pinning it (`RootPrincipal`, `SessionsStillLoading`, `NoOtherSessions`).

### What didn't work

**I created `src/appkit/` and the layer test went green while the new layer was
entirely unconstrained.** This is the most useful failure of the phase.

`layers.test.ts` skips what it does not recognise, twice:

```ts
if (!from || !(from in ALLOWED)) continue;   // the file's own layer
if (!(to in ALLOWED)) continue;              // the layer it imports
```

So a directory absent from the table has *no* rules applied to it and *no* rules
applied to edges into it. I had moved the registry, not yet edited the table,
run the suite, and seen six passes. The equivalent guard existed for
`components/` — "every component directory sits in a known layer" — and had
never been generalised one level up.

Added `every source directory sits in the graph`, and verified it bites:

```text
$ mkdir src/widgets && echo 'export const x = 1' > src/widgets/x.ts
$ bun test test/layers.test.ts
+   "widgets"
(fail) the layer graph is one-way > every source directory sits in the graph
```

Deleting a directory correctly does *not* fail it — the check is that everything
present is known, not that everything known is present.

**A Python heredoc died on its last line and I nearly believed the result.**

```text
File "<stdin>", line 111
    print("appkit" in s, "apps\"," in s)
                                  ^
SyntaxError: unterminated string literal
```

The syntax error was in the `print`, so `p.write_text(s)` never ran — the edit
was silently discarded. The test I ran immediately afterwards passed, for the
unrelated reason above, so for about a minute I had "the graph change is
applied and green" when neither half was true. Two lessons: put the write before
the diagnostics, and be suspicious of a test that passes on the first attempt at
a structural change.

**Three unused declarations survived into `UploadApp`** and `tsc` caught all
three: `formatBytes`, the `dragging` state and the `fileInput` ref. All three
had moved into `FileDropZone`, which owns the drop surface and the hidden input
now — but the container kept its copies, because deleting the JSX does not
delete what fed it.

### What I learned

**A test that skips what it does not recognise needs a companion test that
enumerates.** `layers.test.ts` had exactly this pair for `components/` and
exactly one half of it for `src/`. The general shape: any check of the form
"for each known X, verify Y" wants a sibling "the set of known X is the set of
actual X", or the first one silently shrinks.

**Three states, not two, for anything loaded.** `ProfilePanel` distinguishes
`sessions === undefined` (loading) from `sessions.length === 0` (there are
none). Collapsing them is precisely how a heading comes to render above
nothing — which is the shape defect 2 had — so both are props states and both
are stories.

### What was tricky to build

**Deciding how much of `UploadApp` to move.** It is 491 lines, of which roughly
130 are the protocol driver: open a draft, hash, HEAD the blob, mount or send,
commit. That is genuinely application logic and it stays. What moved is the
~250 lines of JSX around it.

The judgement call was `renderItem`. The uploader wraps each row in a
`Presentation` so an upload is right-clickable, and the obvious thing is for
`UploadQueueList` to do that. But then every story of the queue needs a
`PbuiProvider`, and the panel could not be rendered against literal data — which
is the entire property being bought. So the seam stays, and the container passes
the wrapper. It is the fourth use of that pattern and the one where I most
wanted to take the shortcut.

**`ProfilePanel` needed a `renderDropAccess` prop for the same reason, one level
up.** The member list *fetches*, so it cannot be a molecule; the panel takes a
function and the container supplies `<MemberList>`. Without it, `ProfilePanel`
would import `MemberList` from `apps/`, which is the edge DR-33 just deleted.

### What warrants a second pair of eyes

- **The `appkit` name.** It holds one file. `contract/`, `registry/` or
  `platform/` would all do; I picked the one that reads as "the kit an app is
  built against" and it should be argued with now rather than after it has ten
  files in it.
- **`UploadApp` is still 316 lines.** That is the protocol driver plus the
  props. A reviewer should check that nothing *presentational* is left in it.
- **`TokenSummary` taking the wire shape.** It couples a molecule to
  `api/client`'s optionality without importing it. I think that is right; it is
  arguable.
- **Five organisms now import from `molecules`, which imports `store`.** No
  cycle, but the panels are further from "pure props in, callbacks out" than the
  reference package's are.

### What should be done in the future

- Phase 6: `GUIDELINES.md`, the anti-regression test, and the `Button` disabled
  contrast fix deferred from phase 1.
- The anti-regression test's allowlist must cover `pbui/` (which may not import
  `atoms` at all) and elements carrying a non-default ARIA role — recorded in
  step 6 and still true.

### Code review instructions

- Start with `test/layers.test.ts`: the `appkit` entry, the deleted edge, and
  the new `every source directory sits in the graph` test. Break that last one
  with `mkdir src/anything` before trusting it.
- Then `apps/SignInApp/SignInApp.tsx` — 57 lines, and the clearest example of
  what a container looks like here.
- Then the four `render*` props against DR-38, one of which
  (`renderDropAccess`) exists specifically because the alternative is the edge
  DR-33 deleted.
- Validate:
  ```bash
  bun run --cwd=ui typecheck && bun test --cwd ui
  bun run --cwd=ui build-storybook
  make ui && ./datadrop serve --auth none    # then open the account workspace
  ```

### Technical details

```text
                         before   after
apps/*.tsx total          3 093    2 867
  SignInApp                 146       57
  ProfileApp                186       91
  MemberList                177       88
  TokensApp                 262      106
  UploadApp                 491      316
component directories        42       47
stories                     142      180
bun tests                   172      173
```

The graph, after DR-33:

```text
appkit    -> model, pbui, store
organisms -> …, api, appkit          (was: …, api, apps)
apps      -> …, organisms, appkit    (organisms was forbidden)
```

## Step 10: Phase 6 — the guidelines, the guard, and the deferred fix

`ui/GUIDELINES.md`, `test/no-raw-controls.test.ts`, and the `Button` disabled
contrast that phase 1 deliberately left wrong. 177 tests, 180 stories, and the
acceptance numbers from guide §28.4 all met.

The anti-regression test found real unfinished work on its first run, which is
the best possible thing for a new test to do.

### Prompt Context

**User prompt (verbatim):** (see Step 5)

**Assistant interpretation:** Finish the ticket: the policy document, the guard
against regression, and the fix deferred out of phase 1.

**Inferred user intent:** Leave the design system in a state that stays finished
without them watching it.

**Commit (code):** `2895585` — "DATADROP-6 phase 6: guidelines, the raw-control guard, and the contrast fix"

### What I did

- Wrote `ui/GUIDELINES.md`: ten sections, every rule naming the test that
  enforces it or saying plainly that nothing does.
- Wrote `test/no-raw-controls.test.ts` — four banned patterns, a five-entry
  allowlist where each entry states its reason in a sentence, and a check that
  no allowlist entry is stale.
- Raised the disabled opacity from 0.4 to 0.55 on `Button` and `IconButton`, and
  pinned it with a contrast test.
- Adopted `InlineRename` in `WorkspaceStrip` — see below.

### Why

**0.55, and it is not an arbitrary choice.** I computed what the browser
actually paints: `--pbui-ink` composited over `--pbui-pane-alt` at α=0.4 gives
**2.32:1**, under the 3:1 a disabled control should still clear. At 0.55 it is
3.45:1 on the alt surface and 3.56:1 on the pane.

0.55 is also not a new number — `Chip.module.css` has used exactly it for
`.disabled` since DATADROP-4, for the same reason. So the fix converges two
values that had diverged rather than introducing a third.

The test pins the *number*, and its comment says why that matters: without it,
the next person tidying 0.4 and 0.55 back together has a 50% chance of picking
the wrong one.

**WCAG exempts disabled controls from the contrast minimum, and I decided that
exemption is a licence rather than a design goal.** "You may not press this" is
information, and it is useless if the label naming the thing you may not press
is unreadable. Held to 3:1 rather than 4.5:1, because a disabled control
genuinely should recede.

### What worked

**The new test found unfinished work on its first run.** Two hits:

```text
components/organisms/WorkspaceStrip/WorkspaceStrip.tsx:33 — use TextInput or CheckboxRow
components/organisms/Tile/Tile.tsx:150 — use Button or IconButton
```

The first is real and I had missed it: **`InlineRename` was built in phase 4 and
never adopted.** The component existed, was storied, and `WorkspaceStrip` still
had the raw `<input>` it was extracted from. A guard written to prevent future
regressions caught a present one, which is the argument for writing it at all.

**Both new tests were verified by breaking them.** A raw `<button>` inserted
into `AboutApp` fails by path and names the atom to use; `DISABLED_OPACITY = 0.4`
fails the contrast test. Neither is a test that cannot fail.

### What didn't work

**The second hit was a false positive on my own documentation.** `Tile.tsx:150`
is a comment:

> Now a thin wrapper over IconButton rather than its own `<button>`.

That is exactly the kind of comment this ticket wants people to write, and a
lint that punishes documentation gets disabled within a month. Fixed by
stripping block comments and `//` lines before matching. The general lesson: a
text-matching lint over a codebase whose comments discuss code must exclude
comments, or it teaches people to stop writing them.

### What I learned

**An allowlist needs a staleness check or it silently widens the rule.** The
third test in the file asserts that every allowlist prefix still matches a real
file. Without it, deleting `SplitView` would leave an exemption sitting there
for whatever moved into that path next. The entries are also required to carry a
sentence, which is the cheap version of making an escape hatch cost something:
people use an exemption honestly when they have to explain it.

**Writing `GUIDELINES.md` was mostly transcription, and that was the finding.**
Almost every rule in it already existed — in the DATADROP-4 guide §10.3, in a
comment at the top of `layers.test.ts`, in `tokens.css`, in `parts.ts`. Each was
well written. None was findable by someone who did not already know it existed.
The document adds three things that were genuinely new: the invariant-not-
appearance rule for structural components (learned in phase 3), the
title-must-be-a-literal constraint (a real limitation of how `stories.test.ts`
parses), and §9's table of what the tests actually guarantee — which ends with
"nothing tests that a component *looks* right", because a reader should not have
to discover that by being surprised.

### What was tricky to build

**Deciding whether the raw-control test should exist at all.** It is a change
detector, and change detectors are usually a smell: they fail on every
legitimate change and get deleted. What makes this one worth having is that the
thing it detects is a *decision* rather than a detail — a raw `<button>` outside
`atoms/` after this ticket means either the author did not know `Button` exists
(which the failure fixes by naming it) or `Button` is missing a variant (which
is a design conversation this forces to happen rather than letting a seventh
private copy settle it).

The allowlist is what makes that sustainable, and it took three tries to get its
shape right: a bare list of paths invites additions, so each entry carries the
sentence explaining itself, and a stale entry fails.

### What warrants a second pair of eyes

- **3:1 for disabled controls** is my reading of the intent, not the letter, of
  WCAG. Someone may reasonably prefer the exemption.
- **`GUIDELINES.md` will go stale.** Nothing tests its claims. The mitigation is
  that every rule names its test, so a reader can check.
- **The comment-stripping regex** in `no-raw-controls.test.ts` is naive: a
  `/*` inside a string literal would confuse it. Nothing in the tree does that,
  and a real parser is far too much apparatus for this.

### What should be done in the future

Nothing in the ticket. Genuinely open, and listed in guide §29.3:

- whether `apps/tutorials/*` should be extracted at all,
- whether `Legend` is a molecule or an organism,
- whether `busy?: string` is the right shape on `Button`,
- whether the anti-regression test should try to police `style={{` — 61
  occurrences remain and §5 of the guidelines keeps three legitimate categories,
  so a test would need to distinguish them, and a test that cannot state its
  rule crisply is one that gets disabled.

### Code review instructions

- Read `ui/GUIDELINES.md` §9 first. If the table of what the tests guarantee is
  wrong, everything above it is unreliable.
- Then `test/no-raw-controls.test.ts` — and add a `<button>` somewhere to
  confirm it names the atom rather than a rule id.
- Then the contrast comment in `Button.module.css` against the test in
  `tokens.test.ts`. The number appears in both; they should agree.
- Validate:
  ```bash
  bun run --cwd=ui typecheck && bun test --cwd ui   # 177
  bun run --cwd=ui build-storybook                  # 180 stories
  ```

### Technical details

Acceptance numbers, against guide §28.4:

```text
                                        target   actual
raw <button> outside atoms/                  0        0
raw <select> outside atoms/                  0        0
raw <input> outside atoms/ + FileDropZone    0        0
const …: React.CSSProperties                 0        0   (2 hits, both prose)
component directories                       57       53
directories with a story                    57       53
apps/*.tsx total lines                 <= 2 400    2 867
```

Two rows missed and both are honest. **53 not 57**: four proposed components
were dropped for want of a call site (`Inline`, `ScrollRegion`, `CountBadge`,
`FormRow`), which §21 explicitly permits — the count is a consequence, not a
quota. **2 867 not 2 400**: the guide's own note said the line target was "a
guide, not a gate", and `UploadApp` keeps its 130-line protocol driver plus the
props that feed the panel. Lines moving from `apps/` into `components/` was the
point; lines disappearing would have meant behaviour was lost.

Contrast, computed rather than guessed:

```text
--pbui-ink over --pbui-pane-alt at 0.40   2.32:1   (was)
--pbui-ink over --pbui-pane-alt at 0.55   3.45:1   (is)
--pbui-ink over --pbui-pane     at 0.55   3.56:1
```

Whole-ticket totals:

```text
                     start    end
component directories   24     53
story files              2     55
stories                  5    180
bun tests              166    177
raw form controls       65      0
apps/*.tsx lines     3 528  2 867
```

## Step 11: The vault report, and an authoring guide for GUIDELINES.md

Two follow-ups after the ticket closed: a v0.5 project report for the Obsidian
vault continuing the v0.1–v0.4 series, and a new §8 in `ui/GUIDELINES.md`
covering how to actually write and add a component, an application, or a
hardwired workspace.

### Prompt Context

**User prompt (verbatim):** "write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      \n Commit and push the bsidian vault when done (go-go-parc vault).   \n\nThen update ui/GUIDELINES.md document on how to write and add new tsx elements (atoms, molecules, organisms, apps, tiles, etc...)."

**Assistant interpretation:** Write the v0.5 report in the series' textbook
style, push the vault, then extend the guidelines with a procedural authoring
section covering every kind of thing someone might add.

**Inferred user intent:** The guidelines as written say what the rules *are*.
They do not say what to type. Someone adding their first component needs both,
and the second is what makes the first survive contact with a deadline.

**Commit (vault):** `72590db` — "PROJECT REPORT - go-go-datadrop v0.5"
**Commit (code):** `9e1d20b` — "GUIDELINES: how to add a component, an application, or a workspace"

### What I did

- Wrote the 390-line report at
  `Projects/2026/07/25/PROJECT REPORT - go-go-datadrop v0.5 - The Missing Middle, and Six Copies of One Style Object.md`.
  One mermaid diagram of the graph change; four wikilinks to v0.1–v0.4, all
  verified to resolve; grep for analogy markers returned nothing.
- Staged only the report, leaving `.obsidian/app.json`, `.pi/` and `.ttmp.yaml`
  untouched. Committed `72590db` and pushed to `main`.
- Added `GUIDELINES.md` §8 in seven subsections: the four files, the component,
  the CSS module, the story, a new application, a hardwired workspace, and what
  to run before committing. Renumbered the three sections after it.

### Why

**The report's spine is the measurement rather than the refactor.** A project
report about a refactor is usually unreadable because its subject is a
judgement. This one has an empirical claim at the centre — six copies of one
style object that had already split into two font sizes — so the structure
follows from it: the starting position, the measurement, why coverage is
downstream of decomposition, then the findings in the order they were found.

**§8 exists because §1–§7 answer a different question.** They say what the rules
are; someone adding their first atom needs to know what to type. The two most
useful parts are the ones I would not have thought to write without having hit
them: `satisfies Meta<typeof Component>` demanding `args` on the meta even when
every story uses `render`, and the `Live` wrapper for controlled inputs — a
story rendering `<TextInput value="x" onValueChange={() => {}} />` looks right
and cannot be typed into, and a reviewer concludes the component is broken.

### What worked

**Smoke-testing the scaffolding I had just documented, which caught me
overstating what the tests report.** §8.1 originally said "`bun test` now tells
you what is missing". Running the exact commands as written:

```text
(pass) every component directory has a story
(pass) every component directory has a component and a barrel
(pass) no empty component directories
(fail) every story title uses its layer's prefix
  components/atoms/DocTest/DocTest.stories.tsx: no title in the meta literal
```

Four empty files *exist*, so three of the four checks pass. The section now says
so, and says why it is the honest state of affairs: a directory of empty files
is not a missing component, it is an unfinished one, and the title is the first
thing that can actually be wrong. Documentation that describes output nobody
ran is how a guide starts being ignored.

### What didn't work

Nothing failed. One thing was avoided: I did not renumber §8's cross-references
by hand. The insert shifted three sections, and a stale "see §8 of the
checklist" pointer survived the first pass — caught by grepping for `§` rather
than by reading.

### What I learned

**A "how to write X" section should be built from the mistakes made writing X,
not from the finished result.** Everything in §8.2 and §8.4 that is worth
reading came from a specific stumble during phases 1–5: the meta `args`
requirement (eight failing stories in phase 1), the `tile: false` parameter
(atoms have no business assuming a height), unwrapping handlers, and grounding
prop values in call sites (the invented width scale, corrected in phase 2). A
guide written from the end state would have listed the conventions and none of
the reasons.

### What was tricky to build

**Deciding how much of the application-registration mechanism to explain.**
`registerApp` is called for side effects at module scope, and `apps/all.ts`
imports every application for that effect alone. It is a legitimately unusual
pattern and the temptation is to explain the whole design. What §8.5 says
instead is the two things that will actually bite: the `id` is persisted in
saved layouts so renaming one strands them, and `docBound: true` means "a view
of one composition" rather than "shows something", which is why exactly four
applications are.

### What warrants a second pair of eyes

- **§8 is 240 lines and the whole document is now 503.** There is a length past
  which a guideline stops being read. Splitting the authoring procedure into its
  own file is a reasonable counter-argument.
- **The report claims 12 122 insertions across 182 files.** That includes the
  built bundle under `pkg/webui/dist`, which is committed. Not wrong, but a
  reader may reasonably expect that number to be source.

### What should be done in the future

Nothing outstanding. The four open questions from guide §29.3 remain open and
are restated in the report.

### Code review instructions

- `ui/GUIDELINES.md` §8.1 — run the commands exactly as written and confirm the
  output block matches. If it does not, the section is stale and everything
  after it is suspect.
- Then §8.5 against `apps/SignInApp/SignInApp.tsx`, which is the shortest
  container in the tree and the template the section describes.
- The vault report needs no code review, but its §"What generalises" is the part
  worth disagreeing with.

### Technical details

```text
vault report      390 lines, 1 mermaid diagram, 4 wikilinks (all resolve)
GUIDELINES.md     263 -> 503 lines; §8 added, §§9-11 renumbered
verification      bun test --cwd ui: 177 pass
```

## Step 12: The orphaned molecules, and the gap the question exposed

The user asked why the applications were not extracted into Storybook. Checking
rather than answering from memory found something worse than the gap they were
asking about: **four molecules built in phase 4 were used by nothing**, and one
of them had made a duplication worse rather than better.

### Prompt Context

**User prompt (verbatim):** "Why did you not extract the apps into the storybook?"

**Assistant interpretation:** Account for the applications that have no panel
and no story, and say why.

**Inferred user intent:** They had noticed that the coverage claim and the
covered surface are not the same thing, and wanted the difference named.

**Commit (code):** `9ba5f0e` — "Adopt the orphaned molecules, and delete the one with no call site"
**Commit (vault):** `a2b5aae` — "PROJECT REPORT v0.5 - correct a false claim, and name the gap it revealed"

### What I did

- Measured it: 4 of 17 applications have panels. The other 13, ~2 000 lines
  including the two largest, have neither panel nor story.
- Found `ChannelRow`, `Legend`, `KeyValueList` used by nothing, and `StepRow`
  never written at all despite appearing in this diary's phase-4 "What I did".
- Adopted `ChannelRow` into `EncodingApp` and into `Pbui.stories.tsx`; adopted
  `Legend` into `ChartApp`; wrote and adopted `StepRow`; deleted `KeyValueList`.
- Corrected the pushed vault report, which asserted a falsehood.
- Extracted `ChartPanel` (238 → 77 lines in the application) with 12 stories.
- Added `fixtures/charts.ts`, so stories drive the real engine.

### Why

**The false claim had to be corrected in the body of the report, not a
footnote.** The phase-4 commit message and the v0.5 report both said
`ChannelRow` "now exists once instead of twice". It did not. The molecule was
built and neither call site rewired, so there were three implementations — and
the design guide §17.4 says in bold that this outcome is *worse* than not
building the component, because it converts one duplication into two. I wrote
that sentence and then did the thing it forbids.

**`KeyValueList` was deleted rather than given a home.** The inspector dumps
JSON and the source browser uses section headings; it has no call site and never
did. It is the same error as `Inline`, `ScrollRegion`, `CountBadge` and
`FormRow` — a component ported from the reference package's inventory rather
than derived from a call site — except that I caught those four before building
and this one after. Manufacturing a use for it would have been worse than
deleting it.

### What didn't work

**A story that built and passed and was wrong.** The first `ChartPanel` stories
used field names I had assumed: `ts` and `temp_c`. The `readings` fixture is an
*event stream*, so its payload columns are dotted — `time`, `data.temp_c`. The
typecheck passed (both are strings), the suite passed, `build-storybook`
succeeded, and the story rendered:

```text
Nothing to draw yet
 · x ↦ ts is not in the pipeline output
 · y ↦ temp_c is not in the pipeline output
```

The panel was behaving perfectly — saying precisely which part was missing —
and the story was nonsense. Only opening it in a browser showed that. This is
the second time in the ticket that a green suite covered a wrong result, and
both times the check that caught it was looking at the thing.

**A second browser-only defect in the same component: the SVG clipped.**
`reset.css` sets `svg { max-width: 100% }`, so a plot drawn at 560px inside a
620px tile — minus padding — is scaled down and its right-hand content is cut
off. Four bars became three and a half. In the application this cannot happen,
because the ResizeObserver measures the real container and hands that number to
`buildPlot`; in a story the two numbers are independent and must be chosen to
agree. The story parameters now carry the reason.

### What I learned

**"Every component has a story" and "the interface is covered" are different
claims, and the enforcement only makes the first.** `stories.test.ts` cannot see
UI that was never made a component, so 2 000 lines of application JSX passes it
in silence. That is the same shape as the layer-test hole found in phase 5: a
check that inspects what is registered cannot report what was never registered.
The general form is worth keeping: **an enforcement mechanism defines a
boundary, and everything outside it is invisible to that mechanism rather than
merely unchecked.**

**Stories should drive the real engine.** `buildPlot` and `evaluate` are pure,
so a story can call them and show the actual output of the actual code path. The
alternative — a hand-written `Plot` literal — asserts what the engine produces
and drifts the moment a scale changes. `fixtures/charts.ts` exists so that four
components can do this, and so the dotted field names are named *once* rather
than guessed five more times.

The most valuable story this unlocked is `SummarizedByStation`: a bar chart of
`evaluate`'s output, one bar per station, with real means. Reaching that by
clicking means loading a source, adding a summarize step, choosing a group key
and choosing an aggregate. Here it is one line.

### What was tricky to build

**Deciding whether `ChartPanel` may wrap its own marks in `Presentation`.**
DR-38 forbids it, and four molecules take a render prop precisely to avoid it.
But a scatter plot has hundreds of marks, and a render prop per mark is an
absurdity rather than a seam.

The resolution is that the chart holds the same exception the `*Chip` atoms
hold, for the same stated reason: a presentation is what a mark *is* here, not a
decoration applied to it. Its stories rely on the global `withPbui` decorator,
exactly as every chip story does. The panel's docstring says so, because the
next reader will otherwise see a rule being broken rather than an exception
being exercised.

**The story helper is a plain module, not a hook, and the distinction matters.**
`buildPlot` is synchronous and pure, so a function is the right shape;
`useDocPlot` is a hook only because it reads the store and the RTK Query cache.
The panels are presentational and take data as props, so they need the function.
A `withDocument` decorator that seeds the store is what the remaining
*applications* will need, and it is not built yet.

### What warrants a second pair of eyes

- **The `ChartPanel` presentation exception.** It is the second exception to
  DR-38 and exceptions compound. A reviewer should agree that "hundreds of
  marks" is the line, and that the next component claiming it needs a stronger
  argument than the last.
- **`fixtures/charts.ts` mutable `stepId` counter.** Ids are stable within a
  module load, which is what a story needs, but two stories built at import time
  get different ids across a hot reload. Nothing depends on it today.
- **The deletion of `KeyValueList`.** If someone wants a metadata block later,
  it is in the history.

### What should be done in the future

- The remaining 12 applications. `PipelinePanel`, `SourcePanel` and
  `TablePanel` are next by value — the source browser's error state ("Could not
  list drops. If this server requires a token…") is exactly an awkward mode.
- A `withDocument` Storybook decorator that seeds a document and its table into
  the store, so components and applications that read `useDocPipeline` can be
  storied at all.
- Consider a test that measures unstoried application JSX, so the gap this step
  exposed cannot recur silently.

### Code review instructions

- `git show 9ba5f0e` — the adoption. The one to read is `pbui/Pbui.stories.tsx`,
  whose local channel row is now only the accept call and the type filter that
  are genuinely the story's own.
- Then `fixtures/charts.ts`, then `ChartPanel.stories.tsx` →
  `SummarizedByStation`, which is a chart of pipeline output built by the
  pipeline.
- Validate:
  ```bash
  bun test --cwd ui                 # 177
  bun run --cwd=ui build-storybook  # 193 stories
  make storybook                    # then open ChartPanel and look at it
  ```

### Technical details

```text
                              before   after
ChartApp                         238      77 lines
ChartPanel (new organism)          —     217
molecules used by nothing          4       0   (3 adopted, 1 deleted)
stories                          181     193
```

## Step 13: Three panels, and two live defects the stories found

`ChartPanel`, `SourcePanel` and `TablePanel`. ChartApp 238 → 77 lines, SourceApp
181 → 93, TableApp 93 → 31. Storybook at 208 stories.

The extraction was the task. The two defects it surfaced are the result worth
recording, because both had been live for two releases and both were invisible
to a green test suite.

### Prompt Context

**User prompt (verbatim):** "properly set up the chartpanel so it actually shows data, it needs a pipeline for that. Maybe we can use hooks for data source / pipeline source ?"

**Second user prompt (verbatim):** "the table seems to spread outside of the frame, but that's maybe because the frame is limited? in http://localhost:6006/?path=/story/component-library-organisms-tablepanel--populated"

**Assistant interpretation:** Make the chart stories show real data through the
real pipeline rather than contrived arguments; then diagnose the table
overflowing its tile.

**Inferred user intent:** A story that does not show the component doing its
actual job is not coverage. And they had spotted, correctly, that a table
painting outside its frame is a bug rather than a framing artifact.

**Commit (code):** `b707970` — "Extract SourcePanel and TablePanel"
**Commit (code):** `5463c64` — "Fix two defects the panel stories found"

### What I did

- Extracted `ChartPanel`, `SourcePanel`, `TablePanel`, each with stories.
- Added `fixtures/charts.ts` so stories drive `buildPlot` and `evaluate`.
- Fixed `useTableFor` to return the pipeline output (see below).
- Fixed the Storybook decorator chain, which had an unbounded middle.

### Why

**`useTableFor` returning the source table was wrong, and the encoding editor
contradicted itself because of it.** `resolveField` resolves a field chip
against `env.tableFor(docId)`, which returned the *source* table from the RTK
Query cache. So any column a step **produces** — `mean_data.temp_c`, a derived
name — was not found, and the chip rendered stale: dashed border, warning glyph,
"not in the pipeline output". It *is* the pipeline output; it is the source it
is absent from.

`EncodingApp` computes staleness correctly, from `pipeline.fields`, and then
drew a chip beside it that computed the opposite answer. After any summarize
step the row said "not stale" and the chip in it said "stale".

The fix returns the evaluated table. The user chose that over adding a second
resolver, and it settles a second question in the same stroke: a descriptor's
statistics — `n`, `min`, `max`, `mean` — now describe the rows the chart *drew*
rather than the rows the server sent, which is what a presentation of something
on screen should report. A source column that a step has since dropped now reads
as missing, which is correct.

### What didn't work

**A story that built, typechecked, passed the suite, and was nonsense.** The
first `ChartPanel` stories used `ts` and `temp_c`. The `readings` fixture is an
event stream, so its payload columns are dotted: `time`, `data.temp_c`. Both are
strings, so nothing failed, and the story rendered:

```text
Nothing to draw yet
 · x ↦ ts is not in the pipeline output
```

The panel was behaving perfectly and the arguments were wrong. `fixtures/charts.ts`
now names those columns once so it cannot happen five more times.

**The SVG clipped, because of a rule in the reset.** `reset.css` sets
`svg { max-width: 100% }`, so a plot drawn at 560px inside a 620px tile — minus
padding — is scaled down and its right-hand content is cut off. Four bars became
three and a half. In the application this cannot happen: the ResizeObserver
measures the container and hands that number to `buildPlot`, so the two agree by
construction. In a story they are independent and must be chosen to agree.

**And then the table escaped its tile entirely — which the user spotted.** My
first instinct was that `AppBody` has `overflow: auto` so it must be scrolling,
and the frame was simply short. Measuring instead of reasoning found otherwise:

```text
tile      620 × 420   overflow: visible   scrollHeight: 3145
  child   h 416       min-height: 320px   flex: 0 1 auto
```

The tile's only child is `withPbui`'s wrapper, and it had `minHeight: 320` with
**no `flex: 1` and no `min-height: 0`**. So it grew to fit its content instead of
being bounded by the tile, `AppBody`'s `overflow: auto` never engaged, and 360
rows painted straight out of the bottom of the frame.

That is not a TablePanel problem. **Every tile-decorated story in the whole
Storybook had an unbounded middle**; only a story with tall content could show
it, and until this one there was none. The chart stories missed it because an
SVG has a fixed height.

Two changes: the wrapper takes `flex: 1; min-height: 0`, and the tile decorator
gains `overflow: hidden` — because a real tile clips, and without that a child
that fails to bound itself paints outside the frame while the story looks fine.

### What I learned

**`min-height: 0` is the half that is always omitted.** A flex child defaults to
`min-height: auto`, which refuses to shrink below its content. `Stack`'s CSS has
a comment calling this "the single most common flexbox bug and cheaper to
prevent everywhere than to diagnose once" — and the story harness had it anyway,
in a file nobody thought of as a component.

**A decorator is production code for the purposes of being wrong.** It renders
in every story, so a defect in it is a defect in every story simultaneously, and
it is the one place nothing reviews because it is "just the harness".

**Stories should hand the environment what the application hands it.**
`tableAfter()` exists so a story of a transformed relation supplies the pipeline
output to the PBUI environment, exactly as `useTableFor` now does. Without it
the story would have gone on showing stale chips after the application stopped.

### What was tricky to build

**Deciding whether `ChartPanel` may wrap its own marks in `Presentation`.**
DR-38 forbids it and four molecules take render props to avoid it — but a
scatter plot has hundreds of marks and a render prop per mark is an absurdity
rather than a seam. It holds the same exception the `*Chip` atoms hold, for the
same stated reason: a presentation is what a mark *is*, not a decoration applied
to it. `TablePanel` claims the same exception for its cells. That is now two
exceptions, and the next one needs a better argument than these.

### What warrants a second pair of eyes

- **`useTableFor` now evaluates the pipeline on every call**, and descriptors
  call it from menu handlers. `evaluate` is memoised nowhere in that path. It
  runs once per menu open over at most the row budget, so this is very probably
  fine, and it is the sort of "very probably" worth a second opinion.
- **Statistics changed meaning** for every descriptor. A `<field>` inspected
  after a summarize step now reports n=4, not n=360. That is what was asked for
  and it is still a behaviour change users will notice.
- **`overflow: hidden` on the tile decorator** makes stories stricter than
  before. If a story now clips something it did not, the component was already
  overflowing and the story was hiding it.

### What should be done in the future

- The remaining nine applications. `PipelinePanel` is next by size.
- A regression guard for the `tableFor` semantics. The story shows it; nothing
  fails if it regresses.

### Code review instructions

- `apps/useTable.ts` → `useTableFor`, and its docstring, which states the
  argument rather than the change.
- `.storybook/withPbui.tsx` and `decorators.tsx` — the harness fix. Open any
  tile story with tall content and confirm it scrolls inside the frame.
- `fixtures/charts.ts` → `tableAfter`, and `TablePanel.stories.tsx` →
  `Summarized`, which is the pair that keeps the story honest.

### Technical details

```text
                        before   after
ChartApp                   238      77
SourceApp                  181      93
TableApp                    93      31
stories                    193     208
```
