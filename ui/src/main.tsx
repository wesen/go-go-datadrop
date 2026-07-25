import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/scrollbars.css";

import { store } from "./store";
import { Workbench } from "./components/pages/Workbench";

/**
 * The entry point.
 *
 * Phase 3 ends the interval that began when the old shell was demolished
 * (DR-17): there is an application here again, and it is the tiled workbench.
 */

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from the page shell");

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <Workbench />
    </Provider>
  </StrictMode>,
);
