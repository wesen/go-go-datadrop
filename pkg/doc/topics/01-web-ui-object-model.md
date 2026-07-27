---
Title: "The web workbench object model — what state lives where, and why"
Slug: web-ui-object-model
Short: "The three-way division of state in the browser workbench — the RTK Query cache, the world slice, the layout slice — and the rule that decides which one a new piece of state belongs in."
Topics:
- web-ui
- architecture
- frontend
Commands:
- serve
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: GeneralTopic
---

`datadrop serve` ships a browser workbench alongside the HTTP API. This page
describes how that workbench divides its state, because that division is the
decision every other decision in the interface rests on. Read it before you
change anything under `ui/src/`.

State in the workbench lives in one of three places, and which one it lives in
is not a matter of taste. Put a value in the wrong one and the symptom is not a
compile error; it is a chart that stops updating, or a request that fires four
times, or a layout that overwrites itself on reload. The three places are the
RTK Query cache, the `world` slice, and the `layout` slice.

## The three owners

**The RTK Query cache owns anything the server said.** Every table the
workbench draws arrives through `ui/src/api/client.ts` and is cached under the
arguments that requested it — the source reference and the row budget. Two
documents pointed at the same stream with the same limit therefore share one
cache entry and one HTTP request, without anybody arranging it. Cache
invalidation, refetch on window focus, and refetch on reconnect all come from
the same machinery.

**The world slice owns anything the user decided about data.** Documents,
snapshots, the two compare pins, the watchlist, the trace, and the currently
inspected object. It lives in `ui/src/store/world.ts`.

```ts
interface WorldState {
  docs: Record<DocId, Doc>;
  docOrder: DocId[];                       // stable display order
  activeDocId: DocId | null;               // the target of ambient verbs
  snapshots: Record<string, Snapshot>;
  snapshotOrder: string[];
  pins: [string | null, string | null];    // compare A / B
  watch: WatchEntry[];
  trace: TraceEntry[];
  inspected: { title: string; value: unknown } | null;
}
```

**The layout slice owns anything the user decided about screen.** Workspaces
and their split trees, and which workspace is current. It lives in
`ui/src/store/layout.ts`.

The division between the last two is what keeps a layout change from
invalidating a chart. Dragging a tile divider writes to `layout`; every memo
keyed on `world` keeps its identity, so nothing re-evaluates a pipeline over
50 000 rows because a splitter moved four pixels.

## Records with an order array, not arrays

`docs` is a `Record<DocId, Doc>` with a separate `docOrder: DocId[]`, and that
shape is deliberate. A plain array forces `docs.find(d => d.id === id)` at every
call site. With fifteen tiles re-rendering, that is a linear scan per tile per
frame. The record gives constant-time lookup and the order array keeps display
order stable and reorderable. Snapshots follow the same pattern for the same
reason.

## A document is an identity plus a ChartSpec

This is the simplification that pays for itself repeatedly:

```ts
interface Doc {
  id: DocId;
  name: string;      // α, β, γ … until the user renames it
  limit: number;     // the row budget for this document's source
  spec: ChartSpec;   // model/chart.ts
}
```

There is no parallel "chart" type. Because a document *is* a specification with
a name and a row budget, a series of operations that would otherwise each need
their own encoder fall out of one deep copy:

- Snapshotting is a deep copy of `doc.spec`.
- A permalink is `hashForSpec(doc.spec)` — `ui/src/model/permalink.ts`.
- Persisting the workspace serialises documents with no extra encoder.
- Compare A/B diffs two specs field by field.
- Restoring a snapshot into a document is one assignment.
- Duplicating a document is a clone plus a new id.

If you find yourself writing a `SnapshotSpec` type that is *almost* a
`ChartSpec`, stop. You have re-introduced the thing this decision removes.

`limit` is the one field deliberately outside the spec. It describes how much of
the source was loaded rather than what to draw, so it belongs to the document.
It travels with a snapshot, so restoring one reproduces the same window over the
data rather than a different window with the same drawing.

## Deep-copying a spec out of a reducer

`ui/src/store/world.ts` contains a three-line function whose comment is longer
than its body, and the reason is worth understanding rather than
pattern-matching:

```ts
function cloneSpec(spec: ChartSpec): ChartSpec {
  return structuredClone(isDraft(spec) ? (current(spec) as ChartSpec) : spec);
}
```

`createSlice` runs reducers under Immer, so inside a reducer `doc.spec` is a
Proxy over a draft rather than a plain object. `structuredClone` on a Proxy
throws `DataCloneError`. Immer's `current()` materialises the draft into a plain
value first.

The trap is the obvious alternative. A spread — `{ ...doc.spec }` — does **not**
throw. It produces a shallow copy that aliases `steps` and `mapping`, so every
snapshot silently tracks the document it was taken from. That defect renders
correctly, passes a smoke test, and only shows up when someone edits a pipeline
and watches their saved snapshot change with it.

## The trace is capped

`trace` is a ring capped at `TRACE_CAP = 500` entries, dropping from the front.
At one entry per keystroke in a step editor, an uncapped trace is a memory leak
with a scrollbar. It is a teaching surface — it shows the user what their last
action actually did — not an audit log of record, and it is deliberately not
persisted: restoring yesterday's transcript beside today's work is confusing
rather than useful.

## Ids are UUIDs

`newId()` returns `crypto.randomUUID()`. Counter-based ids collide after a
reload, which forces a walk over the restored tree to bump the counter past the
highest id seen. A collision there is a duplicate React key *and* a hit-test
returning the wrong tile. UUIDs remove the class of bug rather than the
instance, and stay unique across tabs and across exported layouts.

## Where everything else lives

| Lives in | Holds | Why there |
|---|---|---|
| RTK Query cache | one `Table` per `(source, limit)` | two documents on one source share one entry and one request |
| Redux `world` | documents, snapshots, pins, watchlist, trace | serialisable, selector-subscribable, time-ordered |
| Redux `layout` | workspaces and split trees | independent of the world, so a layout change never invalidates a chart memo |
| React context (root) | pending accept resolver, open menu, mouse-doc text | holds a function and screen coordinates; neither is serialisable |
| React local (tile) | text being typed before commit | keystroke-rate state must not reach the store |
| `useMemo` per tile | `evaluate` and `buildPlot` output | derived; keyed on table identity and spec identity |
| `sessionStorage` | the bearer token, and nothing else | cleared when the tab closes |
| `localStorage` | workspaces, documents, snapshots | survives reload; never the token |
| URL fragment | the active document's spec | shareable; fragments are never sent to the server |

## The rule

**If it cannot be serialised to JSON, it does not go in Redux.**

The canonical violation is the accept protocol's pending `resolve` function. It
is a function, so it lives in a React ref inside `PbuiProvider` beside a
`useState` flag that drives re-rendering. See
[web-ui-presentation-protocol](#see-also).

The second rule follows from the last row of the table above: the URL fragment,
not a query parameter. Fragments are never transmitted, so a shared chart link
cannot deposit a filter value — which may be a patient identifier or an internal
hostname — into a server access log.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| A snapshot changes when you edit the document it came from | A spread was used instead of `cloneSpec`; `steps` and `mapping` are aliased | Use `cloneSpec`, which handles the Immer draft and deep-copies |
| `DataCloneError: could not be cloned` in a reducer | `structuredClone` called on an Immer draft Proxy | Wrap with `current()` first, as `cloneSpec` does |
| A chart re-renders when a splitter is dragged | Something read `layout` state inside a memo keyed for `world` | Split the selector; a tile's data memo must not depend on layout |
| Two tiles on one source issue two requests | The requests differ in `limit`, so they are different cache keys | Align the row budgets, or accept two windows deliberately |
| A value disappears on reload | It was in React local state or context, not in a slice | Decide whether it *should* survive; if so move it to a slice and check it is serialisable |
| Redux DevTools warns about a non-serialisable value | A function, `Date`, `Map` or class instance reached the store | Keep it in a ref; store an id or an ISO string instead |

## See Also

- `datadrop help web-ui-presentation-protocol` — how objects on screen get menus and verbs
- `datadrop help web-ui-window-manager` — workspaces, split trees and the application registry
- `datadrop help web-ui-store-instances` — why the store is a factory and what that buys
- `datadrop help web-ui-component-layers` — the enforced dependency graph under `ui/src/`
