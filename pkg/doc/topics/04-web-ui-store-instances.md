---
Title: "The store as an instance boundary — factories, per-store channels and scoped persistence"
Slug: web-ui-store-instances
Short: "Why the browser workbench builds its Redux store through a factory and exports no instance, how per-store configuration reaches code that cannot take a prop, and what makes several independent workbenches on one page safe."
Topics:
- web-ui
- architecture
- frontend
- embedding
Commands:
- serve
IsTopLevel: false
IsTemplate: false
ShowPerDefault: false
SectionType: GeneralTopic
---

`ui/src/store/index.ts` exports `makeStore()` and no constructed store. The
absence is the point of this page. It used to export one, restored from
`localStorage` at module load, and exactly one file imported it — which was
harmless right up until a page needed more than one workbench, at which point a
single ambient store stops being a convenience and becomes a defect: several
instances sharing one world, one layout and one persistence key.

The general rule this establishes is worth stating on its own, because it
applies well beyond this store:

> Make the wrong thing *unavailable* rather than merely discouraged. That is the
> only kind of discouragement that survives contact with a hurry.

## The instance boundary

An **instance** is one store and the React tree beneath its `Provider`.
Everything an instance owns is either in that store or in React context below it.
Nothing instance-scoped may live in a module-level variable.

That definition is what makes the boundary checkable rather than aspirational.
Anything reachable without going through the `Provider` is shared, and shared is
usually wrong.

## What a module-level singleton costs

Every one of the following was a real module-level value, and each has a specific
failure mode once a second instance exists:

| Singleton | Failure with several instances |
|---|---|
| A constructed store | Every instance shares one world and one layout |
| A fixed persistence key | Each instance runs the same debounced write against one key; the last to fire wins, silently overwriting the user's real layout |
| `height: 100vh` on the shell | Five panels, each a viewport tall, down a scrolling page |
| A URL parameter read | Instances race to consume one parameter and rewrite one URL; exactly one wins |
| A session query at mount | *N* identical requests, and *N* panels forcing themselves to a sign-in screen for a visitor who is anonymous by definition |
| A document seeded outside the factory | A store built anywhere else opens empty, with every document-bound tile showing "no documents" |

Note the pattern in rows four and five: those are *application* concerns —
routing, authentication, session — that ended up in the shell because there was
only ever one shell. Separating the shell from the application is therefore not a
new abstraction; it is the separation those lines were always implying.

## The factory

```ts
export function makeStore(options: MakeStoreOptions = {}) {
  const { preloaded, seed = true, fixtures } = options;

  const preloadedState = {
    world:  { ...initialWorld, ...preloaded?.world },
    layout: preloaded?.layout ?? defaultSpaces(),
  };

  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, world: worldSlice.reducer, layout: layoutSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ thunk: { extraArgument: { fixtures } } }).concat(api.middleware),
    preloadedState,
  });

  if (seed && store.getState().world.docOrder.length === 0) {
    store.dispatch(worldSlice.actions.newDoc(null));
  }

  setupListeners(store.dispatch);
  return store;
}
```

Three details are not obvious and all three were bugs first.

**Both slices are always supplied, never conditionally spread.** A preloaded
object whose `layout` key is sometimes absent makes `configureStore` infer that
the layout reducer must accept `undefined`, and the resulting store type stops
matching its own reducer.

**preloadedState is supplied even with no preload at all.** Falling through to
the slices' own initial state has two problems that only appear with more than
one store. `layoutSlice`'s `initialState: initialLayout()` is evaluated **once**,
at module load, so every store built without a preload started life with the same
workspace *id*. And the fallback layout was a single launcher tile rather than
the real default workspaces, so a Storybook story rendering the shell was
demonstrating the fallback rather than the product.

**Seeding a document belongs in the factory.** It is a property of *a* store, not
of *the* store. Three lines of `if (getState()…) dispatch(…)` beside a
module-level store meant every other store — a story's, an embedded panel's —
silently got a workbench with nothing in it.

## Per-store channels: the thunk extra argument

Some code cannot take a prop. An RTK Query `baseQuery` is constructed once when
the API slice is defined, and it runs inside middleware; there is no call site
above it to thread configuration through. But it must still be able to differ per
store — one instance answering from committed fixtures, another going to the
network.

The thunk extra argument is the only per-store channel such code can read:

```ts
getDefault({ thunk: { extraArgument: { fixtures } } })
```

`ui/src/api/fixtureBaseQuery.ts` wraps the real transport, reads the fixture map
off that argument, and answers from memory when one is present. Its scope is
exactly this store's scope, and no call site above it knows it exists. A store
built with fixtures never touches the network at all — not "prefers not to",
never — which is what lets a page render real charts with the API absent,
returning 500, or demanding an account.

This is the channel to reach for whenever something store-scoped has to be
visible to code that cannot be given a prop. Injecting a port there rather than
importing a browser global also makes that code testable with no DOM: the test
passes a fake and asserts on what it received.

## Scoped persistence

`usePersistence(key)` writes the world and the layout to `localStorage`, 500 ms
debounced — or does nothing at all when the key is `null`, which is the default.

```ts
export function usePersistence(key: string | null): void {
  const store = useStore<RootState>();
  const world  = useSelector((s: RootState) => s.world);
  const layout = useSelector((s: RootState) => s.layout);

  useEffect(() => {
    if (key === null) return;                    // before the timer, not inside it
    const timer = setTimeout(() => {
      const state = store.getState();            // what is true now, not at schedule time
      save(key, state.world, state.layout);
    }, 500);
    return () => clearTimeout(timer);
  }, [key, world, layout, store]);
}
```

Two details:

**The early return happens before the timer is created.** A memory-only instance
does not merely skip the write; it never schedules anything. Six instances on a
page therefore do not run six 500 ms timers every time the reader touches one of
them.

**The timer reads through the store rather than closing over `world` and
`layout`.** It fires up to 500 ms late and should write what is true then, not
what was true when it was scheduled.

**null is the default, and the default is the argument.** An embedded panel
that forgets to opt out is inert rather than destructive. The application opts
in, in one place, in a file whose job is to know that it is the application.

## What persistence refuses to write

`save()` walks the payload for credential-shaped keys — `token`,
`authorization`, `bearer`, `secret`, `password`, `apikey` and friends — and
**refuses** rather than truncating if it finds one. Losing a layout is an
annoyance; writing a credential to durable storage is not.

That guard is a second net, not the first. The bearer token lives in
`sessionStorage` and nothing else belongs there, and presentation values carry no
secret fields, so there is no path by which a token could reach the payload. The
guard exists because a persisted layout is designed to be shared.

`load()` validates on the way back in and returns the defaults on anything it
does not recognise. A layout written by a previous version, hand-edited, or
truncated by a full quota must produce defaults and a console warning — never a
blank screen.

## Reset is remount

There is no `reset()` and there should not be. To reset an instance, give it a
React `key` and change it: React throws the subtree away and the store goes with
it. A reset that walks state back can leave a fragment behind, and the fragment
is always in the thing you did not think to walk back.

## Building a store in a component

Use a ref with a null check, not `useState`'s lazy initialiser:

```ts
const storeRef = useRef<AppStore | null>(null);
if (!storeRef.current) storeRef.current = makeStore({ … });
```

Both are available on the first render, but StrictMode double-invokes the
initialiser and would construct two stores, discarding one after its middleware
had already started. An effect is worse still — the first render must already
have a store to hand to `Provider`.

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| Two workbenches on a page share documents | Something imported a module-level store | Build one store per instance with `makeStore` |
| A layout is silently overwritten after scrolling past an embedded panel | An embedded instance was given the application's persistence key | Leave `persistKey` at `null` for embedded instances |
| Two stores start with the same workspace id | Preloaded state was omitted, so the module-load `initialLayout()` was shared | Always supply `preloadedState`, as `makeStore` does |
| A story renders an empty workbench | The store was built with `seed: false`, or fell through to the fallback layout | Let `seed` default to true and supply real default workspaces |
| Two stores are constructed on first render | `useState`'s lazy initialiser under StrictMode | Use the ref-with-null-check form |
| An embedded panel hits the network | No fixture map was passed | Pass `fixtures` to `makeStore`; the base query then never falls through |
| A layout fails to restore after an upgrade | The persisted shape changed and `validate` rejected it | Bump the version and migrate; discarding throws away every user's arrangement |

## See Also

- `datadrop help web-ui-embedding-a-workbench` — putting one or more workbenches on a page
- `datadrop help web-ui-object-model` — what the two slices hold
- `datadrop help web-ui-window-manager` — workspaces and the application registry
