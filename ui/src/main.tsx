import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/scrollbars.css";

import { makeStore, type AppStore } from "./store";
import { load, WORKBENCH_KEY } from "./store/persist";
import { Workbench } from "./components/pages/Workbench";
import { LandingPage } from "./components/pages/LandingPage";

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
 * is what makes six of them on one tour page possible.
 *
 * `persistKey` is passed explicitly rather than defaulted, and the asymmetry is
 * deliberate: the shell defaults to persisting *nothing*, so an embedded
 * instance that forgets to opt out is inert rather than destructive.
 */

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from the page shell");

/**
 * One bundle, two pages, chosen by path.
 *
 * `/ui/tour` is the tour; everything else is the workbench. A second Vite entry
 * would double the build output that `pkg/webui/dist` embeds and that `go:embed`
 * carries into the binary, and would save almost nothing — the two pages share
 * the entire component tree, and the only landing-page-only payload is the
 * lesson prose. If the bundle ever becomes a problem the split to make is a
 * lazy `import()` of `tour/`, not a second entry.
 *
 * No server change is needed: `pkg/webui` already mounts the SPA at `/ui/` with
 * a fallback to index.html for any path beneath it.
 *
 * The `/` → `/ui/` redirect is deliberately left alone. Whether the tour should
 * become the front door is a product decision, and this ticket does not make it.
 */
const isTour = window.location.pathname.startsWith("/ui/tour");

createRoot(container).render(<StrictMode>{isTour ? <LandingPage /> : <Product />}</StrictMode>);

/**
 * The workbench, with the one store the product has.
 *
 * Built inside a component rather than at module scope so that the tour never
 * constructs it — a landing page has no business restoring a workbench layout
 * from localStorage, and doing it eagerly would mean it happened on every visit
 * to the tour whether or not anything used the result.
 *
 * A ref with a null check, exactly as `WorkbenchInstance` does and for the same
 * reason: this is a render body, so a bare `makeStore()` would build a new
 * store on every render, and StrictMode double-invokes the first one. The
 * symptom would be a workbench that resets itself at random.
 */
function Product() {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    const restored = load(WORKBENCH_KEY);
    storeRef.current = makeStore({
      preloaded: restored ? { world: restored.world, layout: restored.layout } : undefined,
    });
  }
  return (
    <Provider store={storeRef.current}>
      <Workbench persistKey={WORKBENCH_KEY} />
    </Provider>
  );
}
