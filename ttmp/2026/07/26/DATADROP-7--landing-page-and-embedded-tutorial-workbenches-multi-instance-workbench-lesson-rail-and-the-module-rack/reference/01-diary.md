---
Title: Diary
Ticket: DATADROP-7
Status: active
Topics:
    - frontend
    - landing-page
    - tutorial
    - pbui
    - architecture
    - embedding
    - storybook
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/07/26/DATADROP-7--landing-page-and-embedded-tutorial-workbenches-multi-instance-workbench-lesson-rail-and-the-module-rack/design/01-the-landing-page-the-embedded-workbench-and-the-lesson-rail-analysis-design-and-implementation-guide.md
      Note: The guide this step produced
    - Path: repo://ui/src/api/client.ts
      Note: PATHS exists because a built RTK endpoint does not expose its query at runtime (commit 8302e2c)
    - Path: repo://ui/src/api/fixtureBaseQuery.ts
      Note: The interception point; its docstring names its own fragility (commit 8302e2c)
    - Path: repo://ui/src/appkit/AppScope.tsx
      Note: DR-53; the registry stays global and only the visible set is per instance (commit 24d0a07)
    - Path: repo://ui/src/appkit/lessons.ts
      Note: The Lesson contract, in appkit for DR-33's reason — both organisms and tour already depend on it (commit f7b4261)
    - Path: repo://ui/src/appkit/usePersistence.ts
      Note: The debounced write, or nothing at all when the key is null (commit 4796da2)
    - Path: repo://ui/src/components/atoms/Tick/Tick.tsx
      Note: Extracted from Tutorial.tsx, where it was an inline style object and aria-hidden (commit f7b4261)
    - Path: repo://ui/src/components/organisms/LessonRail/LessonRail.tsx
      Note: The completion loop, and the auto-advance whose exception the browser found (commit f7b4261)
    - Path: repo://ui/src/components/pages/Workbench/WorkbenchProviders.tsx
      Note: Separate so the lesson rail can be a sibling of the shell inside one PbuiProvider — DR-55 (commit 24d0a07)
    - Path: repo://ui/src/components/pages/WorkbenchInstance/WorkbenchInstance.tsx
      Note: The embeddable unit; the ref-with-null-check is correct under StrictMode where useState's initialiser is not (commit 24d0a07)
    - Path: repo://ui/src/main.tsx
      Note: Line 9 is the only runtime import of the store singleton in the whole frontend — the finding the design rests on
    - Path: repo://ui/src/store/index.ts
      Note: makeStore is now the only way to get a store; the preloadedState comment describes the two defects one store could not reveal (commit 4796da2)
    - Path: repo://ui/test/fixture-query.test.ts
      Note: The round-trip guard, verified by renaming the stream table path (commit 8302e2c)
    - Path: repo://ui/test/instances.test.ts
      Note: Ten tests; both ambient-store guards verified by breaking them (commit 4796da2)
    - Path: repo://ui/test/no-raw-controls.test.ts
      Note: Rule 4 matches a typed const declaration, not an inline style literal, which is why Tutorial.tsx slips through
ExternalSources: []
Summary: ""
LastUpdated: 2026-07-26T11:34:56.470862624-04:00
WhatFor: ""
WhenToUse: ""
---






# Diary

## Goal

DATADROP-7: import the landing-page prototype, analyse it in depth against the
real application, decide which new atoms are needed and how the architecture has
to change now that multiple workspaces can be embedded in one page, and write
the guide.

## Step 1: Reading the prototype, and reading our own tree against it

`~/Downloads/pbui-landing.jsx` is 2 719 lines in one module with no imports
beyond React. It embeds five independent copies of the workbench in a scrolling
page, each with its own `World`, its own workspaces and its own accept
plumbing, and puts a rail of lesson steps beside each one that ticks itself off
by *observing world state* rather than by watching which button was pressed.

I read it in four passes — the band map, then `Workbench` (1466–1761), then the
lesson machinery (1763–1988), then the content and the page (2131–2719) — and
then read our own tree looking for the specific places that assume one
workbench per page. That second half is where the useful part of the work
happened: the architectural question turned out to have a much smaller answer
than I expected.

### Prompt Context

**User prompt (verbatim):** "ok, let's import the landing page / tutorial side of things, and create a new ticket for that. Import @~/Downloads/pbui-landing.jsx and analyze it in depth and make a plan on which new atoms we might need, how we should approach / modify the overall architecture of our react system, now that we can embed multiple workspaces in one page, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Open a ticket for the landing page and tutorial
work, import the prototype into it, analyse it thoroughly, decide the component
inventory and the architectural changes multi-instance embedding forces, write
an intern-level technical guide with prose, pseudocode, diagrams and file
references, and put it on the reMarkable.

**Inferred user intent:** They have a design they want built, and they want the
analysis done before any code — the same sequence as DATADROP-6, which worked.
The specific worry named in the prompt is architectural: "now that we can embed
multiple workspaces in one page" is a request to find out what breaks.

**Commit (docs):** `f858f68` — "DATADROP-7: the landing page, the embedded workbench, and the lesson rail"

### What I did

- Read `pbui-landing.jsx` in full and built the twelve-band line map that is
  §3 of the guide.
- Read our tree against it: `store/index.ts`, `store/persist.ts`,
  `store/layout.ts`, `store/spaces.ts`, `store/world.ts`, `store/applyVerb.ts`,
  `pbui/PbuiProvider.tsx`, `pbui/types.ts`, `pbui/ObjectMenu.tsx`,
  `appkit/registry.ts`, `apps/useTable.ts`, `apps/all.ts`,
  `apps/tutorials/Tutorial.tsx`, `components/pages/Workbench/`,
  `components/organisms/Tile/`, all five component barrels, `test/layers.test.ts`,
  `test/no-raw-controls.test.ts`, `.storybook/withPbui.tsx`, `vite.config.ts`
  and `pkg/webui/webui.go`.
- Ran the singleton census (below), which is what settled the design.
- Created the ticket, imported the prototype to `sources/`, wrote the 1 578-line
  guide, the index overview, seven phase tasks, the changelog entry, eight
  related-file notes, and a pandoc playbook.
- Built a 27-page PDF and put it on the device at `Projects/2026/07`.

### Why

The prompt asks two questions — which atoms, and what architecture — and only
the second one is hard. The atoms fall out of reading the prototype's teaching
layer and checking each candidate against the barrels we already have. The
architecture question needed evidence, so I went looking for it rather than
reasoning about it.

### What worked

**The singleton census was the whole step.** One command:

```console
$ grep -rn 'from "[./]*store"' src .storybook test | grep -v 'import type'
src/main.tsx:9:import { store } from "./store";
```

Sixteen files name the store module; fifteen of them import only `type
RootState` or `type AppDispatch`. **There is exactly one runtime import of the
store singleton in the entire frontend.** That single fact turned the ticket
from "how do we make the workbench embeddable" into "which seven lines have to
move", and it is the reason the guide's phases 1–3 are small.

The second-best finding came from the same direction. The prototype has a
`probeRef` written *during render* (`pbui-landing.jsx:1667-1674`) so the lesson
rail can see the tile layout, which lives in `Workbench`'s `useState`. Our
layout is a Redux slice in the same store as the world. So a predicate that
needs tile count and a predicate that needs the pipeline both come from one
`useSelector`, and the probe — along with its render-phase side effect —
disappears. That became DR-49.

**Enumerating the failure mode per singleton, rather than listing them.** The
persistence key (`persist.ts:20`) is not just "shared"; five instances each run
a 500 ms debounced `save()` against one key, so the reader's real workbench
layout is overwritten by whichever tutorial section they last scrolled past, and
nothing tells them. Writing that sentence is what made it obvious that
`persistKey` must default to `null` rather than to the product's key — an
embedded instance that forgets to opt out must be harmless, not destructive.

### What didn't work

**The reMarkable font fallback was wrong in the playbook I had just written,
and I found out by running it.** DATADROP-6's diary recorded that switching
pandoc to DejaVu fixed the `✓` U+2713 warnings and that only `⌖` U+2316 needed
a per-codepoint fallback. The first build of this guide produced:

```text
[WARNING] Missing character: There is no ✓ (U+2713) in font DejaVu Sans Mono Oblique/OT:s
[WARNING] Missing character: There is no ✓ (U+2713) in font DejaVu Serif/OT:script=latn;l
=== MISSING CHARS: 7 ===
```

`fc-list ':charset=2713' family` does list DejaVu Sans and DejaVu Sans Mono —
but **not DejaVu Serif**, which is the `mainfont`, and not DejaVu Sans Mono
*Oblique*, which is what emphasised code resolves to. A per-*family* check is
not a per-*face* check. Adding `✓` and `✕` to the `newunicodechar` map alongside
`⌖` produced a clean build:

```text
=== MISSING CHARS: 0 ===
Pages: 27
```

The playbook now says this, with the log lines, because the previous diary's
version of the lesson was confidently wrong and would have cost the next person
the same twenty minutes.

**One claim in my first draft of the guide was wrong and I corrected it before
committing.** I wrote that `Tutorial.tsx`'s inline style object survives because
`no-raw-controls.test.ts` has an allowlist entry for it. It does not — the
allowlist has five entries and none of them is `apps/`. It survives because rule
4 matches `const \w+: CSSProperties` and an inline `style={{ … }}` literal in
JSX is not a typed const declaration. That is a real gap in the test, and saying
so accurately is more useful than the wrong version, which would have sent
someone looking for an allowlist entry that is not there.

### What I learned

**`fc-list ':charset=XXXX' family` answers the family question, not the face
question.** The log names the face (`DejaVu Serif`, `DejaVu Sans Mono Oblique`);
`fc-list` groups by family. When a glyph is missing from a face inside a family
that `fc-list` says has it, the fallback is still needed. The practical rule
stays what DATADROP-6 arrived at — grep the log for `Missing character` and
treat a hit as a build failure — and it is what caught this.

**A prototype's workarounds are evidence about its substrate, not requirements
for yours.** The prototype has three: `probeRef` (state in the wrong place),
`useNarrow` (a resize listener where a media query belongs), and `height` as a
number (the container deciding its own size). We need none of them, and two of
them — the probe and the height — point at things our own tree does better and
worse respectively. `probeRef` we can delete; `height: 100vh` at
`Workbench.module.css:5` is the *same mistake in the mirror*, the container
declaring instead of accepting, and it is the thing that would break embedding
most visibly.

**Four of the seven singletons are in one file, and they have something in
common.** `Workbench.tsx` holds the signed-out gate, `useMeQuery`, the
`?first=1` URL read and the persistence effect. Every one of them is a
*routing/session/authentication* concern, not a shell concern. They ended up
there because there was only ever one shell. Splitting `WorkbenchShell` from the
application is therefore not a new abstraction invented for this ticket — it is
the separation those four lines have been implying since DATADROP-5 added them.

### What was tricky to build

**The data path.** The landing page must render charts with no server, no
account and no drop, while using byte-identical application components — the
moment the page needs a special `ChartApp`, the "nothing here is a mockup" claim
dies and so does the anti-rot property that makes an executable tutorial worth
having.

Our `useDocTable` calls `useStreamTableQuery`/`useDatasetTableQuery` directly
(`useTable.ts:31-50`), so there is no seam. I worked through four mechanisms:

- **MSW** — a service worker shipped in the production bundle to serve fixtures,
  intercepting the real API too. Too much machinery for the problem.
- **A second `createApi`** — `reducerPath` and the generated hooks are fixed at
  `createApi`, so two apis means two hook sets and a conditional import at every
  call site. Fails the "no change to application code" requirement outright.
- **A `TableSource` context supplying the hook** — legal only while the context
  value never changes identity after mount. That is a rule no test can express
  and every future contributor can break, which makes it the wrong default even
  though it is the tidiest design on paper.
- **A `baseQuery` consulting a fixture map on the store's thunk extra
  argument** — chosen. RTK Query hands `api.extra` to every `baseQuery` call and
  `configureStore` takes the extra argument per store, so the fixture map's
  scope is exactly the instance's scope, and no call site changes.

The remaining sharp edge is that the adapter has to parse a request URL back
into a `SourceRef`, because RTK Query offers no hook between the generated hook
and the base query. A renamed query parameter would silently break the landing
page and nothing else. The mitigation is a round-trip test — build the request
with the api's own `query` function, parse it back, assert equality — and the
guide says it must be written in the same phase as the adapter rather than after,
because that is the only thing standing between a rename and a page full of "no
fixture for this source".

**The second tricky thing is smaller and I have flagged it rather than solved
it.** `WorkbenchInstance` belongs in `appkit` conceptually — it is the
composition contract, not a visual component — but it renders
`pages/WorkbenchShell`, which adds an `appkit → components` edge while
`organisms/Tile` already imports `appkit/registry`. `test/layers.test.ts` is a
*directory* graph, not a module graph, so it will probably call that a cycle.
The guide says to check it in phase 1, before phase 2 depends on it, and names
the fallback (put the instance in `components/pages/` beside the shell) so that
finding out costs nothing.

### What warrants a second pair of eyes

- **The `appkit → components` edge.** §23 and §27 of the guide. This is the one
  design decision that could turn out to be structurally illegal, and it is
  cheap to check first.
- **The choice of mechanism (d) for fixtures.** §16's table. If someone has used
  RTK Query's `extra` argument this way before and knows a reason it does not
  survive `setupListeners` or a refetch-on-focus, I would rather hear it now.
- **DR-56, not persisting lesson progress.** It is the right call for a page a
  reader passes through once, but it is a product judgement rather than a
  technical one, and it is stated as a decision rather than an option.

### What should be done in the future

- Phase 1. Nothing in this step blocks it, and phases 1–3 are worth landing even
  if the landing page is deprioritised.
- DATADROP-6's design/02 phases 1–6 remain open and are independent of this
  ticket. Neither blocks the other. If both are worked, DATADROP-6 phase 1
  (splitting `PbuiEnvironment`) should land first, because it touches
  `useTable.ts`, which DATADROP-7 phase 3 also touches.
- The `no-raw-controls.test.ts` gap found in §22.1 — inline `style={{ … }}`
  literals are not matched by rule 4 — deserves either a fifth rule or a
  deliberate decision that inline literals are acceptable. Extracting `Tick`
  removes the specific instance but not the gap.

### Code review instructions

- Start at the guide's §15, the seven singletons. Each row is a file and a line;
  check three of them and decide whether the failure mode as described is real.
- Then §16–§20, the data path. That is the largest design decision and the one
  with a named fragility.
- `index.md`'s DR table must agree with guide §28. A table that disagrees with
  its own document is worse than no table — this is the check DATADROP-6's
  review instructions asked for, for the same reason.
- Re-run `docmgr ticket list | grep -c DATADROP-7` after any frontmatter edit.
  It returned 2 before committing. DATADROP-5 was once silently dropped from the
  listing by invalid YAML in a related-file note beginning with a `"`.

### Technical details

The band map that made the prototype navigable — 60 % of it re-derives things
we already have:

```text
lines        band                       our equivalent
  16- 144    palette, helpers, data     styles/tokens.css, fixtures/*.json
 146- 270    pipeline engine            model/pipeline.ts
 272- 423    class World                store/world.ts
 425- 603    plot engine                model/plot.ts
 605- 660    PBUI core                  pbui/
 662- 763    chart renderers            organisms/ChartPanel
 765- 887    window manager             store/layout.ts, organisms/SplitView, Tile
 889-1464    shared bits + 12 apps      components/atoms, apps/, appkit/registry.ts
1466-1761    Workbench                  pages/Workbench          ← READ THIS
1763-1988    lesson machinery           nothing                  ← AND THIS
1990-2044    ModuleRack                 nothing
2046-2129    page furniture             partly foundation
2131-2476    content                    nothing
2478-2719    App                        nothing
```

The completion loop, which is the single most important passage in the file
(`pbui-landing.jsx:1828-1839`), and DR-50 in eleven lines:

```jsx
useEffect(() => {                             // no dep array — runs every render
  setDone((d) => {
    let changed = false; const next = { ...d };
    lessons.forEach((l) => {
      if (next[l.id] || !l.done) return;      // monotonic: a lesson never un-ticks
      let ok = false;
      try { ok = !!l.done(world, probeRef.current || {}); } catch { ok = false; }
      if (ok) { next[l.id] = ranRef.current[l.id] ? "watched" : "self"; changed = true; }
    });
    return changed ? next : d;                // identity return ends the update
  });
});
```

Counts and measurements taken during the step:

```text
prototype                                    2719 lines, 271 inline style objects
our src                                       246 files,  50 inline style objects
runtime imports of the store singleton          1  (main.tsx:9)
type-only imports of the store module          16
singletons that must move                       7  (4 of them in Workbench.tsx)
new components proposed                        14  (1 atom, 6 molecules, 3 organisms, 4 page/appkit)
prototype components deliberately not built     5  (Btn, Sel, Num, TBtn, useNarrow)
applications registered today                  21  (prototype documents 12)
guide                                        1578 lines → 27-page PDF
```

The PDF build, corrected from DATADROP-6's playbook:

```bash
cat > /tmp/fallback.tex <<'TEX'
\usepackage{newunicodechar}
\newfontfamily\symbolfont{Noto Sans Symbols2}
\newunicodechar{⌖}{{\symbolfont ⌖}}
\newunicodechar{✓}{{\symbolfont ✓}}     # ← DejaVu Serif does not have this
\newunicodechar{✕}{{\symbolfont ✕}}
TEX

pandoc design/01-….md -o DATADROP-7-landing-page-and-embedded-workbenches.pdf \
  --pdf-engine=xelatex -V geometry:margin=2cm -V fontsize=9pt \
  -V mainfont="DejaVu Serif" -V monofont="DejaVu Sans Mono" \
  -V sansfont="DejaVu Sans" -H /tmp/fallback.tex --toc --toc-depth=2 \
  2>&1 | tee /tmp/pandoc.log
grep -c 'Missing character' /tmp/pandoc.log   # must be 0

rmapi put DATADROP-7-landing-page-and-embedded-workbenches.pdf Projects/2026/07
rmapi ls Projects/2026/07
```

Result: 27 pages, 205 KB, no missing characters, on the device beside the
DATADROP-6 guide.

## Step 2: Phase 1 — the store becomes a factory and only a factory

The seven singletons the guide names are what stand between us and five
workbenches on a page. Three of them are in the store layer, and this step
removed all three: the constructed `store` export, the module-constant
persistence key, and the seed-a-document block that was a property of *the*
store rather than of *a* store.

The step also answered the guide's largest open risk before anything could
depend on the answer, and found two defects that had been invisible for the
same reason all seven singletons were invisible — there has only ever been one
store, so nothing could observe that the second one would be wrong.

### Prompt Context

**User prompt (verbatim):** "Implement the ticket, keep a frequent and detailed diary as you work (see skill for the format, it is vital you do the frequent writinge _AND_ make sure the format matches the skill), commit at appropriate intervals."

**Assistant interpretation:** Work through DATADROP-7's phases, writing a diary
step per phase in the skill's format and committing at each phase boundary.

**Inferred user intent:** The analysis is done and they want it built. The
emphasis on frequency and format is a correction of a habit — a diary written
at the end is a summary, and a summary loses exactly the failures that make the
diary worth keeping.

**Commit (code):** `4796da2` — "DATADROP-7 phase 1: the store is a factory and only a factory"

### What I did

- Read `test/layers.test.ts` in full to settle the `appkit → components` risk
  before phase 2 could depend on it (below).
- `store/index.ts`: deleted `export const store`, the module-load `load()` and
  the seed block. `makeStore(options)` now takes `{ preloaded?, seed? }` and
  seeds a document itself, defaulting to true.
- `store/persist.ts`: `save(key, …)`, `load(key)`, `clear(key)`, and an exported
  `WORKBENCH_KEY`.
- `appkit/usePersistence.ts` (new, 40 lines): the debounced write, or nothing at
  all when the key is null.
- `Workbench` takes `persistKey?: string | null`, **defaulting to null**.
- `main.tsx` constructs the product's store, restores from localStorage, and
  passes `WORKBENCH_KEY` explicitly.
- `test/instances.test.ts` (new, 10 tests).

### Why

**The default on `persistKey` is the whole design decision.** It could have
defaulted to `WORKBENCH_KEY`, which would have made `main.tsx` shorter and every
call site quieter. That is the wrong direction: with five instances on a page,
an embedded workbench that forgets to opt *out* silently overwrites the reader's
real layout, and the failure has no error, no warning and no symptom until they
next open the product and find their tiles rearranged. Defaulting to null means
the same mistake produces an instance that persists nothing, which is
recoverable and obvious. The application opts in, in one place, in a file whose
job is to know it is the application.

**`usePersistence` went in `appkit` rather than in `store` or beside the shell.**
`store/` may not import React — it is reducers and pure functions — and the
shell is exactly the place the effect had to leave. `appkit` already declares
`["model", "pbui", "store"]` in the layer graph, so the hook needed no new edge.

### What worked

**Settling the `appkit → components` risk by reading the test rather than by
running it.** The guide flagged this as the largest open risk and said to check
it in phase 1. `layers.test.ts` turns out to have **no cycle detection at all** —
it is `ALLOWED[from].includes(to)`, a declared-edge check. So adding `pages` to
`appkit`'s list would have *passed*, while making the table self-contradictory:
`appkit → pages` and `pages → appkit` both declared, in a file whose describe
block is called "the layer graph is one-way".

That is worse than a test failure, because a test failure is loud and a quietly
meaningless invariant is not. **Decision: `WorkbenchInstance` goes in
`components/pages/`, beside the shell.** That was the fallback the guide already
named as costing nothing, and it costs nothing: `pages` may already import
`appkit`, `store`, `pbui` and every component layer, so the instance needs no
new edge in either direction. Recorded as DR-57.

**Both guard tests were verified by breaking them**, which is the discipline
DATADROP-6 arrived at after a structural change passed on the first try for the
wrong reason:

```console
$ printf '\nexport const store = makeStore();\n' >> src/store/index.ts && bun test test/instances.test.ts
(fail) there is no ambient store > the store module exports no constructed instance

$ # and, with a runtime `import { store }` added to TraceApp:
(fail) there is no ambient store > nothing outside main.tsx imports a store value
```

The first guard checks by **shape**, not by name — an exported object with
`dispatch` and `getState` — so `export const workbench = makeStore()` fails too.
Checking for the identifier `store` would have been a guard against one spelling.

### What didn't work

**The persistence tests failed on `ReferenceError: localStorage is not defined`.**
Bun's test runner has no DOM, and the existing `store.test.ts` never noticed
because it only exercises `validate` and `findSecrets`, neither of which touches
storage. Fixed with a fifteen-line `Map`-backed stub installed on `globalThis`.

I deliberately did **not** use a spy. A mock recording "setItem was called with
`key-a`" would pass just as happily if `save` wrote identical bytes to both
keys, which is precisely the defect under test. Storing the payloads and reading
them back is the only version that can fail for the right reason.

**One of my own tests was wrong before the code was.** I wrote
`layoutActions.addSpace({ id: "extra", name: "extra", tree: leaf("chart") })`
from memory. The real signature is `prepare(name?: string)` — it generates its
own id and always starts from a launcher leaf (`store/layout.ts:221-231`). The
failure was legible enough (`Expected to contain: "extra"` / `Received: [two
UUIDs]`) that this cost two minutes, but it is a reminder that reading the
reducer is cheaper than guessing at it.

### What I learned

**`layoutSlice`'s `initialState: initialLayout()` is evaluated once, at module
load.** So every store built without a preloaded state started with the *same
workspace id*. With one store that is unobservable. With five it is a page where
five different workspaces claim to be the same object, and a `<Presentation
ptype="workspace" value={id}>` in one instance carries a value another instance
would also recognise.

I found this by writing a test I expected to pass trivially — "workspace ids do
not collide across stores" — and watching it fail. That is the second time in
two tickets that a test written to state the obvious has caught something real,
and the pattern is worth naming: **a test of a property nobody has ever been
able to observe is not redundant, it is the first observation.**

**The same line was hiding a second defect.** `preloadedState` was `undefined`
when no preload was given, so the fallback layout came from the slice —
`initialLayout()`, a single "build" space holding one launcher tile — rather
than from `defaultSpaces()`, the nine-workspace cockpit the product actually
opens on. Which means `Workbench.stories.tsx`, the one page-level story in the
tree and the one the guide describes as "an integration test rather than a
component story", has been rendering **an empty workbench with a single empty
tile** since it was written. It was showing the fallback, not the product.

Both are fixed by the same three lines: `makeStore` now always constructs
`preloadedState`, defaulting the layout to `defaultSpaces()`.

### What was tricky to build

Nothing was mechanically difficult. The judgement that took the longest was the
`persistKey` default, and the way I settled it was to write out both failure
modes and compare them rather than compare the ergonomics:

```text
default = WORKBENCH_KEY        default = null
------------------------       ------------------------
forgot to opt out:             forgot to opt in:
  the reader's real layout       the instance persists
  is silently overwritten        nothing; layout resets
  by a tutorial section          on reload
  they scrolled past
                               recoverable, and visible
  no error, no warning,        the first time you reload
  no symptom until later
```

The asymmetry is total, and it is not close. This is worth doing whenever a
default is genuinely arguable: name what happens when someone forgets, on both
sides, and the argument usually stops.

### What warrants a second pair of eyes

- **The Storybook change.** `makeStore()` now yields `defaultSpaces()` rather
  than one launcher tile, so every story using `withStore` gets nine workspaces
  and a seeded document. I believe this is strictly better and the build is
  clean, but it changes what ~40 stories render behind the component under test,
  and I have not opened Storybook yet.
- **DR-57** — putting `WorkbenchInstance` in `components/pages/` rather than in
  `appkit`. The reasoning is above; if someone prefers to add cycle detection to
  `layers.test.ts` and keep the instance in `appkit`, that is a defensible
  alternative and a bigger change.

### What should be done in the future

- **The null-key case has no test yet.** `usePersistence(null)` returning before
  it creates a timer is a plain early return, and testing it needs a React
  mount, which bun's runner cannot do here. Phase 2's two-instance Storybook
  story exercises the real mount path and is where this belongs. Recording it
  explicitly so it does not quietly become "covered".
- Phase 2, which is now unblocked and has a decision (DR-57) rather than a risk.

### Code review instructions

- Start at `ui/src/store/index.ts`. The comment block above `preloadedState` is
  where the two invisible defects are described; check the claim about
  `initialState` being evaluated once against `store/layout.ts:119-135`.
- `ui/src/main.tsx` and `ui/src/components/pages/Workbench/Workbench.tsx`
  together: confirm that `persistKey` defaults to null in the component and is
  passed explicitly by the application, and that the direction is the safe one.
- `ui/test/instances.test.ts` — reproduce both guard breakages. They take about
  thirty seconds each and are the only way to know the guards guard anything.
- Validate: `bun run --cwd=ui typecheck && bun test --cwd=ui && bun run --cwd=ui build`.
  **The equals sign in `--cwd=ui` is not optional** — the space-separated form
  prints usage and exits 0 without running.

### Technical details

The seed, moved from beside the singleton into the factory:

```ts
// before — store/index.ts, after `export const store = makeStore(...)`
if (store.getState().world.docOrder.length === 0) {
  store.dispatch(worldSlice.actions.newDoc(null));
}

// after — inside makeStore, so it is a property of every store
if (seed && store.getState().world.docOrder.length === 0) {
  store.dispatch(worldSlice.actions.newDoc(null));
}
```

The unconditional preloaded state, which is the fix for both invisible defects:

```ts
// before: undefined with no preload, so the slices' own initialState won
const preloadedState = preloaded ? { world: …, layout: … } : undefined;

// after
const preloadedState = {
  world: { ...initialWorld, ...preloaded?.world },
  layout: preloaded?.layout ?? defaultSpaces(),
};
```

Verification, in full:

```text
bun run --cwd=ui typecheck   clean
bun test --cwd=ui            187 pass, 0 fail, 15 files   (was 177 / 14)
bun run --cwd=ui build       240 modules, 400.57 kB, 413 ms
```

## Step 3: Phase 2 — the shell splits, and two workbenches share a page

`Workbench.tsx` became three files. The shell kept the chrome, the split tree
and the three PBUI surfaces; the four application concerns — the signed-out
gate, `useMeQuery`, the `?first=1` URL read and persistence — moved up into a
component whose job is to know it is the application. `WorkbenchProviders` came
out separately, and that third file is the one with a non-obvious reason.

Then `WorkbenchInstance`, and the story that is this phase's acceptance test:
two complete workbenches side by side, sharing a module graph, a registry and a
stylesheet, and nothing else. I ran it in a browser rather than trusting the
build, and the numbers came out right — left reaches two documents, right stays
at one.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 2 of the ticket.

**Inferred user intent:** (see Step 2)

**Commit (code):** `24d0a07` — "DATADROP-7 phase 2: split the shell from the application, and embed it"

### What I did

- `WorkbenchShell.tsx` (95 lines): masthead, accept banner, workspace strip,
  canvas, mouse-doc line, object menu. Props: `masthead`, `workspaces`,
  `ambient`. No `useEffect` at all.
- `WorkbenchProviders.tsx` (60 lines): the environment memo, the `perform`
  callback, and `PbuiProvider` around `children`.
- `Workbench.tsx` (90 lines): the gate, the URL read, `usePersistence`, and the
  `.app` wrapper that claims the viewport.
- `WorkbenchInstance.tsx` (130 lines) + module CSS + barrel + stories.
- `appkit/AppScope.tsx`: a context of allowed application ids and
  `useScopedApps()`, adopted by `Tile` and `LauncherApp`.
- `Workbench.module.css`: `.shell` loses `height: 100vh`, gains
  `flex: 1; min-height: 0`; new `.app` takes the viewport.
- `.storybook/withPbui.tsx`: `parameters: { pbui: false }` opt-out.
- `test/stories.test.ts`: `Applications/Embedding` added to the sidebar groups.

### Why

**`WorkbenchProviders` is a separate file because of one lesson.** The obvious
shape is `WorkbenchShell` rendering its own `PbuiProvider` — it is the only
thing that needs it today. But DR-55 requires the lesson rail to be a *sibling*
of the shell, and lesson A4 teaches the accept protocol by pausing a command
and asking the reader to click a field chip in another tile. Its ▶ runner has to
call `accept()`, which returns a promise and lives in React context. With the
provider inside the shell, a rail beside the shell cannot reach it, and the
choice becomes duplicating the accept protocol or dropping the lesson that
teaches the least familiar idea in the whole system.

So the shape is `<WorkbenchProviders>{rail}<WorkbenchShell /></WorkbenchProviders>`,
and the third file exists to make that expressible.

**The tile picker keeps the tile's own application even when the scope excludes
it.** This was not in the design and I nearly shipped without it. A
`<select>` whose `value` matches no `<option>` renders blank, and the next
change event reassigns it to whatever is first in the list — so a tour section
that seeds a layout naming an out-of-scope application would silently lose that
tile the moment anyone touched the dropdown. Showing the current app is the
honest rendering: *this tile is that, and here is what else you may make it.*

### What worked

**Running the story in a browser instead of trusting the build.** DATADROP-6's
sharpest lesson was a `ChartPanel` story that built, typechecked, passed the
suite and rendered "Nothing to draw yet" — only the browser caught it. So I
served `storybook-static` and opened the story:

```text
leftDoc:      "… 3 tiles · 1 workspaces · 2 documents"
rightDoc:     "… 3 tiles · 1 workspaces · 1 documents"
leftOptions:  63     (21 applications × 3 tile pickers, unscoped)
rightOptions: 11     (3 allowed + the tile's own, × 3 pickers)
```

Both properties confirmed against the real DOM, by the real play function.

**The play function reads the DOM, not the store**, and that is deliberate. A
check that reached into `store.getState()` would pass even if the two instances
shared one store and the components were subscribed to the wrong one — it would
be testing my belief about which store is which rather than what the reader
sees. The mouse-doc line reports "N tiles · N workspaces · N documents", which
is the cheapest observable in the shell that describes the *world* rather than
the layout.

**Phase 1's `defaultSpaces()` change paid off immediately and visibly.** The
`Applications/Workbench` story now renders the actual product cockpit —
masthead, nine workspaces, the `build` layout with pipeline, encoding, chart and
table. Before phase 1 it was a single empty launcher tile in one workspace. That
story has existed since DATADROP-4 and has been showing the fallback the whole
time.

### What didn't work

**The instance stories rendered a second accept banner and a second mouse-doc
line, and I did not predict it.** The screenshot showed a stray strip reading
"verbs fired by menu entries appear here" and a second READY line below both
workbenches. The cause is the global `withPbui` decorator, which wraps *every*
story in a `PbuiProvider` plus its own banner, doc line and verb log. React
resolves context to the nearest provider, so the shell was using the right one
and nothing was broken — but a reviewer cannot tell the decorator's chrome from
the instance's own, and a story that teaches something false is worse than no
story.

Fixed by adding `parameters: { pbui: false }` to `withPbui`, returning the story
unwrapped. Three lines, and it is the right escape hatch for any future story
that brings its own context.

**A wrong token name got through typecheck.** I wrote
`border: var(--pbui-border-heavy)` in the instance stylesheet; the token is
`--pbui-border-firm`. CSS custom properties fail silently — an undefined
variable makes the whole declaration invalid and the border simply does not
render. TypeScript cannot see inside a CSS module, and neither can the build.
Caught by `grep border ui/src/styles/tokens.css` while double-checking, not by
any tool. **There is no guard against this class of mistake in the tree**, and
that is worth knowing: a mistyped token is invisible everywhere except in a
browser.

### What I learned

**A `<select>` with a value outside its options is a silent data-loss bug, not
a rendering bug.** It renders blank, which looks like a styling problem, and
then reassigns on the next interaction, which looks like the user's doing. The
general rule this suggests: whenever a list of options is filtered by
configuration, the current value belongs in the list unconditionally.

**Splitting a component along the seam its `useEffect`s already imply is
mechanical.** `Workbench` had two effects and one hook call, and all three were
session concerns; everything else was `useSelector` and JSX. Once that was
visible the split wrote itself, and `WorkbenchShell` came out with *no effects
at all* — which is the property that makes it safe to have five of.

I had written in the guide that "those four lines were always implying" the
split. Doing it confirmed the claim more strongly than I expected: no logic
changed, nothing needed a new prop except the two visibility flags, and the
shell got shorter rather than longer.

### What was tricky to build

**Where `usePersistence` goes inside `WorkbenchInstance`.** It needs the store,
so it must be *below* the `Provider` — but `WorkbenchInstance` is the component
that creates the `Provider`, so it cannot call the hook itself. The options were
to split the component in two, to pass the store down manually, or to render a
null component inside the tree that does nothing but call the hook.

I took the third. `<InstancePersistence persistKey={…} />` renders nothing and
exists solely to be inside the provider. It reads as a hack for about ten
seconds and then reads as the obvious thing: the alternative is a wrapper
component whose only job is to hold a `Provider`, which is the same trick with
more ceremony.

### What warrants a second pair of eyes

- **The `.app` / `.shell` height split.** I verified the product story renders
  full-viewport and the embedded ones respect their container, but only at one
  viewport size. A short viewport with the masthead, strip and doc line all
  present is the case where a missing `min-height: 0` would show.
- **`useScopedApps()` returning registration order rather than the allow-list's
  order.** I think a tour section should not be able to reorder the vocabulary
  it is teaching, but that is a judgement and it is stated in the docstring
  rather than tested.
- **The `pbui: false` decorator opt-out.** It is a global decorator gaining a
  per-story escape hatch, which is a pattern that can spread. Two stories use it
  now; if it reaches five, the decorator is probably wrong.

### What should be done in the future

- **A guard for mistyped CSS custom properties.** `--pbui-border-heavy` cost
  nothing this time because I happened to check, but nothing in the tree would
  have caught it. A test that greps every `var(--pbui-…)` in `src/**/*.css`
  against the names defined in `tokens.css` is about fifteen lines and would
  have failed immediately. Not in this ticket's scope; worth its own.
- **The null-key persistence test**, still owed from phase 1. The two-instance
  story now exercises the real mount path, so the check has somewhere to live —
  but neither instance in it opts in, so the story proves nothing about the key
  being honoured. A third instance with a key, asserting the other two wrote
  nothing, would close it.
- Phase 3, the fixture base query, which is the last of the architectural three.

### Code review instructions

- Read the three files in this order: `WorkbenchShell.tsx` (what is left),
  `Workbench.tsx` (what moved out, and the failure modes in its docstring),
  `WorkbenchProviders.tsx` (why it is separate).
- `WorkbenchInstance.tsx` — the ref-with-null-check, and the reason it is not
  `useState`'s lazy initialiser. StrictMode double-invokes the initialiser.
- Open `Applications/Embedding → TwoInstances` in Storybook and watch the play
  function. Then break it: delete `AppScope` from the right instance's config
  and confirm the third step fails.
- `src/components/organisms/Tile/Tile.tsx:34-46` — the merged options list, and
  whether the argument in the comment holds.
- Validate: `bun run --cwd=ui typecheck && bun test --cwd=ui && bun run --cwd=ui build && bun run --cwd=ui build-storybook`.

### Technical details

The split, by line count:

```text
                          before   after
Workbench.tsx                137      90    the application
WorkbenchShell.tsx             —      95    the shell (no effects)
WorkbenchProviders.tsx         —      60    environment + verb sink
WorkbenchInstance.tsx          —     130    Provider + scope + shell
appkit/AppScope.tsx            —      45    DR-53
```

The composition, which is the point of the phase:

```tsx
// the product — main.tsx supplies the store
<Provider store={store}>
  <Workbench persistKey={WORKBENCH_KEY} />       // gate · URL · persistence
</Provider>

// a tour section — same shell, different configuration
<WorkbenchInstance config={{ apps: [...], preloaded: {...} }}>
  <LessonRail lessons={lessonsC} />              // sibling, inside the providers
</WorkbenchInstance>
```

The browser check, run against `storybook-static` on a local static server
rather than a dev server, so what was verified is what would ship:

```js
leftDoc:      "… 3 tiles · 1 workspaces · 2 documents"   // ＋ pressed here
rightDoc:     "… 3 tiles · 1 workspaces · 1 documents"   // untouched
leftOptions:  63    // 21 applications × 3 pickers
rightOptions: 11    // 3 allowed + own, × 3 pickers
```

## Step 4: Phase 3 — a workbench with data and no server

The last of the three architectural phases, and the one the guide called the
largest design question. A landing page must render real charts with the API
absent, 500ing, or demanding an account — because a landing page's visitor has
no account — while the applications stay *byte-identical* to the product's. The
moment a tour needs its own `ChartApp`, a lesson can go stale without anything
failing, and the claim that the tutorial is executable documentation is dead.

The answer is to intercept as far down as it is possible to go: at the base
query, below every hook and every component. The story I ended on renders 365
chart marks, a four-category legend and 203 table rows with zero requests to
`/v1/`.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 3 of the ticket.

**Inferred user intent:** (see Step 2)

**Commit (code):** `8302e2c` — "DATADROP-7 phase 3: a workbench that answers from fixtures, never the network"

### What I did

- `api/fixtures.ts` (160 lines): `FixtureData`, `applyBudget`, `sameSource`,
  `fixturesFrom(...tables)`, and the three listing derivations.
- `api/fixtureBaseQuery.ts` (140 lines): the wrapper, `sourceFromRequest`, and
  the two refusals.
- `client.ts`: `fetchBaseQuery` extracted to `httpBaseQuery`, wrapped; and
  `PATHS`, the request builders, lifted out of the `query` fields.
- `makeStore({ fixtures })` → thunk extra argument.
- `WorkbenchInstance` config gains `fixtures`.
- `test/fixture-query.test.ts` — 17 tests, and the rename guard verified.
- A `WithFixtures` story, checked in a browser against the static build.

### Why

**The extra argument is the only per-store channel a base query can read**, and
that is the entire reason this mechanism beat the three tidier-looking ones.
`configureStore` takes `thunk: { extraArgument }`, RTK Query hands it to every
base query as `api.extra`, and so the fixture map's scope is *exactly* the
instance's scope — the same boundary the store already draws. Nothing above the
base query has to know it exists, which is what keeps the applications
identical.

**A fixture store never falls through to the network, and the refusal is the
design rather than an omission.** Falling through would mean a tour panel on a
machine with a dev server running behaves differently from the same panel on a
laptop with no server. That is the class of difference that makes a bug report
unreproducible, and it would be invisible to me specifically, because I always
have the server available.

**The listings are derived from the sources rather than declared.** A declared
list lets a tour name a drop it has no table for, which produces an empty chart
and a reader who concludes they broke something. Deriving makes that state
unreachable.

### What worked

**Discovering the fixtures already know what they are.** Every committed
fixture carries its own `source` — `readings` is `lab/temps`, `census` is
`lab/census/rows.csv` — because the server sends it and `make-fixtures.ts`
keeps it:

```console
$ python3 -c "..."
readings -> {'kind': 'stream',  'drop': 'lab',     'stream': 'temps'}      rows 360
census   -> {'kind': 'dataset', 'drop': 'lab',     'dataset': 'census'}    rows 24
batches  -> {'kind': 'dataset', 'drop': 'factory', 'dataset': 'batches'}   rows 500  truncated
```

So `fixturesFrom(readings, census)` derives the whole map, and the only way this
could have gone quietly wrong — a `SourceRef` written beside a table it does not
describe, producing a 404 for a table sitting right there — is now unreachable.
I had drafted the map as hand-written pairs and deleted that after checking.

**Verifying the rename guard by renaming.** Changing
`/drops/{drop}/table` to `/drops/{drop}/rows` in `client.ts` fails four tests.
Without that check the round-trip test would be decoration.

**Checking the acceptance criterion in a browser, and checking the right
thing.** Not "does a chart appear" but "does a chart appear *and* was the
network untouched":

```js
marks:       365            // svg circle/rect/path
tableRows:   203
v1Requests:  []             // performance.getEntriesByType('resource')
```

The axis ticks (20/30/40/50/60, 09:00/12:00/15:00) and the four-category legend
(cellar, north, roof, south) are the real engine's output over the real
fixture. Nothing was mocked.

### What didn't work

**`api.endpoints.streamTable.query` does not exist at runtime.** The round-trip
test's whole premise was calling the endpoint's own `query` so that a change in
`client.ts` changes what the test sees. Ten tests failed with `endpoint
streamTable has no query function`, and probing the object explained why:

```console
endpoint keys: name, select, initiate, matchPending, matchFulfilled,
               matchRejected, useQuery, useLazyQuery, useQueryState, …
```

RTK builds endpoints into thunk/selector/hook triples and keeps the definitions
private. The fix was not to work around it but to make the thing addressable:
`PATHS` in `client.ts`, holding the request builders as named functions, which
the endpoints then use as their `query`. The test calls the *same functions* the
product does.

This is the better outcome and I would not have got there without the failure.
The alternative I was one step from taking — asserting against hand-written URL
strings — produces a test that passes through exactly the rename it exists to
catch, which is worse than no test because it reads like coverage.

**The Playwright screenshot timed out on the fixture story.** `TimeoutError:
browserBackend.callTool: Timeout 5000ms exceeded` — the page was busy rendering
360 rows and 365 SVG marks. Evaluating a small function against the DOM
succeeded immediately, which is the better check anyway: a screenshot shows me
that *something* is drawn, and `marks: 365, v1Requests: []` shows me *what* and
*how*.

### What I learned

**A library's public surface and its testable surface are different things, and
the gap is a design signal.** The instinct on hitting "RTK does not expose that"
was to find another way to get at it. The right move was to notice that if I
want to call the request builders, they should be callable — and that making
them so is a small improvement to `client.ts` independent of any test.

**`performance.getEntriesByType('resource')` is the cheap way to assert a
negative about network traffic.** No interception, no instrumentation, no
service worker. It is a list of everything the page fetched, and filtering it
for `/v1/` answers "did this reach the API" in one line. I will use this again.

**Deriving beats declaring wherever the derivation is total.** Three things in
this phase became derivations — the drop list, the stream list, the dataset
list — and each removed a way for the tour content to disagree with itself. The
same argument produced `fixturesFrom`. The rule seems to be: if a declaration
could contradict something already in the data, it should not be a declaration.

### What was tricky to build

**Deciding what `version: "latest"` means in a `SourceRef`.** The dataset table
URL carries a version, and `latest` is a legal value. Putting the string
`"latest"` into `SourceRef.version` — typed `number | undefined` — would be a
type lie, and widening the type would push the lie into every consumer.

The resolution came from reading `useTableFor` (`apps/useTable.ts:117-123`): it
compares on kind, drop, stream, dataset and path, and **never on version**. So
version is not part of a source's identity as the interface understands it, and
`latest` simply produces a ref without one. That is now a test — "a dataset
table at `latest` carries no version" — with the reasoning in the comment,
because the next person will otherwise assume it was an oversight.

**Making `applyBudget` real rather than cosmetic.** The obvious implementation
returns every row and ignores the limit, and nothing visible breaks — until you
notice that `TruncationNotice` and `SourcePanel`'s budget selector both read
`truncated`, `row_count` and `strategy`. A fixture that never truncates leaves
both of those describing something that cannot happen, and §D's module card for
the sources browser would be documenting a control that does nothing. The
`strategy: "latest"` branch takes from the *end*, because that is what the
server does for a stream.

There is one subtlety I nearly missed: a table *under* budget must be returned
by identity, not copied. `useDocPipeline` memoises on the table reference, so a
fresh object per request would defeat the memo on every refetch. That is now a
test.

### What warrants a second pair of eyes

- **The 501 for account endpoints.** A fixture instance refuses `/me/tokens`,
  `/me/sessions` and every mutation. I think that is right — an embedded
  workbench has no session to list and no token to mint — but it means
  `TokensApp` in a tour panel would render an error rather than an empty state.
  Since the app scope will exclude those applications anyway it should never
  arise, but "should never arise" is doing work in that sentence.
- **`sourceFromRequest`'s two regexes.** They are the fragile part by design and
  the test covers both shapes plus escaping, but a third table endpoint added
  later would need a third branch and nothing would fail until a tour used it.
- **Whether `fixtureBaseQuery` belongs in `api/`.** It is transport, so yes; but
  it also encodes tour-specific policy (which endpoints are refused), and that
  policy may want to move once the tour content exists.

### What should be done in the future

- **The null-key persistence test**, still owed from phases 1 and 2. Now easier:
  a third instance in the two-instance story, with a key, asserting the other
  two wrote nothing.
- **A guard for mistyped CSS custom properties**, from phase 2. Still unfixed
  and still has no owner.
- Phase 4, the rail components — the first of the four teaching-layer phases,
  and the first that is mostly new components rather than moved ones.

### Code review instructions

- `api/fixtureBaseQuery.ts` top to bottom; it is 140 lines and the docstring
  names its own fragility.
- `test/fixture-query.test.ts` — then break it: rename the stream table path in
  `client.ts` and confirm four failures.
- `client.ts` `PATHS` — check that every endpoint's `query` now points at it and
  that none was left inline.
- Open `Applications/Embedding → WithFixtures` **with the dev server stopped**.
  If it needs a server, DR-48 has failed.
- Validate: `bun run --cwd=ui typecheck && bun test --cwd=ui && bun run --cwd=ui build && bun run --cwd=ui build-storybook`.

### Technical details

The mechanism, in three lines across three files:

```ts
// store/index.ts — the only per-store channel a base query can read
getDefault({ thunk: { extraArgument: { fixtures } } }).concat(api.middleware)

// api/client.ts — the real transport, wrapped
baseQuery: fixtureBaseQuery(httpBaseQuery)

// api/fixtureBaseQuery.ts — the whole decision
const fixtures = (api.extra as Extra | undefined)?.fixtures;
if (!fixtures) return real(args, api, extraOptions);
```

The four mechanisms weighed, with the reason each lost:

```text
MSW                a service worker in the production bundle, intercepting the
                   real API on its way past
second createApi   reducerPath and the hooks are fixed at creation; two APIs is
                   two hook sets and a conditional import at every call site
React context      legal only while the value never changes identity after
                   mount — a rule no test can express
base query    ✓    the extra argument is per store, so the map's scope is the
                   instance's scope, and no call site changes
```

Verification in the browser, against `storybook-static` on a static file server
with no API anywhere:

```text
marks         365     svg circle + rect + path
tableRows     203
v1Requests    []      performance.getEntriesByType('resource')
ticks         20 30 40 50 60 · 09:00 12:00 15:00
legend        data.station → cellar · north · roof · south
```

Suite growth across the three architectural phases:

```text
            tests   files
before        177      14
phase 1       187      15   instances.test.ts
phase 2       187      15
phase 3       204      16   fixture-query.test.ts
```

## Step 5: Phase 4 — the rail, and three things only the browser found

The first phase that is mostly new components rather than moved ones: one atom,
four molecules, two organisms, seven story files. The mechanism at the centre is
small — a step completes when a predicate over `RootState` says so — and
everything else in the teaching layer follows from it.

The step is worth recording mostly for what happened after the build went
green. Typecheck passed, 204 tests passed, both bundles built, and then opening
the rail in a browser found three separate defects in about four minutes. One
of them was a sentence I had written that no reader could ever reach.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 4 of the ticket.

**Inferred user intent:** (see Step 2)

**Commit (code):** `f7b4261` — "DATADROP-7 phase 4: the lesson rail, and completion by predicate"

### What I did

- `atoms/Tick` — three states, and adopted in the four tutorial tiles in the
  same commit.
- `appkit/lessons.ts` — the `Lesson`, `Prediction`, `LessonContext`, `Goal` and
  `ModuleEntry` contract.
- `molecules/LessonStep`, `PredictPrompt`, `GoalItem`, `HintList`.
- `organisms/LessonRail` (with `RailHeader` and `wedge.ts`), `BriefChecklist`.
- `tokens.css` gains `--pbui-selected-wash`.
- Seven story files; the two organism stories run against a real store, so ▶
  dispatches real actions and the predicates see real state.

### Why

**`Lesson` went in `appkit`, and the reasoning is DR-33's, reused.** It is not
content and it is not a component — it is the interface the two agree on,
exactly as `AppDescriptor` is the interface applications and the shell agree on.
Both `organisms` and (per DR-54) `tour` already depend on `appkit`, so the
placement adds no edge. The two alternatives each force one: putting it in
`tour/` makes `organisms → tour` necessary, and putting it in `organisms/` makes
`tour → components` necessary, which DR-54 forbids outright.

**`Tick` was adopted in the same commit it was created in.** DATADROP-6 built
`InlineRename` in phase 4 and adopted it in phase 6, which meant a component and
the code it was meant to replace sat side by side for two phases. The rule I am
following now: an extraction that has a call site adopts it immediately, or it
is not an extraction, it is a second copy.

**`useSelector((s) => s)` in the rail, with the cost stated in a comment rather
than hidden.** It re-renders on every store change, including keystrokes in a
step editor. Acceptable for five to seven collapsed rows and it is the honest
way to support arbitrary predicates; unacceptable in a tile, and no tile does
it.

### What worked

**The guard test forced the right conversation, which is what its docstring
says it is for.** `no-raw-controls.test.ts` failed on two hand-written
`<button>` elements — the disclosure header and the prediction options:

```text
+ "components/molecules/LessonStep/LessonStep.tsx:28 — use Button or IconButton"
+ "components/molecules/PredictPrompt/PredictPrompt.tsx:38 — use Button or IconButton"
```

Both became `Button`, and both were better for it. `Button` spreads `...rest`,
so `aria-expanded` and `aria-controls` pass straight through, and `framed`
turned out to be exactly what a prediction option should look like — hairline
border, alt fill, bold — so `PredictPrompt.module.css` lost half its rules.

**Verifying the whole mechanism end to end in a browser rather than reasoning
about it.** Pressing ▶ in `LessonRail → Default`:

```text
aria-label   "step 2, complete — watched"
background   rgb(217, 217, 212)   = #d9d9d4 = --pbui-line, NOT --pbui-ok
progress     1/4
WATCHED      present
```

The grey is the check that matters. Green would have meant the `ranRef` was not
being consulted, and nothing in the type system or the tests would have said so.

### What didn't work

**The watched follow-up was unreachable.** The same browser check reported
`followUp: false` — the sentence *"you watched this one. try the same move by
hand in the panel."* was not on screen. It renders in the step's body, and
completing a step auto-advanced to the next one, closing it.

So the nudge was written, rendered, and never read. Worse than that: pressing ▶
gave the reader a tick *and* a fresh step, which feels like progress — the exact
incentive the whole watched/self distinction exists to remove. The fix is one
line, `if (done[open] !== "self") return`, and the comment explaining it is
longer than the change because the reason is not obvious from the code.

**A predicate satisfied by the empty case.** The brief's fourth goal — "a table
and a chart, on one document, at once" — showed as **already met** the moment
the story loaded, at 1/4 before the reader had touched anything. The predicate
was:

```ts
leaves.some((table) => table.app === "table" &&
  leaves.some((chart) => chart.app === "chart" && chart.docId === table.docId))
```

and `defaultSpaces()`'s `build` workspace opens with a chart tile and a table
tile *both unbound*, so `chart.docId === table.docId` was `null === null`.

**`null` in a leaf means "follow the ACTIVE document", not "nothing".** Two
nulls are not evidence of agreement. `table.docId != null` fixes it, and the
comment in the story now says so, because this is the first of a class: every
goal that compares two ids has to decide what the absent case means before it
compares them.

**A wrong `Text` size and a shadowed variable, both caught by typecheck.**
`size="body"` — the scale is `micro | tiny | small | base | title`. And I named
a local `state` inside the rail's map, shadowing the `useSelector` result; TS
reported it as a comparison with no overlap, which is a confusing message for a
shadowing bug but a true one.

The underlying cause of the second is worth keeping: `Record<string, "self" |
"watched">` tells TypeScript every key is present, so `done[id] ?? "pending"`
narrows away the fallback and the later `=== "pending"` is unreachable.
`Record<string, "self" | "watched" | undefined>` is the honest type and makes
the `??` mean something.

**A chained `cd ui` failed and silently ate two heredocs.** The command was
`cd ui && sed … && cat > PredictPrompt.tsx <<TSX …`, run from a directory that
was already `ui`. The `cd` failed, `&&` short-circuited the first line, and the
*later* lines in the same block ran anyway — so the CSS module and the barrel
were written and the component was not. Typecheck caught it as
`Cannot find module './PredictPrompt'`, which is a good error, but the shape of
the mistake is worth naming: **a failed `cd` at the head of an `&&` chain
partially executes a multi-line block.**

### What I learned

**A green suite plus a clean build is not evidence that the thing works; it is
evidence that it compiles.** Three defects in four minutes of browsing, and none
of the three was findable by any test I would plausibly have written. The
unreachable sentence in particular: there is no assertion that would have
caught it, because the string is present in the source and present in the DOM
*of a state the reader cannot get to*.

DATADROP-6 arrived at this lesson via a chart story that rendered "Nothing to
draw yet". This is the second time, and the rule is now firm enough to state:
**a phase that adds a component is not done until the component has been opened
and used.**

**Auto-advance is a reward, and rewards teach.** I wrote the auto-advance as a
convenience — nobody wants to click the next step open — without noticing it was
also the thing that made ▶ feel productive. Any interface that advances on
completion is telling the reader what counts as completion. That is worth
thinking about before writing the convenience, not after.

### What was tricky to build

**Overriding an atom's styles from a molecule, without relying on stylesheet
order.** `Button`'s `.bare` sets `padding: 0; background: none`, and
`.root:disabled` fades to 0.55. Both are single-class selectors, and so were
mine, so which won depended on CSS module import order — which happens to work
today and is not something anyone is watching.

The fix is the doubled selector, `.header.header`, raising specificity to
(0,2,0) explicitly. Two characters, one comment, and it stops being a question.
For the disabled fade I needed `.right.right:disabled` to beat `.root:disabled`,
which is the same trick one level up.

The interesting part was noticing the disabled fade at all. Every prediction
option becomes `disabled` once the reader commits — correctly, they cannot be
pressed again — and `Button` fades disabled controls to 0.55. Which would have
faded *the correct answer*, at exactly the moment the reader is comparing it
against their guess. `.other` keeps the fade; the two that have to be read do
not.

### What warrants a second pair of eyes

- **`wedgeOf` finds the table by scanning the RTK Query cache for the first
  entry with a `source`.** That is the same shape `useTableFor` uses, but
  without its source-matching — so with two documents on two different sources
  the wedge could compute against the wrong table. It is only used to decide
  whether to show a hint, so the failure is a wrong hint rather than a wrong
  chart, but it should probably match on source before phase 6 ships real
  content.
- **The rail's whole-state selector.** Named as a cost; if a section's rail
  turns out to be expensive the fix is per-lesson selectors, not memoising the
  whole-state read.
- **`--pbui-selected-wash`.** A new token, and new tokens are how palettes
  drift. The argument for it is that nothing is *selected* when a step is open,
  it is merely expanded, and reusing `--pbui-selected` would be too loud under a
  paragraph of prose. If that argument is wrong the token should go.

### What should be done in the future

- **A green tick has no story.** `LessonStep → Self` shows the visual, but the
  *path* — satisfy a predicate without pressing ▶ — needs a workbench beside the
  rail, which is phase 7. Worth an explicit check there rather than assuming.
- **`wedgeOf` source matching**, above.
- The two carried-over items: the null-key persistence test (phases 1–3), and a
  guard for mistyped CSS custom properties (phase 2). Neither has an owner.
- Phase 5, the module rack.

### Code review instructions

- `appkit/lessons.ts` first — it is the contract, and its docstring is where
  DR-50's reasoning lives.
- `organisms/LessonRail/LessonRail.tsx`, the completion effect and the
  auto-advance beneath it. The comment on the auto-advance describes a defect
  that is invisible in the code.
- `molecules/LessonStep/LessonStep.module.css` and
  `PredictPrompt.module.css` — the doubled selectors. If they look like
  superstition, delete one and reorder an import.
- Open `Component Library/Organisms/LessonRail → Default`, press ▶ on step 2,
  and confirm: grey tick, WATCHED label, the follow-up line visible, and the
  step still open.
- Validate: `bun run --cwd=ui typecheck && bun test --cwd=ui && bun run --cwd=ui build && bun run --cwd=ui build-storybook`.

### Technical details

The completion loop, which is DR-50 in eleven lines:

```tsx
const state = useSelector((s: RootState) => s);   // whole state: predicates read either slice

useEffect(() => {
  setDone((prev) => {
    let next = prev;
    for (const lesson of lessons) {
      if (next[lesson.id] || !lesson.done) continue;   // monotonic: never un-ticks
      let ok = false;
      try { ok = lesson.done(state); } catch { ok = false; }   // a throw is false, not a crash
      if (ok) next = { ...next, [lesson.id]: ranRef.current[lesson.id] ? "watched" : "self" };
    }
    return next;                                       // identity return ends the update
  });
}, [state, lessons]);
```

The browser check, before and after the auto-advance fix:

```text
                    before        after
tick background     #d9d9d4       #d9d9d4     line-grey, not ok-green ✓
aria-label          watched       watched     ✓
progress            1/4           1/4         ✓
step still open     no            YES         ← the fix
follow-up visible   NO            yes         ← the defect
```

Components added, and the two the guard test rejected on the way:

```text
atoms        Tick                                   3 states, 4 stories
molecules    LessonStep      raw <button> → Button  6 stories
             PredictPrompt   raw <button> → Button  3 stories
             GoalItem                               3 stories
             HintList                               4 stories
organisms    LessonRail      + RailHeader, wedge    3 stories
             BriefChecklist                         3 stories
appkit       lessons.ts      the contract           —
```
