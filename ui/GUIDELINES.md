# UI guidelines

Read this before adding or changing anything under `ui/src/components`, and
before adding UI to any application.

Nothing here is new policy. It is the policy that already existed — spread
across a design guide, a comment in a test and a comment in a CSS file — in one
place, with the review checklist that makes it usable during a review. Every
rule names the test that enforces it, or says plainly that nothing does.

***

## 1. Non-negotiable rules

1. **There is no CSS framework, and there will not be one** (DR-13). The whole
   visual language is `src/styles/tokens.css`, 137 lines. A component that wants
   12.5px text has to justify it in review, because there is no token for it.
2. **The layer graph is one-way and it is enforced.** `test/layers.test.ts`
   walks every import in `src/` and fails with the offending specifier named.
   §2 has the table.
3. **A component without a story is a component nobody has ever seen.**
   `test/stories.test.ts` fails if a component directory has no
   `Component.stories.tsx`.
4. **Form controls come from `components/atoms`.** No hand-written `<button>`,
   `<select>` or `<input>` outside them. `test/no-raw-controls.test.ts` enforces
   it and carries an allowlist where a raw element is genuinely right; each
   entry states why in a sentence.
5. **Meaning is never carried by colour alone.** Every state must survive a
   greyscale screenshot. WCAG 1.4.1 is the formal version;
   `Chip.module.css`'s `.stale` rule is the one that named it here.
6. **Components below `organisms` do not fetch.** `molecules` may not import
   `api` (enforced); nothing below `apps` may call `fetch` (not enforced —
   watch for it in review).
7. **No new styling API.** No generic `Box`, no component taking `padding`,
   `gap`, `color`, `fontSize` and `display` as an unbounded surface. `Stack`
   takes `gap` from the six-step scale; that is a bounded recipe, not a style
   prop.
8. **A component's props are grounded in call sites.** `TextInput` has four
   widths because four call sites asked for four widths. Inventing a
   small/medium/large scale nothing uses is how a component becomes a styling
   API.

## 2. Which layer

The graph, as `test/layers.test.ts` declares it:

| Layer | May import |
|---|---|
| `model` | nothing at all, not even React |
| `api`, `export` | `model` |
| `pbui` | `model`, `foundation` |
| `store` | `model`, `api`, `pbui` |
| `appkit` | `model`, `pbui`, `store` |
| `foundation` | nothing |
| `layout` | `foundation` |
| `atoms` | `foundation`, `layout`, `pbui`, `model` |
| `molecules` | the above, plus `atoms`, `store` |
| `organisms` | the above, plus `molecules`, `api`, `appkit` |
| `apps` | the above, plus `organisms` — **never** `pages` |
| `pages` | everything |

When you are holding a piece of JSX and do not know where it goes, apply these
in order. The first that answers, wins.

1. **Does it fetch or mutate?** Then it is an organism, or it stays in the
   application. (`molecules` may read the store; it may not import `api`.)
2. **Does it name a domain noun** — "upload item", "token", "member", "pipeline
   step"? Then molecule or organism, never layout.
3. **Does it answer "where do regions go?"** Then layout, and it must not know
   any domain noun.
4. **Is it a single control or marker with no composition?** Then an atom.
5. **Does it take a DTO and callbacks and render a whole feature?** Then an
   organism.

Three facts about the graph that are easy to get wrong:

- **`model` imports nothing, including React.** This is what lets `bun test`
  exercise the entire grammar of graphics with no DOM, in milliseconds.
- **`pbui` may not import `atoms`.** A descriptor holds no React. The chip that
  *draws* a presentation lives in `atoms`, and so does the type-to-chip mapping;
  putting a component in a descriptor would close a cycle.
- **`appkit` holds the application contract, not applications.** It is its own
  layer specifically so `organisms` can resolve an app id without importing
  `apps` — which is what makes `apps -> organisms` safe (DR-33).

## 3. Storybook

### Title prefixes

```text
Design System/Foundation/<Primitive>
Design System/Layout/<Primitive>
Design System/Atoms/<Atom>
Design System/PBUI/<Name>
Component Library/Molecules/<Component>
Component Library/Organisms/<Component>
Applications/<Page>
```

The sidebar then reads as the dependency order, so it is a map of the
architecture rather than an alphabetical list. `test/stories.test.ts` enforces
the prefix.

**The title must be a string literal in the meta.** The test parses it with a
regular expression rather than importing the module — importing a story pulls in
React, the CSS modules and the whole component tree, which turns a 30 ms test
into a bundling exercise. A computed title will fail confusingly.

### Required states

| Layer | Stories |
|---|---|
| foundation | every variant of every enumerated prop, on one page |
| atoms | default, each variant, `disabled`, each `data-state` it supports |
| layout | default, dense, overflow, nested where composable |
| molecules | populated, **empty**, overflow/truncated, error, each interaction state |
| organisms | populated, empty, **the awkward mode**, loading, error |

**"The awkward mode"** is the state that is expensive to reach by clicking and
cheap to render as a story. It is mandatory, and it is where the return on this
whole apparatus is: DATADROP-5 shipped three UI defects found only by opening a
browser, and each one was a state needing a particular *server* to reach —
token-mode authentication, a root credential, an admin membership. Each is two
lines of props.

### Stories for invisible and structural components

Demonstrate the **invariant**, not the appearance. Four worked examples in the
tree:

- `VisuallyHidden` → two adjacent lines with a whole announced sentence between
  them. The point is that they are adjacent.
- `Toolbar` → a 90px frame holding 300px of content. The point is that the
  toolbar does not shrink.
- `KeyValueList` → a 220px box with a sha256 digest in it. The point is that the
  box stays 220px.
- `Legend` → the empty case renders *nothing*, and the prose says so.

### What not to story

Not one story per data permutation. Three tokens, four tokens and five tokens
are the same story. **A state is worth a story if a reviewer could look at it
and say "that is wrong".** A row count cannot be wrong; an empty list with no
message can.

## 4. Tokens

- **Never hand-edit the generated palette.** `--pbui-cat-1` … `--pbui-cat-8` are
  written by `bun run tokens` from `PALETTE` in `model/plot.ts`, between the
  `BEGIN/END GENERATED PALETTE` markers. `test/tokens.test.ts` proves the two
  still agree. A legend that disagrees with its marks is a bug that survives
  review, because both halves look right in isolation.
- **Two contrast thresholds, both tested.** Text colours clear 4.5:1 on
  `--pbui-pane` *and* `--pbui-pane-alt`. A chip's 4px tone edge is a non-text
  graphic and clears 3:1. A disabled control clears 3:1 — it recedes, but "you
  may not press this" is information and is useless if the label is unreadable.
- **The type scale is closed**: micro 8.5, tiny 9.5, small 10.5, base 11.5,
  title 13. If a role is missing, add the role deliberately and document it.

## 5. CSS modules

Allowed: component layout anatomy, state selectors, overflow behaviour, borders
and backgrounds built from tokens.

Not allowed: raw colours where a token exists, font literals, global selectors,
utility classes, domain layout that should be a layout primitive.

Inline styles remain legal for exactly three things:

1. dynamic geometry (an SVG bar's width, a split's flex ratio),
2. CSS variable plumbing,
3. a tone passed as a variable reference (`Chip`'s `borderLeftColor`,
   `Button`'s `raised` fill).

Everything else moves to the module. `const btn: React.CSSProperties` is banned
by `test/no-raw-controls.test.ts` — six copies of one such object had already
drifted into two different font sizes before anyone noticed.

## 6. Presentations

- **A component never wraps itself in `Presentation`** (DR-38). The caller
  decides whether a row is live. A component that wraps itself needs a
  `PbuiProvider` in every story and can no longer be rendered in isolation,
  which is the property the whole design system is buying.
  - The exception is the `*Chip` atoms, which are presentations by construction.
    `Chip` itself is not, which is why its story needs no provider.
  - When the contents genuinely are live in the application, take a **render
    prop**: the default draws a plain chip, the application passes a wrapper.
    Five components do this — `Legend`, `MemberRow`, `ChannelRow`,
    `UploadQueueList`, `ProfilePanel`.
- **`PARTS` stays small** (DR-34). It is a public styling API: a theme targets
  it, and renaming an entry breaks that theme silently. Add a `data-part` only
  when something *outside* the component needs the name. Otherwise use
  `data-testid`, which is not a promise and can be renamed freely.
- **Never put a secret in a presentation value.** A presentation value flows
  into the inspector, the watchlist and the trace. `TokenRef` has no secret
  field and that absence is load-bearing (DR-28).

## 7. Component folder layout

```text
components/<layer>/<Name>/
  <Name>.tsx            required
  <Name>.stories.tsx    required — test/stories.test.ts enforces it
  index.ts              required — named re-exports, not `export *`
  <Name>.module.css     optional: several atoms are pure composition
  <Name>.logic.ts       when the extraction reveals a pure function
```

Named re-exports rather than `export *`, so the layer barrel reads as an
inventory and a component cannot leak an internal helper by accident.

**When an extraction reveals a pure function, it goes in a `.logic.ts` beside
the component and is tested directly.** `apps/UploadApp/upload.ts` is the model:
a state machine with no DOM, no server and no file picker, tested in
milliseconds.

## 8. Review checklist

```markdown
- [ ] Correct layer, by the five questions in §2.
- [ ] No `api` import below `organisms`; no bare `fetch` below `apps`.
- [ ] Typography via `Text` / `SectionLabel` / `CodeText`, not a font literal.
- [ ] Colours, borders and surfaces from tokens.
- [ ] CSS module owns local anatomy only; no utility classes.
- [ ] Folder has Component.tsx, index.ts, Component.stories.tsx.
- [ ] Story title is a literal, with the layer's prefix.
- [ ] Every state in §3 has a story, including the empty one and the awkward one.
- [ ] No state distinguished by colour alone.
- [ ] The component does not wrap itself in `Presentation`.
- [ ] No secret in a presentation value.
- [ ] Props grounded in call sites, not invented for symmetry.
- [ ] `bun run --cwd=ui typecheck` and `bun test --cwd ui` pass.
```

Note `--cwd=ui` with the equals sign. `bun run --cwd ui typecheck` prints bun's
usage page and **exits 0 without running anything**, which is why the `ui-test`
target once went weeks without typechecking.

## 9. What the tests actually guarantee

| Test | Guarantees |
|---|---|
| `layers.test.ts` | the import graph is one-way; `model` is pure; every source directory is in the graph |
| `stories.test.ts` | every component has a story, a barrel and the right title prefix |
| `no-raw-controls.test.ts` | no hand-written controls outside the atoms, and the allowlist is not stale |
| `tokens.test.ts` | the generated palette matches `model/plot.ts`; both contrast thresholds hold |
| `api-surface.test.ts` | the set of mutating endpoints is exactly the reviewed set |

Nothing tests that a component *looks* right. That is what Storybook and a
reviewer are for.

## 10. Key references

- `src/styles/tokens.css` — the whole visual language
- `src/components/atoms/Chip/` — 80 lines demonstrating every convention here
- `src/pbui/registry.ts` — descriptors, and why they hold no React
- `src/pbui/parts.ts` — the `data-part` contract and its size policy
- `.storybook/main.ts`, `decorators.tsx`, `withPbui.tsx`
- `ttmp/2026/07/25/DATADROP-6…/design/01-…-guide.md` — the reasoning behind all
  of the above, with decision records DR-32 to DR-39
