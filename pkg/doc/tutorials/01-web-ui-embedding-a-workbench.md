---
Title: "Embedding a workbench in a page"
Slug: web-ui-embedding-a-workbench
Short: "Step-by-step guide to putting one or more live, independent workbenches into a scrolling page — seeded layouts, fixture data that needs no server, narrowed application vocabularies and reset."
Topics:
- web-ui
- embedding
- frontend
Commands:
- serve
IsTopLevel: false
IsTemplate: false
ShowPerDefault: false
SectionType: Tutorial
---

`WorkbenchInstance` is a whole workbench, sandboxed, embeddable, and usable as
many times as you like on one page. This tutorial walks through embedding one,
then several, then narrowing what each offers.

The property that makes it worth using rather than screenshotting: an embedded
instance renders **the same WorkbenchShell the product renders**. That identity
is not a tidiness argument. It is the entire basis of the claim that a tutorial
page is executable documentation — the moment a tour needs its own chart
component, a lesson can go stale without anything failing. Every difference
between the product and an embedded panel is configuration.

## Step 1: the minimum

```tsx
import { WorkbenchInstance } from "../components/pages/WorkbenchInstance";

<WorkbenchInstance />
```

That gives you a full workbench with its own store, its own documents, its own
tile layout and its own accept plumbing, sharing nothing with any other instance
on the page. It persists nothing, because `persistKey` defaults to `null`.

It also has no data, because it has no server. Step 3 fixes that.

## Step 2: give it a height

The shell **accepts** its height; it does not declare one. That is deliberate: a
container that declares `height: 100vh` cannot be embedded, because five sections
down a scrolling page would each be a viewport tall.

So the caller supplies the height, and the right place to put it is a wrapper
rather than the instance itself:

```tsx
<div className={styles.panelBody}>      {/* height: 720px */}
  <WorkbenchInstance />
</div>
```

```css
.panelBody { height: 720px; display: flex; min-height: 0; }
```

`min-height: 0` is the half that is easy to omit. A flex child defaults to
`min-height: auto`, which refuses to shrink below its content — so the canvas
would grow to fit a 360-row table instead of scrolling it.

Put the height on a wrapper, not on the instance, for a second reason: the
instance's full-frame control sets `position: fixed; inset: 0`, and a height
passed directly as a class on the instance would beat it.

## Step 3: serve its data from memory

An embedded panel usually must not need a server. A visitor with no account and
no drop should still see a chart with data in it.

```tsx
import { fixturesFrom } from "../api/fixtures";
import readings from "../fixtures/readings.json";

const FIXTURES = fixturesFrom(readings as Table);

<WorkbenchInstance config={{ fixtures: FIXTURES }} />
```

With `fixtures` set the instance **never** reaches the network — not "prefers not
to", never. The fixture map travels on the store's thunk extra argument, where
`fixtureBaseQuery` reads it and answers catalogue and table requests from memory,
honouring the row budget the same way the server would. The panel therefore
renders identically with the API absent, returning 500, or demanding an account.

Requests for a source the fixture map does not hold return 404, and endpoints the
fixture layer does not implement return 501. Neither falls through to the
network, because a panel that silently starts working only for signed-in readers
is worse than one that plainly does not.

## Step 4: seed a layout

`preloaded` is read **once**, at construction. Changing it afterwards does
nothing.

```tsx
<WorkbenchInstance
  config={{
    fixtures: FIXTURES,
    preloaded: {
      world:  { docs, docOrder, activeDocId },
      layout: { spaces: [{ id, name: "explore", tree }], currentSpaceId: id },
    },
  }}
/>
```

Build the tree with the same `leaf` and `split` helpers the product uses:

```ts
const tree = split("row",
  leaf("sources"),
  split("col", leaf("chart"), leaf("table"), 0.6),
  0.34);
```

Two things to watch. `leaf(app)` defaults its `docId` to `null`, which means
"follow the active document" rather than "no document" — usually what you want,
but not the same thing. And a seed that produces no documents leaves every
document-bound tile showing an empty state, so either seed a document or let
`seed` default to `true` and let the factory mint one.

## Step 5: narrow the vocabulary

```tsx
<WorkbenchInstance config={{ apps: ["chart", "table", "pipeline", "encode"] }} />
```

The tile's application picker and the launcher now offer four applications
instead of twenty-five. The dropdown is a menu of *what this panel is for*, and a
section teaching the grammar of graphics should not offer the token manager.

The allow-list is a rendering constraint, not a mounting one. A tile whose seeded
layout names an application outside the list still renders it — the alternative
is a seeded layout that silently loses a tile — and that application still
appears in its own picker, because a `<select>` whose value matches no option
renders blank and reassigns on the next change.

## Step 6: trim the chrome

```tsx
<WorkbenchInstance
  config={{
    masthead: false,     // default: the page has its own
    workspaces: true,    // default: switching layouts may be the lesson
    fullFrame: true,     // default: offer the expand control
  }}
/>
```

`fullFrame` gives the reader a control that expands the panel to fill the window
with `position: fixed; inset: 0`, and Escape to come back. A 700px band down a
scrolling page is not enough room to do real work, and telling the reader to open
the application in another tab defeats the point of embedding it.

The expand uses a positioned overlay rather than the Fullscreen API, because the
API's top layer would render above the object menu and break every right-click
inside the expanded panel.

## Step 7: children render beside the shell, inside the providers

```tsx
<WorkbenchInstance config={{ … }}>
  <LessonRail lessons={lessons} />
</WorkbenchInstance>
```

Both halves of that placement matter.

**Inside the providers** means a child can call `accept()` — a promise-returning
context value — so a lesson step that teaches the accept protocol can
*demonstrate* it: press the control, then click a field chip in a tile beside it.
A rail rendered outside the providers could not reach the protocol at all, and
the choice would be between duplicating it and dropping the step that teaches the
least familiar idea in the system.

**Outside the framed box** is layout: commentary beside a bordered workbench
reads as commentary. A rail sharing the workbench's border reads as part of the
application.

## Step 8: reset

There is no `reset()`. Change the `key`:

```tsx
const [nonce, setNonce] = useState(0);

<button onClick={() => setNonce((n) => n + 1)}>Reset this panel</button>
<WorkbenchInstance key={nonce} config={{ … }} />
```

React throws the subtree away and a fresh store is built on the next render. A
reset that walks state back can leave a fragment behind, and the fragment is
always in the thing you did not think to walk back.

## Several instances on one page

Nothing extra is required. Each has its own store; the store is the boundary.
Two rules keep it that way:

- **Leave persistKey at null.** Six panels writing to one `localStorage` key
  means the last one the reader scrolled past silently overwrites their real
  layout. The default is `null` precisely so that forgetting is inert rather than
  destructive.
- **Do not hoist anything instance-scoped to a module.** If two panels can reach
  it without going through a `Provider`, it is shared.

Application-level concerns stay at the application: the session query, the
signed-out gate, and any URL parameter read. Six panels each issuing a session
query and each forcing themselves to a sign-in screen for an anonymous visitor is
exactly the failure that separating the shell from the application prevents.

## The full configuration

| Field | Default | Meaning |
|---|---|---|
| `preloaded` | — | Starting world and layout; read once, at construction |
| `seed` | `true` | Mint a document if the world has none |
| `fixtures` | — | Answer tables from memory; the instance never reaches the network |
| `apps` | all | Which applications the picker and launcher offer |
| `persistKey` | `null` | Where to persist, or memory-only |
| `masthead` | `false` | The wordmark |
| `workspaces` | `true` | The workspace strip |
| `fullFrame` | `true` | Offer the expand-to-window control |

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| The panel is zero pixels tall | No height on the wrapper | Give the wrapper an explicit height and `min-height: 0` |
| A table paints outside its tile | A flex child defaulted to `min-height: auto` | Add `min-height: 0` to the wrapper chain |
| Full frame expands the width but not the height | A height class was passed to the instance, beating `position: fixed` | Move the height to a wrapper element |
| The panel shows empty charts | No fixtures, and no server reachable | Pass `fixtures`, built with `fixturesFrom` |
| A tile shows a 404 | The seeded layout names a source the fixture map does not hold | Add the table to the fixture map, or re-point the tile |
| Changing `preloaded` has no effect | It is read once, at construction | Change the `key` to rebuild the instance |
| Two panels show the same documents | A module-level store is being imported somewhere | Every instance must build its own through `makeStore` |
| The reader's real layout was overwritten | An embedded instance was given a `persistKey` | Leave it `null` |
| A lesson control cannot call `accept()` | It was rendered outside the instance's providers | Pass it as a child of `WorkbenchInstance` |

## See Also

- `datadrop help web-ui-store-instances` — why the store is the boundary
- `datadrop help web-ui-window-manager` — building the seeded split tree
- `datadrop help web-ui-presentation-protocol` — the accept protocol a child may call
