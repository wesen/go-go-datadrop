import type { Meta, StoryObj } from "@storybook/react-vite";
import { NodeView } from "./SplitView";
import type { Node } from "../../../store/layout";
import "../../../apps/all";

/**
 * The tiling itself.
 *
 * A layout is a binary tree of splits with leaves that name an application by
 * id. Swapping two tiles is therefore a two-field exchange (DR-11) — the
 * applications' state lives in the world, not in the tile.
 *
 * The divider is a `<button role="separator">` rather than a Button: it carries
 * `aria-orientation` and `aria-valuenow` and is a resize handle, so it keeps its
 * own element and its own module. That is one of the four raw elements the
 * DATADROP-6 substitution deliberately left alone.
 */
const meta = {
  title: "Component Library/Organisms/SplitView",
  component: NodeView,
  parameters: { tile: { width: 640, height: 420 } },
  args: { node: { type: "leaf", id: "l1", app: "about", docId: null } },
} satisfies Meta<typeof NodeView>;

export default meta;
type Story = StoryObj<typeof meta>;

const leaf = (id: string, app: string): Node => ({ type: "leaf", id, app, docId: null });

export const OneLeaf: Story = {
  render: () => <NodeView node={leaf("l1", "about")} />,
};

export const SplitHorizontally: Story = {
  render: () => (
    <NodeView
      node={{
        type: "split",
        id: "s1",
        dir: "row",
        ratio: 0.5,
        a: leaf("l1", "about"),
        b: leaf("l2", "launcher"),
      }}
    />
  ),
};

export const SplitVertically: Story = {
  render: () => (
    <NodeView
      node={{
        type: "split",
        id: "s1",
        dir: "col",
        ratio: 0.5,
        a: leaf("l1", "about"),
        b: leaf("l2", "launcher"),
      }}
    />
  ),
};

/**
 * Nested, and off-centre.
 *
 * The ratio is the thing to check: a split that reports 0.3 must *look* 30/70,
 * and the divider must announce `aria-valuenow=30` to match. Drag it, or focus
 * it and use the arrow keys.
 */
export const NestedAndUneven: Story = {
  render: () => (
    <NodeView
      node={{
        type: "split",
        id: "s1",
        dir: "row",
        ratio: 0.3,
        a: leaf("l1", "launcher"),
        b: {
          type: "split",
          id: "s2",
          dir: "col",
          ratio: 0.6,
          a: leaf("l2", "about"),
          b: leaf("l3", "trace"),
        },
      }}
    />
  ),
};
