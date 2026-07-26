---
Title: Diary
Ticket: DATADROP-8
Status: active
Topics:
    - frontend
    - layout
    - workspaces
    - import-export
    - clipboard
    - pbui
    - architecture
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ui/src/components/organisms/StageBar/StageBar.tsx
      Note: The switcher; a stage whose chrome hides the bar is not offered by the bar (commit 9dc985c)
    - Path: repo://ui/src/store/layout.ts
      Note: Stage/StageChrome/stageId, and syncSpacePointer as the only writer of the mirrored space pointer (commit 9dc985c)
    - Path: repo://ui/src/store/persist.ts
      Note: VERSION 2 and migrate(); validate calls migrate first so a migration cannot skip the validator (commit 9dc985c)
    - Path: repo://ui/src/store/stages.ts
      Note: The four pinned stages, mergeStages and defaultLayout — replaces spaces.ts (commit 9dc985c)
    - Path: repo://ui/test/fixtures/persisted-v1.json
      Note: A version-1 payload produced by running defaultSpaces() out of commit f53be15 (commit 9dc985c)
    - Path: repo://ui/test/stages.test.ts
      Note: The space-pointer invariant across every reducer, and the v1 migration (commit 9dc985c)
ExternalSources: []
Summary: Implementation diary for DATADROP-8 — stages, tile identity, the portable bundle format, the widened verb seam, the clipboard dialogs and the template library.
LastUpdated: 2026-07-26T18:18:37.781026543-04:00
WhatFor: Recording what was built, what failed, and what a reviewer should look at hardest for DATADROP-8.
WhenToUse: Read before reviewing DATADROP-8, and before touching stages, the bundle format or the clipboard path afterwards.
---


# Diary

## Goal

Make the workbench's *arrangement* a first-class, portable object: a stage layer
above workspaces, tiles that can be renamed and duplicated, a versioned JSON
bundle for a tile / workspace / stage, clipboard export and import, and a
`localStorage` template library — all reached through the presentation protocol
that already exists, rather than through new buttons in the tile title bar.

This diary records each phase with the commit that landed it, and — more
usefully — the things that were green under `typecheck`, `lint` and the whole
test suite while being visibly wrong on screen.

## Step 1: Stages — the model, the migration, the bar

The layer the interface had been missing. `store/spaces.ts` defined two
hardwired *workspaces*, `ws-welcome` and `ws-account`, which sat in the same
flat strip as the user's own and needed a tooltip to explain why they were
different. The evidence that they were always stages is in `Workbench.tsx`:
it had to *force* `state.layout.currentSpaceId` twice — once for the signed-out
gate and once for the `?first=1` landing — an application reaching into the
window manager, because there was no layer at which "which part of the product
am I in" could be expressed. Both forcings are now `setCurrentStage`.

`spaces.ts` became `stages.ts` with four pinned stages (`sign in`, `welcome`,
`account`, `work`), `Workspace` gained a `stageId` foreign key on a flat array,
`LayoutState` gained `stages` and `currentStageId`, and the persisted payload
went from version 1 to version 2 with a migration rather than a discard. The
workspace strip is now scoped to the current stage, the shell reads its three
chrome booleans from the stage with an instance-level `??` override, and a new
`StageBar` organism sits at the right of the masthead.

### Prompt Context

**User prompt (verbatim):** "close 1 - 7. Do DATADROP 8 and 9 which I think can be done in parallel?"

**Assistant interpretation:** Close out the already-finished tickets, then
implement DATADROP-8 (portable workspaces, stages, import/export, templates,
duplicable tiles) in this checkout while another agent implements DATADROP-9 in
`pkg/`, `cmd/` and the compose files — the two file sets being disjoint enough
to run at the same time on one branch.

**Inferred user intent:** Get both remaining tickets landed in one sitting
without the two agents stepping on each other's commits, following the ticket's
own seven-phase plan and its design guide rather than improvising an
implementation.

**Commit (code):** `9dc985c` — "DATADROP-8 phase 1: stages, the layer above workspaces"

### What I did

- `ui/src/store/layout.ts`: `Stage`, `StageChrome`, `StageId`; `stageId` and an
  optional `apps` on `Workspace`; `stages` / `currentStageId` on `LayoutState`;
  `stageOf`, `spacesOfStage`, and a single private `syncSpacePointer`. Eight new
  reducers (`setSpaceApps`, `addStage`, `removeStage`, `renameStage`,
  `setCurrentStage`, `moveSpaceToStage`) and four rewritten ones (`addSpace`,
  `removeSpace`, `renameSpace`, `cloneSpace`, `setCurrentSpace`).
- `ui/src/store/stages.ts` (new, replaces `spaces.ts`): `pinnedStages()`,
  `mergeStages()`, `singleStageLayout()`, `defaultLayout()`.
- `ui/src/store/persist.ts`: `VERSION = 2`, `migrate()`, `isStage`/`isChrome`
  validators, `validate` calling `migrate` first.
- `ui/src/components/organisms/StageBar/`: the switcher, its module, its story.
- `ui/src/components/pages/Workbench/WorkbenchShell.tsx`: chrome from the stage.
- `ui/src/components/pages/Workbench/Workbench.tsx`: the gate sets a stage.
- `ui/src/appkit/AppScope.tsx`: `intersectScopes`, `useAppScope` with a reason
  per excluded application.
- `ui/test/stages.test.ts` (29 tests) and `ui/test/fixtures/persisted-v1.json`.
- `ui/src/styles/tokens.css` and `SelectInput.module.css`: `--pbui-ink-on-pane`.

### Why

Everything else in the ticket references a stage. Doing it last would mean doing
the scope composition twice, and the two hardwired workspaces would have had to
be migrated twice.

### What worked

- The migration, first try, against a fixture that is not hand-written. Rather
  than typing a plausible version-1 payload I checked the version-1 sources out
  of commit `f53be15` into a scratch directory *inside* `ui/` (so `bun` could
  resolve `@reduxjs/toolkit`), ran the real `defaultSpaces()`, renamed one
  workspace so the fixture is not merely the defaults, and wrote the result to
  `ui/test/fixtures/persisted-v1.json`. Ten stored workspaces in, eight under
  `work` out, `ws-welcome` and `ws-account` dropped because `mergeStages`
  re-creates them as stages.
- The space-pointer invariant test. It walks `layoutSlice.actions`, applies a
  representative payload for each, and asserts the mirror. Above it sits a
  second test asserting every reducer *has* an entry in the payload table —
  without that, the invariant test passes trivially for any reducer someone adds
  and forgets.

### What didn't work

**1. Immer rejects `readonly` arrays in state.** The design guide types
`Stage.apps` as `readonly AppId[] | null`. `tsc` said:

```
src/store/layout.ts(396,27): error TS2345: Argument of type 'Workspace' is not assignable to parameter of type 'WritableNonArrayDraft<Workspace>'.
  Types of property 'apps' are incompatible.
    Type 'readonly string[] | null | undefined' is not assignable to type 'string[] | null | undefined'.
      The type 'readonly string[]' is 'readonly' and cannot be assigned to the mutable type 'string[]'.
```

Command: `bun run --cwd=ui typecheck`, TypeScript 7.0.2. The state types are now
`AppId[] | null` and `readonly` survives only at the API boundary
(`intersectScopes`, the `setSpaceApps` payload), which is where it was carrying
meaning anyway.

**2. `bun run --cwd=ui build` writes into `pkg/webui/dist`, which is the other
agent's file set.** The `build` script's Vite config targets the Go embed
directory, so a routine "is the build green" check produced:

```
 D pkg/webui/dist/assets/index-B0eLl5d7.js
 D pkg/webui/dist/assets/index-CZDPLtn9.css
 M pkg/webui/dist/index.html
?? pkg/webui/dist/assets/index-CrgL-EoE.css
?? pkg/webui/dist/assets/index-DD-5vT5b.js
```

Reverted with `git checkout -- pkg/webui/dist` plus `rm` of the two untracked
files. `bun run --cwd=ui build:check` exists for exactly this and writes to
`ui/dist-check`; it is what every later phase used.

**3. I contaminated the other agent's commit, and it is my fault.** I deleted
`spaces.ts` with `git rm -q --cached src/store/spaces.ts && rm -f
src/store/spaces.ts`. `git rm --cached` **stages** the deletion, and the index
is shared: the DATADROP-9 agent's `62e53d4 DATADROP-9 phase 1: the scaffolding
for Glazed verbs` swept up `ui/src/store/spaces.ts` as a deleted file. The net
tree is correct — the file is genuinely gone as part of this ticket — but the
deletion is recorded in a commit about Glazed verbs. AGENT.md's
`<parallelAgentGuidelines>` says "stage explicit paths only"; the lesson it does
not yet say out loud is that **`git rm` is a staging command**, and in a shared
index the safe way to delete a file is plain `rm` followed by naming the path in
your own `git add`.

**4. The tour and the story helpers each hand-built a `LayoutState`.** Adding
two required fields broke four call sites in `WorkbenchInstance.stories.tsx`:

```
src/components/pages/WorkbenchInstance/WorkbenchInstance.stories.tsx(114,42): error TS2739: Type '{ spaces: …; currentSpaceId: string; }' is missing the following properties from type 'LayoutState': stages, currentStageId
```

Rather than adding two fields in five places, `singleStageLayout(name, tree)`
now lives in `store/stages.ts` and both `tour/fixtures.ts` and the stories call
it. That is the shape every embedded instance wants and it removes the
duplication that made the breakage a five-file edit.

### What I learned

- `Surface`'s `.inverted` re-points `--pbui-ink` to paper for **every**
  descendant, which is correct for text and silently wrong for any control that
  paints its own pale background. The comment in `Surface.module.css` already
  records the first time this bit ("every Text inside rendered ink-on-ink —
  1.00:1, invisible, and found by looking at the story rather than by any
  test"); the stage switcher is the second, in the other direction.
- A pinned *stage* and a pinned *workspace* want different merge rules. A pinned
  stage's name, chrome and allow-list come from code, but its `currentSpaceId`
  must come from storage, because that field is a memory of where the user was
  rather than a definition of what the stage is. Taking it from source too would
  reset the account stage to its first workspace on every reload.

### What was tricky to build

**The mirrored space pointer.** `LayoutState.currentSpaceId` is read from seven
places outside the slice and written by six reducers; `Stage.currentSpaceId` is
the durable per-stage memory. Two fields holding one fact is a hazard that grows
with every reducer added. The approach: make it impossible to write one without
the other by giving the slice a single private `syncSpacePointer(state, id)` and
never assigning either field directly, then make the twelfth reducer that
forgets fail loudly. The test enumerates `layoutSlice.actions` rather than a
hand-kept list, and a second test asserts the payload table covers every action
— which is the part that keeps the first test from rotting into a no-op.

**`work` nearly acquired a fixed workspace id.** `pinnedStages()` has to give
each stage a `currentSpaceId`, and the obvious move was a constant
`BUILD_SPACE_ID = "ws-build"`. That made `test/instances.test.ts` fail:

```
132 |     const shared = b.getState().layout.spaces.filter((s) => aIds.has(s.id));
136 |     expect(shared.every((s) => s.pinned)).toBe(true);
error: expect(received).toBe(expected)
Expected: true
Received: false
```

which is the test doing its job: a fixed id on an *unpinned* workspace is an id
two independent stores agree on. `work`'s pointer is now the empty string in
`pinnedStages()` and both `defaultLayout` and `mergeStages` repair it to the
stage's first workspace — an empty string here is a request to repair, not a
missing value.

### What warrants a second pair of eyes

- `mergeStages`'s repair loop. It mints a workspace for any stage that ends up
  with none, which is right for a restored payload and would be wrong if it ever
  ran on a *partial* state. It is only called from `validate`.
- The decision that `setCurrentSpace` switches the stage when the target
  workspace belongs to another one. It makes "load this template into the
  account stage and show me" expressible as a single verb, and it means a
  mis-typed space id can move the user between stages.
- `--pbui-ink-on-pane` duplicates `--pbui-ink`'s value. That is deliberate — the
  token exists to be *excluded* from `.inverted`'s re-point — but a reader who
  sees two tokens with one value will want to collapse them.

### What should be done in the future

- `pkg/webui/dist` needs rebuilding from the finished `ui/` before release. It is
  outside this ticket's file set (`pkg/`), so it was deliberately left alone.

### Code review instructions

Start at `ui/src/store/stages.ts` and read `pinnedStages` then `mergeStages`;
then `ui/src/store/layout.ts` from `syncSpacePointer` down. `ui/src/store/persist.ts`'s
`migrate` is 30 lines and is the only thing in the phase that touches existing
users' data.

```bash
bun run --cwd=ui typecheck
bun run --cwd=ui lint
bun test --cwd ui
bun run --cwd=ui build:check      # NOT `build` — that writes into pkg/webui/dist
```

To see it: `bun run --cwd=ui dev`, then `http://localhost:5173/static/`. Clear
`localStorage.datadrop-workbench` for the fresh-install path.

### Technical details

Verifying the two guards by breaking them, as §16 of the design guide requires.

**The space-pointer invariant.** Break: `setCurrentSpace` writes
`state.currentSpaceId = space.id` instead of calling `syncSpacePointer`.

```
error: expect(received).toEqual(expected)

+ [
+   "setCurrentSpace desynchronised the pointer: layout s2-b, stage s2-a"
+ ]
- []

      at <anonymous> (/home/manuel/.../ui/test/stages.test.ts:197:22)
(fail) the space pointer never desynchronises > every reducer leaves the space pointer consistent [10.00ms]
(fail) the space pointer never desynchronises > switching stages remembers each stage's workspace [1.00ms]
```

**The migration.** Break: `test/fixtures/persisted-v1.json`'s `version` set to 3.

```
error: expect(received).toBe(expected)
Expected: 1
Received: 3
(fail) persisted layout version 1 → 2 > the fixture really is a version-1 payload with ten workspaces
error: expect(received).not.toBeNull()
Received: null
(fail) persisted layout version 1 → 2 > every user workspace joins the work stage and none is lost
(fail) persisted layout version 1 → 2 > the v1 hardwired pair is dropped rather than duplicated
(fail) persisted layout version 1 → 2 > the four pinned stages appear, with their workspaces
(fail) persisted layout version 1 → 2 > the world survives untouched
```

Both restored afterwards; the suite is 262 pass / 0 fail.

**What the rendered output showed that the tests did not.** Two defects, both
found by opening the application in Playwright after everything was green.

1. The stage switcher was a blank white box. Reading it out of the DOM:

   ```js
   getComputedStyle(document.querySelector('select[aria-label="stage"]'))
   // → { color: "rgb(255, 255, 255)", background: "rgb(255, 255, 255)" }
   ```

   `SelectInput.root` says `color: inherit`, and inside `Surface`'s `.inverted`
   the inherited colour is paper while `.framed`'s background is `--pbui-pane`.
   White on white, 1.00:1. Fixed with `--pbui-ink-on-pane`, a token `.inverted`
   deliberately does not re-point; after the fix, `color: rgb(35, 38, 43)`.

2. Selecting `sign in` from the switcher stranded the reader. The sign-in stage
   is defined with `chrome: { masthead: true, workspaces: false, stageBar: false }`
   so that a signed-out visitor cannot navigate to a stage of 401s — which also
   means that once you are on it there is no switcher to leave by. It is
   somewhere the gate *puts* you, never somewhere you choose to go, so the bar
   no longer offers a stage whose chrome hides the bar.
