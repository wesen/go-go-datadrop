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
    - Path: repo://ui/src/appkit/usePersistence.ts
      Note: The debounced write, or nothing at all when the key is null (commit 4796da2)
    - Path: repo://ui/src/main.tsx
      Note: Line 9 is the only runtime import of the store singleton in the whole frontend — the finding the design rests on
    - Path: repo://ui/src/store/index.ts
      Note: makeStore is now the only way to get a store; the preloadedState comment describes the two defects one store could not reveal (commit 4796da2)
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
