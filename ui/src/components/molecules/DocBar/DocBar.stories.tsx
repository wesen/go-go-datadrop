import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocBar } from "./DocBar";
import { Stack, Surface } from "../../layout";
import { Text } from "../../foundation";

/**
 * The strip atop every document-bound tile: which document am I a view of?
 *
 * Two tiles pointed at one document stay in lockstep because they are views of
 * one object rather than copies. That is the property the whole window manager
 * rests on, and the dropdown here is how a tile is re-pointed.
 *
 * Reads the store, so the story relies on the global `withStore` decorator —
 * one fresh store per story, so a change made in one does not leak into the
 * next.
 */
const meta = {
  title: "Component Library/Molecules/DocBar",
  component: DocBar,
  parameters: { tile: false },
  args: { leafId: "leaf-1", docId: null },
} satisfies Meta<typeof DocBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Following the active document, which is what `docId: null` means. */
export const FollowsTheActiveDocument: Story = {
  render: () => (
    <Stack gap={3}>
      <Surface border="hair">
        <DocBar leafId="leaf-1" docId={null} />
      </Surface>
      <Text size="tiny" tone="faint" prose>
        A null docId means "whatever is active". Re-point the tile with the
        dropdown, or press ＋ to spawn a new document straight into it.
      </Text>
    </Stack>
  ),
};

/** Two bars side by side — the lockstep property, visible. */
export const TwoTilesOneDocument: Story = {
  render: () => (
    <Stack gap={3}>
      <Surface border="hair">
        <DocBar leafId="leaf-1" docId={null} />
      </Surface>
      <Surface border="hair">
        <DocBar leafId="leaf-2" docId={null} />
      </Surface>
      <Text size="tiny" tone="faint" prose>
        Both follow the active document. Two views of one object, not two
        copies.
      </Text>
    </Stack>
  ),
};
