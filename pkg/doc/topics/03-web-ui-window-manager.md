---
Title: "The window manager — workspaces, split trees, tiles and the application registry"
Slug: web-ui-window-manager
Short: "How the browser workbench arranges applications on screen: named workspaces over one world, binary split trees, tiles that hold no application state, and a registry that resolves an id to a component."
Topics:
- web-ui
- architecture
- frontend
Commands:
- serve
IsTopLevel: false
IsTemplate: false
ShowPerDefault: false
SectionType: GeneralTopic
---

The workbench arranges itself as named workspaces over one world. Each workspace
is a binary split tree whose leaves are tiles; each tile names an application and
optionally a document. This page explains that structure, the properties it
guarantees, and the one rule that makes those properties hold.

The reason to understand it before changing it is that the structure is doing
more work than it looks. Swapping two tiles is a two-field exchange. Closing a
tile loses nothing. Two tiles showing one document stay in lockstep. None of
those is arranged for anywhere; all three fall out of the rule in the next
section.

## Tiles hold no application state

A leaf holds *which application* and, for document-bound applications, *which
document*:

```ts
type Node =
  | { id: NodeId; type: "leaf"; app: AppId; docId: DocId | null }
  | { id: NodeId; type: "split"; dir: "row" | "col"; a: Node; b: Node; ratio: number };

interface Workspace { id: string; name: string; tree: Node; pinned?: boolean }
```

Everything an application shows lives in the `world` slice. That is why swapping
two tiles exchanges two fields rather than migrating state, why closing a tile
discards nothing but a rectangle, and why two chart tiles on document α move
together — they read one object rather than two copies.

Break this rule and all three properties go at once, silently. If a tile starts
holding, say, a scroll position or a draft filter, then closing it loses work and
swapping it corrupts state, and neither failure produces an error.

## Tree operations are pure functions

`ui/src/store/layout.ts` holds the operations with no React anywhere near them,
which is what lets them be tested exhaustively:

| Function | What it does |
|---|---|
| `updateNode(node, id, fn)` | Replace one node, structurally sharing everything else |
| `removeLeaf(node, id)` | Remove a leaf; its sibling absorbs the space |
| `findLeaf(node, id)` | Locate a leaf, or `null` |
| `countLeaves(node)` | How many tiles a tree holds |
| `cloneTree(node)` | Deep copy with entirely fresh ids |
| `snapRatio(value)` | Snap a divider to 1/4, 1/3, 1/2, 2/3, 3/4 within tolerance |

`updateNode` returns the **same object** when nothing below it changed. That is
not a micro-optimisation. It is what lets `React.memo` skip an untouched subtree
when one tile changes, and with fifteen tiles each running `evaluate()` it is the
difference between a responsive divider drag and a slideshow.

`cloneTree` minting fresh ids is likewise load-bearing rather than tidy. A
duplicated workspace that shared node ids with its original would produce
duplicate React keys and a hit-test returning the wrong tile.

## Guards that exist for a reason

**The last tile in a workspace cannot be closed.** An empty workspace has no way
back — there is nothing left to right-click and nothing to split.

**The last workspace cannot be deleted.** Same argument, one level up.

**Pinned workspaces are defined in code.** A pinned workspace is re-created from
source on every load and its tree replaces whatever was stored. That is what
makes "hardwired" true rather than aspirational: without it, a user who closed
the account workspace in one release has no account workspace in the next, and
the only route back is clearing `localStorage`. The cost is that tiles added to a
pinned workspace are lost on reload, which is the intended meaning, and the
workspace strip marks those workspaces so the rule is visible.

The merge rule is asymmetric on purpose: code-defined workspaces are taken
wholesale from source so that a tile added in a new release actually appears;
everything else comes from storage so that a user's arrangement is not thrown
away.

## Docking and swapping

Dragging a tile's grip and dropping it produces one of two results, decided by
where in the target tile the pointer lands:

- **Centre**: the two tiles exchange applications and documents.
- **Near an edge**: the target splits, the dragged tile lands on that side, and
  the source position closes.

`dockTile` refuses to act if the source still exists in the tree after removal —
producing a tree with one leaf in two places is worse than doing nothing.

## The application registry

A tile names an application by id and nothing more. `ui/src/appkit/registry.ts`
resolves that id:

```ts
interface AppDescriptor {
  id: string;
  title: string;
  tone: string;        // a token name, never a hex value
  docBound: boolean;
  Component: ComponentType<AppProps>;
}
```

Applications register themselves by side effect at import time, collected in
`ui/src/apps/all.ts`. A registry populated by import rather than by a central
list means adding an application touches one file — its own — and forgetting to
import it is the only way to lose one, which the launcher tile makes immediately
obvious.

**The registry lives in `appkit/`, not in `apps/`, and that placement is
load-bearing.** It is not an application; it is the contract applications
register against. While it sat under `apps/`, the single import of it from the
`Tile` organism was the only reason the layer graph carried an
`organisms -> apps` edge — which in turn forced `apps -> organisms` to be
forbidden, to keep the pair acyclic. That forbidden edge made the standard
pattern illegal: presentational panels in `organisms` with applications as thin
containers above them. Moving the file removed the edge and made the pattern
available.

## docBound: the one distinction to internalise

`docBound` is true for exactly four applications — `chart`, `table`, `pipeline`,
`encoding` — because those four are *views of one composition*. Everything else
is a view of the whole world.

> If a tile carries a document strip it is a view of one document and can be
> re-pointed; if it does not, it is the whole world and there is only one of it.

That single sentence is what a reader has to understand about the shell, and it
is derivable from the registry rather than written down anywhere, which is why a
hand-kept list of "which tiles show a document bar" would eventually disagree
with the applications it describes.

## Scoping which applications a workbench offers

The registry stays global; the *visible* set can be narrowed per instance
through `AppScope`. Applications are stateless components, so a second registry
would buy nothing and cost the class of bug where an application is registered in
one and missing from another — which surfaces as a tile rendering "unknown app"
with no way to find out why.

The allow-list is a **rendering** concern, applied by the tile's application
picker and by the launcher. It deliberately does not stop an application from
being *mounted*: a tile whose layout names an excluded application still renders
it, because the alternative is a seeded layout that silently loses a tile.

For the same reason `Tile` always includes its own application in the picker even
when the scope excludes it. A `<select>` whose value matches no option renders
blank and silently reassigns on the next change, so a seeded layout naming an
out-of-scope application would lose that tile the first time anyone touched the
dropdown.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| Dragging a divider is slow with many tiles | `updateNode` was replaced by something that rebuilds the whole tree | Preserve identity when nothing below changed, so `React.memo` can skip |
| A duplicated workspace behaves like the original | The tree was copied without fresh ids | Use `cloneTree`, which mints a new id for every node |
| A tile shows "no application called X" | The application is not registered | Add the import to `ui/src/apps/all.ts`; check the id spelling |
| A tile disappears after touching its dropdown | The scope excluded the tile's own application and it was filtered out | Keep the own-application rule in the picker's option list |
| A tile added to a workspace vanishes on reload | The workspace is pinned, so its tree comes from code | Add the tile in `ui/src/store/spaces.ts`, or use an unpinned workspace |
| Closing a tile loses unsaved work | That tile is holding application state | Move the state into the `world` slice; tiles hold `app` and `docId` only |

## See Also

- `datadrop help web-ui-object-model` — the world the tiles are views of
- `datadrop help web-ui-presentation-protocol` — the verbs a tile and a workspace expose
- `datadrop help web-ui-store-instances` — running more than one workbench at once
- `datadrop help web-ui-component-layers` — why the registry sits in `appkit/`
