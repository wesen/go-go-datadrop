import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "../api/client";
import type { FixtureData } from "../api/fixtures";
import { browserClipboard, noClipboard, type ClipboardPort } from "./clipboard";
import { layoutSlice, type LayoutState } from "./layout";
import { worldSlice, initialWorld, type WorldState } from "./world";
import { defaultLayout } from "./stages";

/**
 * The store, as a factory and only as a factory.
 *
 * Phase 0 wired only the RTK Query cache. Phase 2 added the `world` slice
 * (documents, snapshots, pins, watchlist, trace) and the `layout` slice
 * (workspaces and split trees) beside it — see the DATADROP-4 guide §7.
 *
 * The division of labour between the two is deliberate and is the reason they
 * are separate slices: RTK Query owns anything the server said, keyed by the
 * request that asked; the world owns anything the user decided. Two documents
 * pointed at one source therefore share one cache entry and one request, for
 * free, while keeping entirely independent specifications.
 *
 * Everything in the world slices must be JSON-serialisable (guide §7.5). The
 * pending-accept resolver is the canonical thing that is not, and it lives in a
 * React ref inside PbuiProvider rather than here.
 *
 * **This module exports no constructed store** (DATADROP-7 DR-46), and the
 * absence is the point. It used to export one, restored from localStorage at
 * module load, and exactly one file imported it. That was harmless right up
 * until the landing page needed five workbenches on one page, at which point a
 * single ambient store is not a convenience but a defect — five instances
 * sharing one world, one layout and one persistence key. Removing the export
 * makes the wrong import *unavailable* rather than merely discouraged, which is
 * the only kind of discouragement that survives contact with a hurry.
 *
 * `main.tsx` constructs the application's store. `test/store.test.ts` asserts
 * that nothing else can.
 */

/**
 * A partial of a real state shape.
 *
 * Typing it as an arbitrary record forces configureStore to infer the reducer
 * from the preloaded value, producing a store whose type no longer matches its
 * own reducer — which is why phase 0 left the parameter out until the slices
 * existed to be partial *of*.
 */
export interface PreloadedState {
  world?: Partial<WorldState>;
  layout?: LayoutState;
}

export interface MakeStoreOptions {
  /** Restored state, or a seed for a story or an embedded instance. */
  preloaded?: PreloadedState;
  /**
   * Tables served from memory instead of from the server (DR-48).
   *
   * Travels on the thunk extra argument, which RTK Query hands to every base
   * query — so its scope is exactly this store's scope, and no call site above
   * `fixtureBaseQuery` knows it exists. A store with fixtures never touches the
   * network at all, which is what lets a landing page render charts with the
   * API absent, 500ing, or demanding an account.
   */
  fixtures?: FixtureData;
  /**
   * Give a world with no documents one.
   *
   * The four document-bound applications are views OF a composition; with no
   * document they have nothing to be views of, and every one of them shows "no
   * documents" with no way forward. The prototype seeds two on construction
   * (pbui-gog.jsx:697-702) for the same reason.
   *
   * One, not two: the second exists in the prototype to demonstrate the
   * multi-chart story, which the `charts` workspace covers instead.
   *
   * This used to live beside the module-level store as three lines of
   * `if (getState()…) dispatch(…)`. That made it a property of *the* store
   * rather than of *a* store — so a Storybook story, which builds its own,
   * silently got a workbench with nothing in it. Defaulting to true here fixes
   * both at once.
   */
  seed?: boolean;
  /**
   * Where "copy this to the clipboard" goes (DATADROP-8 DR-66).
   *
   * Rides the thunk extra argument beside `fixtures`, for the same three
   * reasons: it is per store, no call site above the thunk knows it exists, and
   * it makes the whole export path testable with no DOM — a test passes a fake
   * that records what it was given.
   *
   * Defaults to the browser's when one is available and to a port that refuses
   * both ways when it is not, so a store built in `bun test` never touches
   * `navigator` and an export in that store reports that the copy did not
   * happen rather than silently succeeding into nowhere.
   */
  clipboard?: ClipboardPort;
}

/** The shape every thunk in this store receives as its third argument. */
export interface ThunkExtra {
  fixtures?: FixtureData;
  clipboard: ClipboardPort;
}

export function makeStore(options: MakeStoreOptions = {}) {
  const { preloaded, seed = true, fixtures } = options;
  const clipboard =
    options.clipboard ??
    (typeof navigator === "undefined" || !navigator.clipboard ? noClipboard : browserClipboard);

  // Both slices are always supplied, never conditionally spread. A preloaded
  // object whose `layout` key is sometimes absent makes configureStore infer
  // that the layout reducer must accept `undefined`, and the resulting store
  // type stops matching its own reducer. Same trap as phase 0's, one level in.
  //
  // **Always supplied, even with no `preloaded` at all**, which used to leave
  // `preloadedState` undefined and fall through to the slices' own initial
  // state. Two problems, both of which only show up with more than one store:
  //
  //  - `layoutSlice`'s `initialState: initialLayout()` is evaluated ONCE, at
  //    module load, so every store built without a preload started with the
  //    same workspace *id*. Harmless while there is one store and confusing the
  //    moment there are five.
  //  - The fallback layout was one launcher tile rather than `defaultLayout()`,
  //    so the shell's own Storybook story rendered an empty workbench. The
  //    story was showing the fallback, not the product.
  const preloadedState = {
    world: { ...initialWorld, ...preloaded?.world },
    layout: preloaded?.layout ?? defaultLayout(),
  };

  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      world: worldSlice.reducer,
      layout: layoutSlice.reducer,
    },
    middleware: (getDefault) =>
      // The fixture map rides the thunk extra argument, which is the only
      // per-store channel RTK Query's base query can read (DR-48).
      getDefault({ thunk: { extraArgument: { fixtures, clipboard } satisfies ThunkExtra } }).concat(
        api.middleware,
      ),
    preloadedState,
  });

  if (seed && store.getState().world.docOrder.length === 0) {
    store.dispatch(worldSlice.actions.newDoc(null));
  }

  // Refetch on focus and reconnect — a workbench left open overnight should not
  // show yesterday's catalogue.
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

/**
 * A thunk this store can dispatch.
 *
 * Written out rather than taken from `AppDispatch`, because `actionsForVerb`
 * has to *name* the type it may return without importing the store it will be
 * dispatched into — `store/effects.ts` is imported by `store/applyVerb.ts`,
 * which is imported by the component that owns the store.
 */
export type AppThunk<R = void> = (
  dispatch: AppDispatch,
  getState: () => RootState,
  extra: ThunkExtra,
) => R;
