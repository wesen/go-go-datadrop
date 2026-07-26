---
Title: "The component layers — an enforced dependency graph under ui/src"
Slug: web-ui-component-layers
Short: "The one-way dependency graph the browser workbench's source obeys, what each layer may import, why the engine sits at the bottom with no dependencies at all, and the test that fails on a violation."
Topics:
- web-ui
- architecture
- frontend
- design-system
Commands:
- serve
IsTopLevel: false
IsTemplate: false
ShowPerDefault: false
SectionType: GeneralTopic
---

Every directory under `ui/src/` belongs to a layer, and each layer may import
only from a declared set of others. The graph is one-way, it has no cycles, and
it is checked by `ui/test/layers.test.ts`, which walks every import in the tree
and fails on a violation naming the offending file and line.

The test exists because a convention that is only written down is a convention
that has already been broken somewhere nobody has looked. It runs inside
`bun test`, which is already in CI.

## The graph

```
model      ──> (nothing)
api        ──> model
export     ──> model
fixtures   ──> model
styles     ──> (nothing)
pbui       ──> model, foundation
store      ──> model, api, pbui
appkit     ──> model, pbui, store
tour       ──> model, pbui, store, appkit, api, fixtures

foundation ──> (nothing)
layout     ──> foundation
atoms      ──> foundation, layout, pbui, model
molecules  ──> atoms, layout, foundation, pbui, model, store
organisms  ──> molecules, atoms, layout, foundation, pbui, model, store, api, appkit
apps       ──> organisms, molecules, atoms, layout, foundation, pbui, model, store, api, appkit
pages      ──> everything above, plus apps and tour
```

## Why each edge is where it is

**The model layer imports nothing, and that is the most important row.** The grammar of
graphics, the pipeline evaluator, the table types and the plot builder are all
pure. Nothing under `ui/src/model/` imports React. That is what lets `bun test`
exercise the whole engine with no DOM and no server, which in turn is why the
plot tests are fast enough to run on every save.

**The pbui layer knows the engine and foundation, and not the store.** The dependency
runs the other way: `store` consumes the verb and presentation vocabulary that
`pbui` defines. Declaring `pbui -> store` would have been a cycle.

`foundation` is an exception granted deliberately. It is the bottom of the
component stack — design tokens made usable in React, importing nothing itself —
so depending on it cannot create a cycle, and the alternative is `pbui`
re-implementing the type scale and its own visually-hidden helper.

What `pbui` may **not** import is `atoms` and above. Descriptors hold no
components, so the chip that draws a presentation lives in `atoms` and the
type-to-chip mapping lives there with it.

**The appkit layer exists for what it unblocks.** It holds the `AppDescriptor`
interface, a `Map`, and three functions over it — the contract applications
register against. It is not an application. While it sat under `apps/`, the
`Tile` organism importing `appFor` was the one and only reason the graph carried
an `organisms -> apps` edge, and that edge is why `apps -> organisms` had to be
forbidden to keep the pair acyclic. The forbidden edge made the standard pattern
illegal: presentational panels in `organisms`, with applications as thin
containers above them. Moving the file removed the edge, so the pattern became
available and no cycle can form, because `organisms` no longer names `apps` at
all.

**An application may not import a page.** An application must never reach back up to
the shell that hosts it. That is what makes an application renderable in a story,
in a tile, or inside an embedded panel without knowing which.

**Lesson content may not import components.** The lesson content — predicates over
`RootState`, runners returning actions — must stay testable with no DOM. That
restriction is why the `Lesson` type sits in `appkit` rather than beside the rail
that renders it.

## The component layers, in order

| Layer | Holds | Test |
|---|---|---|
| `foundation` | Tokens made usable in React: the type scale, dividers, code text, visually-hidden | Imports nothing |
| `layout` | Structural wrappers: `Stack`, `Toolbar`, `Surface`, `AppBody` | No domain knowledge at all |
| `atoms` | The raw elements, wrapped once: `Button`, `TextInput`, `SelectInput`, and the presentation chips | This is where a raw `<button>` is legal |
| `molecules` | Small compositions with one job: `EmptyState`, `Callout`, `InlineRename`, `LessonStep` | Two or three atoms and a decision |
| `organisms` | Whole panels: `TablePanel`, `ChartPanel`, `Tile`, `SplitView`, `WorkspaceStrip` | Presentational; takes DTOs, not hooks |
| `pages` | The shell and the page compositions | Only layer that may name `apps` |

The dividing line between `organisms` and `apps` carries most of the weight.
**Organisms are presentational and applications are containers**: the application
holds the hooks and the queries and hands plain data to an organism, which
renders it. That is what makes an organism storyable without a store and an
application swappable in a tile.

## Rules the tests enforce alongside the graph

**No hand-written form controls outside the atoms layer.** `ui/test/no-raw-controls.test.ts`
forbids `<button>`, `<select>` and `<input>` outside the atoms that own them, and
forbids inline `CSSProperties` objects in favour of a CSS module beside the
component. The rule was introduced after a sweep removed 42 hand-written buttons,
9 selects and 12 inputs, along with six copies of one style object that had
already drifted — three call sites at 9.5px and three at 10.5px, a divergence
nobody chose.

The escape hatch costs a sentence. Each exempt path carries a written reason —
the file-drop zone holds the only `<input type=file>`, hidden and out of the tab
order; the inline-rename control is uncontrolled by design so Escape means "there
was never an edit". An escape hatch that costs a sentence is one people use
honestly.

**A component never wraps itself in a presentation.** The caller decides whether
something is an object with verbs. A component that presents itself cannot be
reused inside another presentation without nesting two.

**Only token names, never hex values.** `ui/test/tokens-used.test.ts` fails on a
reference to a CSS custom property that does not exist, which turns a typo in a
token name from a silently-unstyled element into a test failure.

**Stories are exempt from the graph, deliberately.** A story is a review surface,
not shipped code — nothing under `.storybook/` reaches the bundle that
`pkg/webui` embeds — and its job is to compose whatever demonstrates the
component, which routinely means reaching across layers so that the thing
demonstrated is the *real* one rather than a second copy.

## Adding a layer

Adding a directory under `ui/src/` that is not in the allow-list makes the test
fail, which is the intended prompt: state what the new layer may import and why,
in the table itself. The table is the documentation. A layer whose permissions
cannot be written down in one sentence is a layer that has not been thought
through.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| `layers.test.ts` fails naming an import | A file reached across the graph | Move the shared piece down a layer, or invert the dependency |
| A cycle appears after moving a file | Two layers now name each other | Extract the contract into a lower layer, as `appkit` was extracted from `apps` |
| An engine test suddenly needs a DOM | Something under `model/` imported React or a browser API | Keep `model` pure; put the React part in `foundation` or above |
| `no-raw-controls.test.ts` fails on a new panel | A hand-written `<button>` or inline style object | Use `Button`/`IconButton` and a CSS module — or add an exemption with its reason |
| An element renders unstyled | A CSS custom property name was mistyped | `tokens-used.test.ts` names it; fix the token or define it |
| An organism cannot be storied without a store | It is doing an application's job | Move the hooks up into the application and pass DTOs down |

## See Also

- `datadrop help web-ui-presentation-protocol` — why descriptors hold no components
- `datadrop help web-ui-window-manager` — why the registry sits in `appkit/`
- `datadrop help web-ui-object-model` — what `store` and `model` each own
