import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/scrollbars.css";

import { makeStore } from "./store";
import { load, WORKBENCH_KEY } from "./store/persist";
import { Workbench } from "./components/pages/Workbench";

/**
 * The entry point.
 *
 * Phase 3 ended the interval that began when the old shell was demolished
 * (DR-17): there is an application here again, and it is the tiled workbench.
 *
 * **This file constructs the only store the product has** (DATADROP-7 DR-46).
 * It used to import one that `store/index.ts` had already built at module load,
 * restoring from localStorage as a side effect of being imported. Moving those
 * three lines here is what makes `makeStore` the only way to get a store, which
 * is what makes five of them on one page possible.
 *
 * `persistKey` is passed explicitly rather than defaulted, and the asymmetry is
 * deliberate: the shell defaults to persisting *nothing*, so an embedded
 * instance that forgets to opt out is inert rather than destructive.
 */

const restored = load(WORKBENCH_KEY);

const store = makeStore({
  preloaded: restored ? { world: restored.world, layout: restored.layout } : undefined,
});

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from the page shell");

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <Workbench persistKey={WORKBENCH_KEY} />
    </Provider>
  </StrictMode>,
);
