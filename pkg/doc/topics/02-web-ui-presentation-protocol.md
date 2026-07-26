---
Title: "The presentation protocol — objects, menus, verbs and accept"
Slug: web-ui-presentation-protocol
Short: "How everything visible in the browser workbench becomes a typed object with a right-click menu, how those menus are built from pure functions, and how a command asks the user to point at something."
Topics:
- web-ui
- pbui
- architecture
- frontend
Commands:
- serve
IsTopLevel: false
IsTemplate: false
ShowPerDefault: false
SectionType: GeneralTopic
---

The browser workbench is built on one idea: everything on screen that means
something is a typed object, and every typed object carries its own verbs. A
column header is not a string, it is a `field`. A mark in a chart is not a
circle, it is a `datum`. Right-click either one and you get the operations that
apply to that kind of thing, resolved against the document it belongs to.

This page describes the machinery that makes that true. It lives entirely in
`ui/src/pbui/`, it knows nothing about charts, and in principle the directory
could be lifted into another application and used to present file paths.

## Presentation types

A presentation type is the type as the *interface* understands it, which is not
always the type the language understands. `{docId, name}` and `{docId, channel}`
are both objects to TypeScript; to the interface one is a field with the verbs
of a field, and the other is a channel with the verbs of a channel. That
distinction is the whole mechanism.

The vocabulary is declared in `ui/src/pbui/types.ts`: `field`, `source`, `doc`,
`step`, `geom`, `channel`, `datum`, `cat`, `chart`, `tile`, `workspace`, and the
account types `user`, `token`, `member`, `upload`. `PresentationValues` maps each
type to the shape its value takes.

Two things about those value shapes carry weight.

**Presentations minted inside a document-bound tile carry their document.**
`FieldRef` is `{docId, name}`, not `name`. Clicking a mark in a tile showing
document β must filter β, not whichever document happens to be active. Where
there genuinely is no owner — a field chip in the source browser — `docId` is
`null`, the verb falls back to the active document, and the menu header names
which one that is. An ambient verb is safe only because you are told where it
will land before you commit.

**A value carries what its menu needs to decide, and nothing more.**
`MemberRef` carries `isOwner` because the menu has to grey out "remove" for the
owner's row. `TokenRef` carries an id, a name, scopes and timestamps — and
deliberately **no secret field**. A presentation value flows into the inspector,
the watchlist, the trace and, through persistence, into `localStorage`. Put the
secret in the value and it reaches all four; leave it out and it structurally
cannot.

## The Presentation component

`ui/src/pbui/Presentation.tsx` is the only component that draws a presentation.
Everything type-specific is resolved through the registry; this component never
learns what a chart is.

```tsx
<Presentation
  ptype="field"
  value={{ docId, name: "data.temp_c" }}
  doc="<field> data.temp_c"
>
  <FieldChip … />
</Presentation>
```

Five behaviours are decisions rather than details:

- **The svg prop renders an SVG group rather than a span.** This is the sharpest edge in
  the file. Inside an `<svg>` the renderer silently discards HTML elements, so a
  `<span>` wrapper means the marks are never drawn — no error, no warning, an
  empty chart.
- **Right-click always opens the menu, even in accept mode.** A user who entered
  accept mode by mistake must still be able to interrogate what they are
  pointing at without committing to it.
- **In accept mode the left button satisfies rather than activates.** A source
  chip whose default verb is "load this" must not load anything while a command
  is waiting for it. The mouse-doc line announces the change before the user
  commits.
- **Left-click with no default verb opens the menu too.** Otherwise chips
  without an obvious primary action are dead to the left hand, and users never
  discover the right button.
- **Both handlers call stopPropagation.** Presentations nest — a `datum`
  inside a `tile` inside a `workspace` — and without it the outermost one wins,
  which is exactly backwards. The most specific presentation is the innermost.

Every presentation is focusable, has `role="button"`, and responds to Enter,
Space, the ContextMenu key and Shift+F10. The interface is reachable without a
mouse.

## Descriptors: menus as pure functions

One file per presentation type in `ui/src/pbui/descriptors/`, registered in
`ui/src/pbui/registry.ts`:

```ts
interface PresentationDescriptor<V> {
  ptype: PresentationType;
  label(value: V, env: PbuiEnvironment): string;      // menu headers, mouse-doc, trace
  describe(value: V, env: PbuiEnvironment): unknown;  // the inspector; JSON-serialisable
  actions(value: V, env: PbuiEnvironment): Action[];  // the menu, likeliest first
  tone: string;                                       // a token name, never a hex value
}
```

A descriptor holds no React. The chip that *draws* a presentation lives in
`ui/src/components/atoms/`, and the mapping from type to chip lives there too,
because `pbui` may not import components — see
`datadrop help web-ui-component-layers`.

`PbuiEnvironment` is deliberately narrow: a table lookup, the active document
id, a name lookup and per-document type overrides. A descriptor resolves a
presentation against the tables and documents currently loaded; it does not
reach into the store. That narrowness is what lets `actions` be tested with a
literal object, no Provider and no DOM.

## Verbs are data, not closures

An `Action` pairs a label with a **verb**, and a verb is a plain serialisable
object:

```ts
{ kind: "addFilter", docId: "…", field: "data.temp_c", op: ">", value: "20" }
```

This is better than a closure over `dispatch` in two ways that matter.

First, `actions(value, env)` becomes a pure function returning serialisable
values, so a test can assert the exact verb a menu entry produces — that
right-clicking a mark in a tile showing document β yields
`{kind: "addFilter", docId: "β", …}` — with no store, no Provider and no DOM. A
closure can only be tested by running it and observing a mock.

Second, it creates a seam. `ui/src/store/applyVerb.ts` is the only place that
maps a verb onto reducers. Adding a verb means adding one case there rather than
threading a dispatch through fourteen descriptors, and nothing in `pbui/` had to
change between the phase where verbs were merely displayed and the phase where
they were dispatched.

Verbs carrying `docId: null` are resolved at *application* time, not at
menu-build time. The active document can change while a menu is open.

## Unavailable verbs are shown, not hidden

`Action.disabledBecause` renders the entry greyed with the reason beside it.

> Hiding an unavailable verb hides the rule that makes it unavailable: a user
> who never sees "Map to y" on a nominal column never learns that y requires a
> quantitative one.

This principle recurs throughout the interface, and it is the reason menus are
longer than they strictly need to be.

## The accept protocol

Accept is how a command asks the user to point at an object. Press the target
control beside the y channel, and every field chip in every tile that would be
valid for y lights up; click one and the command continues.

```
User          Encoding tile      PbuiProvider        Table tile (3 tiles away)
 │  click ⌖         │                  │                       │
 │─────────────────>│  accept({ptype:"field", filter}) ────────>│
 │                  │                  │  set accepting state  │
 │                  │                  │  stash resolver in a ref
 │<──── red banner across the top ─────│                       │
 │                  │        every matching chip gains data-state="acceptable"
 │  click a chip ───────────────────────────────────────────────>│
 │                  │                  │<── satisfyAccept(ptype, value)
 │                  │<─ promise resolves                        │
 │                  │  dispatch(setMapping(docId,"y",field))    │
```

Six implementation notes, each of which is a decision you would otherwise get
wrong:

- **The resolver lives in a ref, never in the store.** It is a function, and
  Redux state must be serialisable. The ref sits beside a `useState` flag so
  presentations still re-render into their acceptable appearance.
- **filter is what makes accept typed rather than merely kinded.** Passing
  `CHANNEL_ACCEPTS` means a nominal chip never becomes clickable for y, so the
  invalid state is unreachable rather than reported afterwards by the plot
  engine.
- **Escape aborts and resolves null.** Every caller must handle `null`. A
  command that ignores the abort applies a change the user cancelled.
- **Accept is modal but not blocking.** The rest of the interface stays live:
  you can switch workspace mid-accept and click a chip there. That is how you
  map a field from a source you are not currently looking at.
- **Nested accepts are refused, not queued.** A second `accept()` while one is
  pending resolves `null` immediately. Two pending resolvers and one click is a
  bug that is no fun to find, and a command that silently replaced another's
  request would apply the wrong argument to the wrong command.
- **Conversions are a fixed table, not a mechanism.** Clicking a `cat` can
  satisfy a request for a `field`, because a category knows its field. Two
  hard-coded entries in `ui/src/pbui/conversions.ts` cover the cases that arise.
  A general translator that can fire implicitly is hard to explain and harder to
  debug.

## The mouse documentation line

A strip at the bottom, always present, naming the object under the pointer and
what each button will do:

```
<field> data.temp_c   —   L: ACCEPT   R: menu        4 tiles · 12 workspaces · 1 documents
```

The text is composed from the presentation's `doc` prop plus what the buttons
currently mean, so a type gets consistent phrasing everywhere without every call
site restating it. It also updates on focus, not only on hover, so the keyboard
path carries the same information.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| A chart renders with no marks and no error | A `Presentation` inside `<svg>` without `svg` set, so the `<span>` was discarded | Pass `svg` on every presentation minted inside the plot |
| Right-clicking says "no verbs for this object yet" | The presentation type has no entry in `DESCRIPTORS` | Add a descriptor file and register it in `ui/src/pbui/registry.ts` |
| A verb lands on the wrong document | The presentation value was minted without its `docId` | Carry `docId` on every presentation created inside a document-bound tile |
| Clicking a nested object triggers the outer one | A wrapper swallowed the event before `stopPropagation` | Check that no ancestor handles click without stopping propagation |
| Accept mode never ends | A caller ignored the `null` result, or a resolver was left in the ref after unmount | Handle `null` at every call site; the provider clears the ref on settle |
| A second accept does nothing | Nested accepts are refused by design | Finish or abort the first request; do not queue |
| A token secret appeared in the inspector | A secret was placed on a presentation value | Presentation values carry ids and metadata only; keep the secret in component state |

## See Also

- `datadrop help web-ui-object-model` — what state the verbs act on
- `datadrop help web-ui-window-manager` — the tiles presentations are minted inside
- `datadrop help web-ui-component-layers` — why descriptors may not hold components
