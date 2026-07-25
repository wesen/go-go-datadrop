import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/scrollbars.css";

import { store } from "./store";
import { UnderConstruction } from "./components/pages/UnderConstruction";

/**
 * The entry point.
 *
 * Between phase 0 and phase 3 there is no application here: the old shell was
 * demolished (DR-17) and the new one is assembled in phase 3. This renders an
 * honest placeholder rather than a blank page, so that anyone who runs the dev
 * server during the interval learns where the work stands instead of debugging
 * an empty #root.
 *
 * The binary keeps serving the DATADROP-3 UI throughout, because pkg/webui
 * embeds a *committed* dist that this build has not touched. Which is why the
 * one rule during the interval is: do not run `make ui`.
 */

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from the page shell");

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <UnderConstruction />
    </Provider>
  </StrictMode>,
);
