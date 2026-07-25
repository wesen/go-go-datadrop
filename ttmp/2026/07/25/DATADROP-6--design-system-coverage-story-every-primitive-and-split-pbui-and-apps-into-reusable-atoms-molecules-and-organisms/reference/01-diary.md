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
