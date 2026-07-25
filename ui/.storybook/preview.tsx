import type { Preview } from "@storybook/react-vite";

// The whole foundation, in dependency order. There is no CSS framework to
// import ahead of them (DR-13).
import "../src/styles/reset.css";
import "../src/styles/tokens.css";
import "../src/styles/scrollbars.css";

import { withStore, withTile } from "./decorators";

const preview: Preview = {
  decorators: [withStore, withTile],
  parameters: {
    controls: { expanded: true },
    // Violations fail rather than warn, from the first phase. A contrast
    // problem in the token sheet is a five-minute fix on day one and a
    // sixty-story repaint in month three (DR-16).
    //
    // `region` is disabled because it is an artifact of the harness rather than
    // a property of the component: it requires all content to sit inside a
    // landmark, and a story renders a fragment with no page shell around it.
    // Landmarks are a real requirement and they are checked where they exist —
    // on pages/Workbench, whose tiles are <section> elements (§15).
    a11y: {
      test: "error",
      config: { rules: [{ id: "region", enabled: false }] },
    },
    backgrounds: {
      options: {
        paper: { name: "paper", value: "#ffffff" },
        alt: { name: "pane-alt", value: "#f1f1ee" },
        ink: { name: "ink (shell bars)", value: "#23262b" },
      },
    },
  },
  initialGlobals: { backgrounds: { value: "paper" } },
};

export default preview;
