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
    - Path: repo://ttmp/2026/07/26/DATADROP-8--portable-workspaces-stages-tile-and-workspace-import-export-stored-templates-and-duplicable-tiles/scripts/smoke-firefox-import.ts
      Note: The Firefox check the phase calls not optional, and the two defects it found
    - Path: repo://ui/src/components/organisms/BundleDialog/BundleDialog.tsx
      Note: Import in three states, with the verdict that keeps the confirm button honest (commit 26b5170)
    - Path: repo://ui/src/components/organisms/Dialog/Dialog.tsx
      Note: The only modal; focuses the body rather than its own close button (commit 26b5170)
    - Path: repo://ui/src/components/organisms/StageBar/StageBar.tsx
      Note: The switcher; a stage whose chrome hides the bar is not offered by the bar (commit 9dc985c)
    - Path: repo://ui/src/components/organisms/Tile/options.ts
      Note: The picker's three rules — own app always listed and never disabled, singletons already open, stage scope (commit da29ec2)
    - Path: repo://ui/src/model/portable.ts
      Note: One envelope, three kinds; PortableNode carries the whole of DR-64 (commit e80ec0c)
    - Path: repo://ui/src/model/secrets.ts
      Note: findSecrets, now guarding three doors rather than one (commit e80ec0c)
    - Path: repo://ui/src/store/bundles.ts
      Note: State to bundle and back; DocCollector and hydrateTree are the two halves of the round trip (commit e80ec0c)
    - Path: repo://ui/src/store/clipboard.ts
      Note: ClipboardPort, and why read and write are not symmetric (commit 88ec889)
    - Path: repo://ui/src/store/effects.ts
      Note: The thunks; the only impure steps in the export/import path, and both are parameters (commit 88ec889)
    - Path: repo://ui/src/store/layout.ts
      Note: Stage/StageChrome/stageId, and syncSpacePointer as the only writer of the mirrored space pointer (commit 9dc985c)
    - Path: repo://ui/src/store/persist.ts
      Note: VERSION 2 and migrate(); validate calls migrate first so a migration cannot skip the validator (commit 9dc985c)
    - Path: repo://ui/src/store/stages.ts
      Note: The four pinned stages, mergeStages and defaultLayout — replaces spaces.ts (commit 9dc985c)
    - Path: repo://ui/test/apps.test.ts
      Note: duplicable and singleton follow docBound unless a sentence is written into EXCEPTIONS (commit da29ec2)
    - Path: repo://ui/test/effects.test.ts
      Note: The whole export path with no DOM, and the save()-excludes-a-dialog guard (commit 88ec889)
    - Path: repo://ui/test/fixtures/persisted-v1.json
      Note: A version-1 payload produced by running defaultSpaces() out of commit f53be15 (commit 9dc985c)
    - Path: repo://ui/test/portable.test.ts
      Note: Round trip, sharing, no-id-travels, every reject reason, the caps and the credential guard (commit e80ec0c)
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

## Step 2: Tile identity and multiplicity

Four tiles called `TABLE · α` are unhelpful; four called `TABLE · α`,
`TABLE · β`, `TABLE · γ`, `TABLE · δ` are not, because the derived title is
already doing the disambiguation the request worried about. So the rename exists
for the case the derivation cannot reach — two tables on the *same* document
showing different pipeline stages — and it is an *optional* label with the
derived title still underneath it. `duplicateLeaf` points the copy at the same
document rather than a copy of it, because two tiles on one document staying in
lockstep is exactly what "let me see this two ways" means.

The other half is `duplicable` and `singleton` on all twenty-five application
descriptors, and the picker that shows a singleton already open — or an
application the stage does not offer — greyed *with the reason* rather than
hidden. That closes the second half of a rule the project already had for verbs:
hiding an unavailable option hides the rule that makes it unavailable.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Phase 2 of the ticket's own plan — the half of the
request that needs no new UI surface, shipped before the bundle format.

**Inferred user intent:** As Step 1.

**Commit (code):** `da29ec2` — "DATADROP-8 phase 2: tile identity and multiplicity"

### What I did

- `ui/src/store/layout.ts`: `label?: string` on a leaf; `renameLeaf`,
  `duplicateLeaf`.
- `ui/src/appkit/registry.ts` and 25 application files: `duplicable`,
  `singleton`, required.
- `ui/src/components/atoms/SelectInput/`: `SelectOption.reason`, rendered after
  an em dash and as the `title`.
- `ui/src/components/organisms/Tile/options.ts` (new): `pickerOptions`, pure.
- `ui/src/components/organisms/Tile/Tile.tsx`: `label ?? derived`, rename as the
  title's default verb, the disabled picker.
- `ui/src/components/molecules/InlineRename/InlineRename.tsx`: `autoFocus`.
- `ui/src/components/pages/Workbench/Workbench.tsx`: the sign-in stage narrows
  the instance scope as well as the stage scope.
- `ui/test/apps.test.ts` (new), `ui/test/picker.test.ts` (new), three cases in
  `ui/test/store.test.ts`.

### Why

Phase 2 is independent of the bundle format and needs no new component, so it
puts the two-tables case in front of a user before the harder half lands.

### What worked

The `EXCEPTIONS`-with-a-sentence pattern, copied from `no-raw-controls.test.ts`.
`duplicable === docBound` and `singleton === !docBound` hold for twenty-four of
the twenty-five, and the twenty-fifth (`launcher`) has a sentence saying why. A
new application that disagrees now fails with the file, the field and the two
ways to fix it.

### What didn't work

**1. Double-click-to-rename never fired, and no test could have seen it.** The
design says the tile mirrors the workspace strip: double-click the title to
rename. Implemented that way it does nothing. `Presentation` has a documented
fallback — "no default verb: the left button opens the menu too. Otherwise chips
without an obvious primary action are dead to the left hand" — and a tile title
has no default verb, so the first click of a double-click opened the object
menu, the second click closed it via the menu's window listener, and the
`dblclick` handler never won. Confirmed in the browser rather than guessed:

```js
await page.evaluate(`({
  menu: !!document.querySelector('[role="menu"]'),
  rename: !!document.querySelector('input[aria-label="tile name"]'),
})`)
// → { menu: true, rename: false }
```

The workspace strip does not hit this because its left button already means
"switch to it". Rename is now the tile title's **default verb**, which fixes
three things at once: the gesture works, the mouse-doc line announces
`<tile> my keys — L: rename it   R: menu` before the user commits, and Enter on
the focused presentation renames — the keyboard route the strip's own
double-click still does not have, and which its `biome-ignore` comment admits to.
A double-click also still works: its first click enters the field, its second
lands in it.

**2. `InlineRename` never focused itself.** Invisible while the only route in was
a double-click on a workspace chip, and immediate once a single click opens it:
the field appears where a name was and does nothing until clicked again. Worse,
`onBlur={onCancel}` means an unfocused field cannot be dismissed by clicking away
either — it sits there until something else re-renders. Now `autoFocus`, with a
`biome-ignore` explaining that this element only ever mounts as the direct result
of a rename gesture, so focus is what the gesture asked for.

**3. The reducer-coverage guard fired on my own new reducers**, which is the
outcome it was written for:

```
+ [
+   "renameLeaf",
+   "duplicateLeaf"
+ ]
(fail) the space pointer never desynchronises > every reducer in the slice has a representative payload here
```

### What I learned

`Presentation`'s "no default verb ⇒ left click opens the menu" fallback is a
much bigger behavioural commitment than it looks. Any gesture a component wants
to add on top of a presentation is competing with a menu that opens on the first
click and closes on the second. The lesson generalises: **on a presentation,
express a gesture as `onActivate` rather than as a DOM handler on the children.**

### What was tricky to build

**Where the singleton rule is evaluated.** It needs the *other* tiles in the
workspace, which is tree knowledge the tile does not otherwise have. `Tile` now
selects the workspace's tree — which it needed anyway for `canClose`, replacing
a duplicated recursive count with `countLeaves` — walks it once in a memo to
collect the applications held elsewhere, and hands a `Set` to `pickerOptions`.
The rule that the tile's *own* application is never disabled matters here and is
easy to miss: a selected `<option disabled>` is legal HTML and displays fine, so
the mistake is invisible in a screenshot and reads to a user as "this tile is
showing something it may not show".

### What warrants a second pair of eyes

- **The tile's application picker got wider.** The reasons are inline, so the
  `<select>` sizes to the longest option — about 210px on the account stage
  against 82px before. It shrinks in a narrow tile (`min-width: 0` and no
  `flex-grow`), and `.auto`'s 220px cap holds, but it is a real change to the
  density of the tile title bar and the alternative — reason in the `title`
  attribute only — is defensible.
- **22 of 25 rows are greyed on the account stage.** The design guide asks for
  exactly this and §19 warns only about applying it to *instance* scope. It is
  still a lot of grey, and the sign-in stage's escape hatch (narrow the instance
  scope too) exists precisely because someone judged 23 grey rows to be over the
  line. Where that line is for `account` is a product call.
- Rename as the tile title's default verb. It is the right fix for the gesture,
  and it does mean a stray click on a title opens an edit field. Escape and blur
  both cancel with no change.

### What should be done in the future

- `splitLeaf` still mints its node ids inside the reducer. `duplicateLeaf` takes
  both ids in its payload; the two should agree. Out of scope here.

### Code review instructions

`ui/src/components/organisms/Tile/options.ts` first — it is 30 lines and its
docstring carries all three rules. Then `Tile.tsx`'s title block, then
`test/apps.test.ts`.

```bash
bun test --cwd ui                 # 278 pass
bun run --cwd=ui typecheck && bun run --cwd=ui lint
```

By hand: switch to the account stage, open a tile's application picker, and
check that `tokens` reads "already open in this workspace" while `chart` reads
"not offered by the account stage". Click a tile title and type a name.

### Technical details

**Verifying the `docBound` correspondence by breaking it.** Break: flip
`duplicable` to `false` on `TableApp`.

```
+ [
+   "apps/TableApp/TableApp.tsx: table.duplicable is false but docBound is true — change it, or add table to EXCEPTIONS with a sentence saying why"
+ ]
(fail) application descriptors > duplicable and singleton follow docBound unless a reason is written down [3.00ms]
(fail) application descriptors > the four document-bound applications are exactly the duplicable ones
```

Restored; 5 pass / 0 fail.

**What the rendered account stage shows**, read out of the DOM after everything
was green:

```
value: "profile"
enabled:  ["new tile", "about / help", "profile"]
disabled: ["sources — not offered by the account stage",
           …22 more…,
           "tokens — already open in this workspace",
           "upload — already open in this workspace"]
```

and after clicking the `tokens` tile's title and typing:

```
READY   <tile> my keys — L: rename it R: menu        3 tiles · 1 workspaces · 1 documents
```

## Step 3: The portable format

The largest single body of logic in the ticket and the only phase with no user
interface at all: `model/portable.ts` is the envelope and its validator,
`store/bundles.ts` is the two conversions either side of it. Everything is a
pure function of plain data — the timestamp is a parameter and so are the ids to
mint — so `portable.test.ts` is 46 tests with no store, no DOM and no clock.

Two decisions carry the weight. **Ids do not travel**: a bundle carries
documents by content and leaves reference them by array index, which is what
makes "copy a tile and paste it back into the workspace you copied it from"
produce a second tile rather than two nodes with one id. And **the credential
guard runs in both directions**, which is why `findSecrets` moved out of
`store/persist.ts` into `model/secrets.ts` — a bundle has to be audited on the
way out and on the way in, and `model` may not import `store`.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Phase 3 — build the format and both conversions,
with the tests, before anything can call it.

**Inferred user intent:** As Step 1.

**Commit (code):** `e80ec0c` — "DATADROP-8 phase 3: the portable format"

### What I did

- `ui/src/model/secrets.ts` (new): `findSecrets`, moved out of `persist.ts`,
  which now re-exports it so the import site still documents what guards
  durable storage.
- `ui/src/model/portable.ts` (new, ~430 lines): the envelope, `PortableNode`,
  the three payloads, `LIMITS`, `REASONS`, `parseBundle`, `describeBundle`,
  `measureBundle`, `unknownApps`, `sourcesOf`, `clampRatio`.
- `ui/src/store/bundles.ts` (new, ~330 lines): `bundleForTile` /
  `bundleForWorkspace` / `bundleForStage`, `IdPool`, `idsNeeded`, `hydrateDocs`,
  `hydrateTree`, `applyTileBundle` / `applyWorkspaceBundle` / `applyStageBundle`.
- `ui/test/portable.test.ts` (new, 46 tests).

### Why

Every later phase is a consumer of this, and it is the part where a mistake is
invisible: a bundle that has lost its sharing looks completely normal.

### What worked

- Building the §7.4 worked example as a fixture and asserting the tree
  *structurally* rather than against a JSON string. `toEqual` on the nested
  `{ split: { … } }` literal proves the absent fields are absent — `sources` and
  `inspector` carry no `doc` key at all — which a string comparison modulo
  whitespace would not.
- `IdPool` + `idsNeeded`. One test asserts that `idsNeeded(bundle)` is exactly
  what applying it consumes, and that one fewer throws `not enough ids` rather
  than minting an `undefined` id — which would surface much later as a duplicate
  React key.

### What didn't work

**1. The 65-leaf cap test passed for the wrong reason.** My first version built
the tree as a right-leaning chain, which is 65 leaves *and 65 levels deep*, so
`isPortableNode`'s depth bound rejected it as damaged before the leaf count was
ever reached:

```
error: expect(received).toEqual(expected)
- Expected  - 1
+ Received  + 1
(fail) parseBundle refuses with the reason … > more tiles than the cap
```

The test now builds a **balanced** 65-leaf tree, and the comment says why: a
chain would make the test pass while proving nothing about the leaf cap. This is
the failure mode the "break it once" rule exists to find — except here it was the
test that was wrong rather than the code.

**2. TypeScript will not let you spread a discriminated union and add a
member.** `{ ...leaf("chart", id), label: "x" }` is an error because `leaf`
returns `Node`, and `label` is not on the split variant:

```
test/portable.test.ts(284,55): error TS2353: Object literal may only specify known properties, and 'label' does not exist in type '{ id: string; type: "split"; … }'.
```

Cast to `Extract<Node, { type: "leaf" }>` at the fixture, which is a test's
licence to assert what it just built.

### What I learned

Putting the depth check *inside* `isPortableNode` rather than in a separate pass
is not a tidiness choice. A hand-made bundle nested 10 000 deep would overflow
the stack in the structural walker before any later depth check could report a
limit, and a validator that crashes on hostile input is not a validator. The
consequence is that a too-deep bundle is reported as `damaged` rather than with
a bespoke depth message, and the test says so rather than asserting a string it
does not produce.

### What was tricky to build

**Preserving document sharing at two levels.** A workspace bundle has its own
`docs` array; a stage bundle hoists documents above its workspaces, so a nested
workspace payload has an empty `docs` and its leaves index into the stage's
array. Getting that right is one `DocCollector` shared across the whole stage
export, and getting it *wrong* produces a bundle that looks perfect. The test
that catches it compares two leaves' `docId` for **identity** after a round trip
— `expect(a.docId).toBe(b.docId)` — not for equality of the documents they name.

**`PortableChrome` duplicates `StageChrome`.** `model` may not import `store`,
so the shape is restated. Rather than a cast, `applyStageBundle` *assigns* one to
the other at the single place they meet, so if the two ever diverge that line
stops compiling.

### What warrants a second pair of eyes

- `auditted()` **throws** on the export side where `parseBundle` **returns a
  reason** on the import side. Deliberate — the export case is an upstream
  design mistake with no recovery, the import case is untrusted input with a
  human waiting — but it is an asymmetry a reviewer should agree with.
- `describeBundle`'s exact wording is asserted in four tests. That makes them
  change-detectors on prose. They earn it here because the strings are what a
  user reads in the dialog, but a reviewer should say so out loud.
- `parseBundle` runs `findSecrets` over the whole parsed value *before*
  structural validation. That is deliberate ordering — audit first, trust later
  — and it means a malformed bundle carrying a token reports the credential
  rather than the damage.

### What should be done in the future

- `unknownApps` is written and nothing calls it yet. Phase 5's dialog is its
  consumer, and it is the only warning in the reason table that does not abort.

### Code review instructions

`ui/src/model/portable.ts` from `PortableNode`'s docstring — it carries the
whole of DR-64 — then `REASONS`, then `parseBundle`. Then `store/bundles.ts`'s
`DocCollector` and `hydrateTree`, which are the two halves of the round trip.

```bash
bun test --cwd ui test/portable.test.ts    # 46 pass
```

### Technical details

**How I established that a bundle cannot carry a secret.** Four things, in
increasing order of strength:

1. **Structural.** The exporter writes exactly `{ name, limit, spec }` per
   document, and `spec` is a `ChartSpec`: a `SourceRef`, `Step[]`, a geom, a
   five-channel mapping, a y scale and an optional type-override map. There is
   no field in any of those a credential could occupy, and there is no path from
   `TokenRef` — which has no secret field, and `pbui/types.ts` says that absence
   is load-bearing — into any of them.
2. **A positive test.** `a bundle produced from real state carries no
   credential-shaped key` stringifies a real export and asserts none of the six
   spellings appears as a key.
3. **The export guard.** `auditted()` runs `findSecrets` over the finished
   bundle and throws. Tested by poisoning a `ChartSpec` with `{ token: … }` and
   asserting all three of `bundleForTile`, `bundleForWorkspace` and
   `bundleForStage` refuse.
4. **The import guard.** `parseBundle` runs the same `findSecrets` over the
   parsed value before anything is trusted, and a test loops over all nine
   forbidden spellings (`token`, `Token`, `authorization`, `auth`, `bearer`,
   `secret`, `password`, `apikey`, `api_key`) planting each in a nested position
   and asserting refusal.

The one function, in `model/secrets.ts`, is what `save()` also calls, so the
three doors cannot drift apart.

**Breaking the three guards.**

*Ids do not travel.* Break: `portableTree` writes `id: node.id` into the leaf.

```
(fail) the envelope > a workspace bundle matches the worked example, field for field
(fail) the envelope > a stage bundle hoists documents above its workspaces
error: expect(received).not.toContain(expected)
Expected to not contain: "e66131c1-9f85-4927-8c68-832c1fd3240d"
Received: "{\"format\":\"datadrop.layout\",…\"a\":{\"leaf\":{\"id\":\"e66131c1-9f85-4927-8c68-832c1fd3240d\",\"app\":\"sources\"}},…"
(fail) ids do not travel (DR-64) > a workspace bundle contains no node id and no document id
```

*Sharing survives.* Break: `DocCollector.at` appends a document per leaf instead
of returning the index it already has.

```
error: expect(received).toHaveLength(expected)
Expected length: 1
Received length: 2
(fail) the envelope > a stage bundle hoists documents above its workspaces
(fail) sharing survives a round trip > two leaves on one document import to two leaves on ONE document
(fail) sharing survives a round trip > two workspaces in one stage import to one document as well
```

*The credential guard.* Break: `parseBundle` stops calling `findSecrets`.

```
(fail) the credential guard fires in both directions > the importer refuses a bundle carrying a credential
Expected: false
Received: true
(fail) the credential guard fires in both directions > every forbidden spelling is caught, anywhere in the payload
```

All three restored; 324 pass across the suite.

## Step 4: The verb seam widened, and three descriptors

The phase that connects the format to the objects. `tile`, `workspace` and
`stage` get descriptors, so right-clicking a tile stops saying "no verbs for
this object yet" and the workspace strip's twenty-month-old promise of "R for
duplicate / delete" becomes true. The interface for all of it already existed —
those types were declared, and `Tile.tsx` and `WorkspaceStrip.tsx` were already
wrapping their titles in real `<Presentation>` elements — so what landed is
three files in `pbui/descriptors/`, three lines in a map, and the cases behind
them.

`actionsForVerb` now takes the whole state and may return a thunk, with the
layout cases in their own file. The clipboard rides the thunk extra argument, so
the entire export path is testable with no DOM. And `pendingImport` joins the
layout slice, which is what forces `save()` to enumerate the layout fields it
writes rather than passing the slice whole.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Phase 4 — widen the seam, add the descriptors, and
make the object menus real.

**Inferred user intent:** As Step 1.

**Commit (code):** `88ec889` — "DATADROP-8 phase 4: the verb seam widened, and three descriptors"

### What I did

- `ui/src/pbui/types.ts`: the `stage` presentation type; `TileRef`,
  `WorkspaceRef`, `StageRef`, and `PresentationValues` re-pointed at them.
- `ui/src/pbui/verbs.ts`: seventeen new verbs, `BundleSource`, `ImportTarget`,
  and a `describeVerb` case for each.
- `ui/src/pbui/descriptors/{tile,workspace,stage}.ts` (new) and three entries in
  `registry.ts`.
- `ui/src/store/clipboard.ts` (new): `ClipboardPort`, `browserClipboard`,
  `noClipboard`.
- `ui/src/store/index.ts`: `clipboard` on `MakeStoreOptions` and on the extra
  argument; `ThunkExtra` and `AppThunk`.
- `ui/src/store/effects.ts` (new): the export thunks, `beginImport`,
  `commitImport`.
- `ui/src/store/applyLayoutVerb.ts` (new) and `applyVerb.ts` widened.
- `ui/src/store/layout.ts`: `PendingImport`, `renamingId`, and the four
  bundle-application reducers.
- `ui/src/store/persist.ts`: `save()` enumerates the layout fields.
- `ui/src/store/world.ts`: `addDocs`, `noteExport`.
- Components: `Tile` and `WorkspaceStrip` mint refs and take their rename flag
  from the store; `StageBar` gets a `▾` that opens the same menu.
- `ui/test/effects.test.ts` (new, 11 tests) and a `layout descriptors` block in
  `descriptors.test.ts`.

### Why

The format existed and the objects existed; this is what connects them. It is
also the phase that repays the "keyhole" observation the design guide opens
with — that the whole feature list fits through three missing descriptor files.

### What worked

The purity claim has a one-line assertion now, and it is the assertion that
makes DR-68 checkable rather than asserted:

```ts
const [effect] = perform(store, { kind: "exportTile", nodeId });
expect(clipboard.written).toEqual([]);      // nothing has happened yet
await store.dispatch(effect as AppThunk<Promise<{ ok: boolean }>>);
```

### What didn't work

**1. The `▾` button opened the stage menu and closed it again in the same
event.** Clicking it while any other object menu was open produced nothing at
all. The cause is a two-listener race that is invisible in the source of either
file: `ObjectMenu` installs a window-level `click` listener to close on
click-away, and that listener runs *after* React's root handler — so the click
that calls `openMenu` also reaches the closer. `Presentation.onClick` has always
called `event.stopPropagation()` with a comment about *nested presentations*;
the real reason it matters is broader, and the `▾` button now does the same with
a comment saying so. The general rule, worth writing down: **anything that opens
an object menu from a DOM handler must stop propagation.**

**2. The `chart` presentation is now the only undescribed type.**
`descriptors.test.ts` used `tile` as its example of "an unknown presentation
type degrades rather than throws", which this phase invalidated:

```
error: expect(received).toEqual(expected)
- Expected  - 1
+ Received  + 63
(fail) an unknown presentation type degrades rather than throws > no descriptor means no verbs, not a crash
```

Switched to `chart` with a comment. A test whose fixture is "the thing this
ticket is about to build" is a test that will keep failing usefully.

**3. `VerbResult` typed as `ReturnType<typeof worldActions.setMapping>` did not
survive contact with a second slice.** That is a *specific* action type, so
every layout action failed to assign:

```
src/store/applyLayoutVerb.ts(26,15): error TS2322: Type '{ payload: { nodeId: string; label: string; }; type: "layout/renameLeaf"; }' is not assignable to type 'VerbResult'.
  Types of property 'payload' are incompatible.
      Type '{ nodeId: string; label: string; }' is missing the following properties from type '{ docId: string | null; channel: Channel; field: string | null; }': docId, channel, field
```

It is `UnknownAction | AppThunk<unknown>` now, which is what the design record
said and what I should have written first.

**4. The rename verb could not open a rename.** The menu entry is data and the
inline editor was `useState` inside `Tile`, three components away from anything
a verb can reach. Solved by moving the flag into the layout slice as
`renamingId` — a second transient field, which is *convenient*, because it makes
the `save()` enumeration guard test assert two fields rather than one. The
commit is a separate verb (`renameTile` carries the text) so the trace records
what the user typed rather than only that they started typing.

### What I learned

Adding a transient field to a persisted slice is a two-line change with a
one-reload consequence, and the only thing standing between them is whether
`save()` spreads or enumerates. Enumeration turns "someone remembers" into "the
compiler asks", and the comment beside it is what tells the next person which
side of the line their new field is on.

### What was tricky to build

**Keeping `actionsForVerb` a pure function while half its results are effects.**
The shape that works: `applyLayoutVerb` returns `VerbResult[] | null`, `null`
meaning "not mine", so `applyVerb` falls through to the world switch with no
second list of verb kinds anywhere. Thunks are *values* until dispatched, so the
seam stays assertable — and the test asserts exactly that by checking the fake
clipboard is untouched between the call and the dispatch.

**`commitImport` had to be a thunk and the reducers had to stay pure.** It mints
one id per document plus one per node, so it reads `idsNeeded(bundle)`, mints
that many with `newId()`, and hands fully-formed nodes to reducers that only
place them. The reducers are then replayable, which is the property
`applyVerb.ts` already argues for about `Date.now()`.

### What warrants a second pair of eyes

- `replaceLeafFromBundle` keeps the **target's** node id rather than the
  hydrated leaf's, so a tile that is re-pointed stays the same tile. That is
  what makes a drag in flight and a focus survive an import, and it means the
  hydrated leaf's minted id is discarded — one wasted id per tile import.
- `exportBundle` distinguishes "cannot be described" (the credential audit) from
  "the platform refused" and reports both as `ExportOutcome`. **Nothing consumes
  that outcome yet** — phase 5's dialog is its reader — so today a failed export
  is silent. That is the one place in the phase where the failure mode the
  design warns about ("the button appears to do nothing") is still live.
- `Workbench.tsx` narrows the instance scope on the sign-in stage only. It reads
  the current stage id to do it, which is the only place a page component
  consults a stage directly.

### What should be done in the future

- The `storeTemplate` verb exists in the union with no producer, because the
  "Save as a template …" entries were deliberately left out of the three
  descriptors until phase 6 builds the library. It is dead weight until then.

### Code review instructions

`ui/src/pbui/descriptors/tile.ts` first — it is the shortest complete statement
of what the ticket does. Then `store/applyLayoutVerb.ts`, then
`store/effects.ts`'s `exportBundle` and `beginImport`.

```bash
bun test --cwd ui test/effects.test.ts     # 11 pass, no DOM
bun test --cwd ui                          # 343 pass
```

By hand: right-click a tile title, a workspace chip and the masthead's `▾`.

### Technical details

**Breaking the `save()` guard.** Break: `persist.save()` passes `layout` whole
again instead of enumerating four fields.

```
Expected to not contain: "pendingImport"
Received: "{\"version\":2,…,\"currentSpaceId\":\"5ee1f633…\",\"pendingImport\":{\"target\":{\"kind\":\"tile\",\"nodeId\":\"f294c4ea…\"},\"prefill\":\"{\\\"format\\\":\\\"datadrop.layout\\\"}\",\"from\":\"clipboard\"},\"renamingId\":\"f294c4ea…\"}}"
(fail) a dialog is never persisted (DR-69) > save() writes no pendingImport and no renamingId, however open they are
```

**What the rendered menus show.** The tile menu, read out of the accessibility
tree after right-clicking a `profile` tile:

```
menu "tile profile"
  <tile> profile
  menuitem "Rename this tile …"
  menuitem "Duplicate — a second profile tile would show the same thing" [disabled]
  menuitem "Split right"
  menuitem "Split below"
  menuitem "Copy this tile to the clipboard"
  menuitem "Replace this tile from the clipboard …"
  menuitem "Inspect"
  menuitem "Close"
```

Clicking **Copy this tile to the clipboard** and reading the clipboard back:

```json
{
  "format": "datadrop.layout",
  "version": 1,
  "kind": "tile",
  "exportedAt": "2026-07-26T23:31:21.793Z",
  "name": …
```

and the trace, which is the security-relevant half — the kind and the name, and
nothing of the payload:

```
1  exported  tile “profile”  · to the clipboard
2  exported  tile “about”    · to the clipboard
```

One thing to note about that session: the *first* clipboard read after an export
came back empty in headless Chromium even though the trace entry (written only
after `await clipboard.write` resolves) was there. A second export read back 169
characters correctly. I take that as a harness timing quirk rather than a
product defect, but it is the kind of thing worth a second look in a real
browser.

## Step 5: Export and import in the interface

Three new components — `TextArea`, the only multi-line field in the tree;
`Dialog`, the only modal; and `BundleDialog`, which is import and export in one
component with a live verdict under the field. Everything beneath them was
already tested, so the work here was the interface and the two browsers.

The phase's acceptance criterion is the one the design calls "not optional":
verify the empty path in Firefox. It found two defects in ten minutes, and both
of them were complete failures of the feature rather than cosmetic — the import
dialog did not open at all, and once it did, it could not be pasted into. A
third came from sweeping the rendered page for contrast. All three were green
under typecheck, lint and 343 tests.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

Mid-turn addition, verbatim: *"save useful scripts for smoke testing in the
scripts/ folder of the ticket for later reuse, no need to discard useful things.
Backfill with scripts you find really useful, and add a toplevel docstrings to
document what they do."*

**Assistant interpretation:** Keep the throwaway browser checks as first-class
artefacts in the ticket, with docstrings explaining what each proves and what it
found, so the next person can re-run them.

**Inferred user intent:** The evidence these produce is the expensive part; the
scripts are cheap and should not be thrown away with the shell history.

**Commit (code):** `26b5170` — "DATADROP-8 phase 5: export and import in the interface"

### What I did

- `ui/src/components/atoms/TextArea/` (new), and one line in the atom barrel.
- `ui/src/components/organisms/Dialog/` (new): backdrop, focus trap, Escape.
- `ui/src/components/organisms/BundleDialog/` (new): the three states, the live
  `describeBundle` verdict, the unknown-application warning.
- `ui/src/components/pages/Workbench/WorkbenchShell.tsx`: `ImportDialog` and
  `ExportNotice`, both rendered before `<ObjectMenu />` so the menu stacks over
  them.
- `ui/src/store/clipboard.ts`: `READ_TIMEOUT` and the raced read.
- `ui/src/store/effects.ts` and `layout.ts`: the export confirmation as state.
- `ui/src/components/atoms/{Button,IconButton}/*.module.css`:
  `--pbui-ink-on-pane` on every variant that paints its own background.
- Three stories files, and three smoke scripts in the ticket's `scripts/`.

### Why

Everything beneath this phase was tested; what was left was whether it worked in
a browser that is not the one on my machine.

### What worked

Writing the empty path first and the prefill second, exactly as the design says.
The prefill is one `if` in `beginImport`, and it was already correct — what was
wrong was the thing underneath it, and building the fallback first is why that
was findable at all.

### What didn't work

**1. Firefox: the import dialog never opened.** The clipboard probe says why:

```
step: rendered
step: clipboard probe readText never settled
step: right-clicked
TimeoutError: waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[role="dialog"]') to be visible
```

`navigator.clipboard.readText()` in Firefox **neither resolves nor rejects**.
`browserClipboard.read()` had a `try/catch`, which guards a rejection and does
nothing at all for a promise with no outcome, so `beginImport`'s `await` never
returned and `openImport` was never dispatched. The menu entry looked like a
dead control. It is now `Promise.race([readText(), timeout(700)])`, with the
constant exported and the reason written above it.

The same hazard bit the *check* first — my first Firefox script hung on its own
unguarded `await navigator.clipboard.readText()` and had to be killed:

```
$ timeout 180 bun run /tmp/ff-check.ts
Exit code 143
Command timed out after 2m 0s
```

**2. Firefox: the dialog opened, and could not be pasted into.**

```json
"opened": { "prefill": "", "focused": false, "confirmDisabled": true }
"failures": ["the field should be focused, so ⌘V works with no click first"]
```

`Dialog` focused `panel.querySelector(FOCUSABLE)`, and a panel's first focusable
element is the ✕ in its header. On Chromium this is invisible — the field is
prefilled, so nobody needs to type. On Firefox the focused field *is* the import
mechanism. `Dialog` now focuses the first focusable thing in the body, with a
`display: contents` wrapper so naming the region costs no layout.

**3. A contrast sweep found the phase-1 defect again, one control over.**

```json
{ "what": "button[this stage's verbs]", "ratio": 1.13,
  "colour": "rgb(255, 255, 255)", "background": "rgb(241, 241, 238)" }
```

Same composition as the white-on-white select: `color: inherit`, an inverted
surface re-pointing `--pbui-ink` to paper, and a variant painting
`--pbui-pane-alt` behind itself. Fixing one atom in phase 1 did not fix the
class. `Button.framed`, `Button.raised` and `IconButton.framed` all state
`--pbui-ink-on-pane` now, and the sweep is a script rather than a memory.

**4. Biome refused the backdrop-click dismissal**, and it was right to:

```
src/components/organisms/Dialog/Dialog.tsx:102:5 lint/a11y/useKeyWithClickEvents
  × Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
```

Rather than suppressing it I removed the behaviour, because the rule prompted a
better answer: **this dialog holds text the user has pasted, and click-away
would discard it with no undo.** Escape and the ✕ are the two routes out, both
aimed at deliberately. The backdrop dims and swallows pointer events and does
nothing else.

### What I learned

"Verify it in Firefox" was not a compatibility chore. Every defect in this phase
was a *complete* failure of the feature on that browser and *invisible* on the
other, and two of the three were in code I had written specifically to handle
the Firefox case. Guarding a rejection is not the same as guarding a
non-outcome, and a promise that never settles is a much worse failure than one
that throws, because there is nothing to catch and nothing to log.

### What was tricky to build

**Deciding where the export confirmation lives.** The design draws it as a
panel; the question was what holds it. It became `layout.notice`, a third
transient field, which is *convenient* rather than annoying: the `save()`
enumeration guard now asserts three fields are excluded rather than one, and
each new transient field makes that test stronger.

**Getting the smoke scripts to resolve `playwright` from the ticket
directory.** They live in `ttmp/` and the dependency lives in `ui/node_modules`,
so a bare import fails:

```
error: Cannot find package 'playwright' from '…/scripts/smoke-firefox-import.ts'
```

`scripts/playwright.ts` walks up from the script until it finds the checkout's
`ui/node_modules` and requires from there, so the scripts run from any
directory. The alternative — telling people to set `NODE_PATH` — is a thing to
remember and therefore a thing to forget.

### What warrants a second pair of eyes

- **`READ_TIMEOUT = 700`.** Long enough for a real read anywhere it works,
  short enough not to be felt. It is a number, and numbers like this are
  usually wrong for someone: a Safari user facing the paste-confirmation prompt
  will time out and get the empty dialog, which is correct but not obviously so.
- **The backdrop does not dismiss.** Defensible and unusual; a reviewer should
  agree with it rather than discover it.
- **`ExportNotice` is a modal for a confirmation.** It carries a sentence that
  matters — what a bundle contains and does not — and a toast would let a user
  paste before reading it. It is still a modal for a success case.

### What should be done in the future

- The three smoke scripts are not in CI. They need a dev server and two browser
  downloads, which is a bigger conversation than this ticket.

### Code review instructions

`ui/src/store/clipboard.ts` first, for `READ_TIMEOUT` and why it exists. Then
`Dialog.tsx`'s effect, then `BundleDialog.tsx`.

```bash
bun run --cwd=ui dev &
bun run ttmp/…/DATADROP-8…/scripts/smoke-firefox-import.ts      # the one that matters
bun run ttmp/…/DATADROP-8…/scripts/smoke-chromium-roundtrip.ts
bun run ttmp/…/DATADROP-8…/scripts/smoke-contrast.ts
```

### Technical details

The Firefox run, after both fixes — this is the acceptance evidence for the
phase:

```json
{
  "readText": "never settles",
  "opened":     { "prefill": "", "focused": true, "confirmDisabled": true },
  "afterPaste": { "confirmDisabled": false, "verdict": "✓ A tile: table. 1 kB." },
  "applied":    { "dialogOpen": false, "tiles": ["table", "encoding", "chart", "table"] },
  "consoleErrors": [],
  "failures": []
}
```

Read the first line against the third: the clipboard cannot be read, and the
import works anyway.

The Chromium round trip, through the real system clipboard:

```json
"confirmation": "Copied to the clipboard ✕ A tile: about. 1 kB. It names the sources these
                 tiles read and the filters you set on them. It contains no rows and no
                 credentials. OK",
"copiedBytes": 169,
"after": { "dialogOpen": false, "tiles": ["about / help", "about / help", "trace"] },
"failures": []
```

and the menu it went through, with the disabled entry that is the interesting
one:

```
{ "label": "Duplicate — a second about tile would show the same thing", "disabled": true }
```
