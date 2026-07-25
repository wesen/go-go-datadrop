import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "../api/client";
import { layoutSlice, initialLayout, type LayoutState } from "./layout";
import { worldSlice, initialWorld, type WorldState } from "./world";
import { load } from "./persist";

/**
 * The store.
 *
 * Phase 0 wires only the RTK Query cache. Phase 2 adds the `world` slice
 * (documents, snapshots, pins, watchlist, trace) and the `layout` slice
 * (workspaces and split trees) beside it — see guide §7.
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
 */

/**
 * Build a store.
 *
 * A factory rather than a singleton because Storybook needs one per story: a
 * shared store would let a `play` function in one story leave state behind for
 * the next, and an intermittently-failing story is worse than no story.
 *
 * `preloadedState` is a partial of a real state shape. Typing it as an
 * arbitrary record forces configureStore to infer the reducer from the
 * preloaded value, producing a store whose type no longer matches its own
 * reducer — which is why phase 0 left the parameter out until the slices
 * existed to be partial *of*.
 */
export interface PreloadedState {
  world?: Partial<WorldState>;
  layout?: LayoutState;
}

export function makeStore(preloaded?: PreloadedState) {
  // Both slices are always supplied, never conditionally spread. A preloaded
  // object whose `layout` key is sometimes absent makes configureStore infer
  // that the layout reducer must accept `undefined`, and the resulting store
  // type stops matching its own reducer. Same trap as phase 0's, one level in.
  const preloadedState = preloaded
    ? {
        world: { ...initialWorld, ...preloaded.world },
        layout: preloaded.layout ?? initialLayout(),
      }
    : undefined;

  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      world: worldSlice.reducer,
      layout: layoutSlice.reducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
    preloadedState,
  });

  // Refetch on focus and reconnect — a workbench left open overnight should not
  // show yesterday's catalogue.
  setupListeners(store.dispatch);
  return store;
}

/**
 * The application store, restored from localStorage when a valid payload is
 * there. `load()` returns null on anything it cannot read, so a payload from a
 * previous version produces the defaults rather than a blank screen.
 */
const restored = typeof window === "undefined" ? null : load();
export const store = makeStore(
  restored ? { world: restored.world, layout: restored.layout } : undefined,
);

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
