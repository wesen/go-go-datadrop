import type { Decorator } from "@storybook/react-vite";
import { Provider } from "react-redux";
import { useMemo } from "react";
import { makeStore } from "../src/store";

/**
 * The decorators that make a workbench component storyable.
 *
 * A component in this application needs up to three things from its
 * surroundings: a store to read documents from, a PBUI context to present
 * into, and something tile-shaped to lay out inside. Without decorators every
 * story would assemble all three by hand, and most components would simply be
 * unstorybookable — which is exactly the hidden-dependency smell the layering
 * is meant to remove (DR-16).
 *
 * `withPbui` arrives in phase 1 with the protocol itself.
 */

/**
 * A real store, one per story.
 *
 * Per story, not shared: a `play` function that dispatches in one story must
 * not leave state behind for the next. An intermittently-failing story is worse
 * than no story, and the cause is nearly impossible to see from the failure.
 */
export const withStore: Decorator = (Story) => {
  const store = useMemo(() => makeStore(), []);
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

/**
 * Tile-shaped chrome, so organisms lay out the way they will in the shell.
 *
 * A tile is a bounded flex column: a title bar that does not shrink and a body
 * that scrolls. Components that look fine in an unbounded story canvas and
 * break inside a real tile do so because of exactly that constraint, so the
 * default is to impose it. Opt out with `parameters: { tile: false }` for
 * atoms, which have no business assuming a height.
 */
export const withTile: Decorator = (Story, ctx) => {
  if (ctx.parameters.tile === false) {
    return (
      <div style={{ padding: "var(--pbui-space-4)" }}>
        <Story />
      </div>
    );
  }
  const { width = 420, height = 520 } = (ctx.parameters.tile ?? {}) as {
    width?: number;
    height?: number;
  };
  return (
    <div
      data-part="tile"
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        border: "var(--pbui-border-firm)",
        background: "var(--pbui-pane)",
        minWidth: 0,
        minHeight: 0,
        // A real tile clips. Without this a child that fails to bound itself
        // paints outside the frame and the story looks fine while the
        // component is broken — which is how a 360-row table came to render
        // past the bottom of a 420px tile.
        overflow: "hidden",
      }}
    >
      <Story />
    </div>
  );
};
