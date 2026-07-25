import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "../api/client";

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
 * No `preloadedState` parameter yet. Typing it as a partial of a state shape
 * that does not exist forces `configureStore` to infer the reducer from the
 * preloaded value, which produces a store whose type no longer matches its own
 * reducer. Phase 2 adds the parameter once `world` and `layout` give it a shape
 * to be partial *of*.
 */
export function makeStore() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

  // Refetch on focus and reconnect — a workbench left open overnight should not
  // show yesterday's catalogue.
  setupListeners(store.dispatch);
  return store;
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
