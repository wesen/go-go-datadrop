import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceStrip } from "./WorkspaceStrip";
import { Stack, Surface } from "../../layout";
import { Text } from "../../foundation";
import "../../../apps/all";

/**
 * Workspaces are named tile arrangements over ONE world.
 *
 * Switching is a state change, not a remount of the data: the documents, the
 * snapshots and the cached tables are the same objects, which is why an accept
 * started in one workspace can be satisfied in another.
 */
const meta = {
  title: "Component Library/Organisms/WorkspaceStrip",
  component: WorkspaceStrip,
  parameters: { tile: false },
} satisfies Meta<typeof WorkspaceStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The default set, including the two pinned spaces.
 *
 * A pinned workspace — marked ⌾ — is defined in code, re-created from source on
 * every load, and cannot be deleted or renamed. Without that, a user who closed
 * the account space in one release would have no account space in the next, and
 * the only route back would be clearing localStorage (DR-29). The cost is that
 * tiles added to a pinned space are lost on reload, which is why the strip
 * marks them rather than leaving it to be discovered.
 */
export const Default: Story = {
  render: () => (
    <Stack gap={3}>
      <Surface tone="inverted">
        <WorkspaceStrip />
      </Surface>
      <Text size="tiny" tone="faint" prose>
        Double-click a name to rename it — pinned spaces refuse, because offering an edit that gets
        overwritten on the next load would be a lie. Right-click for duplicate and delete.
      </Text>
    </Stack>
  ),
};

/**
 * On the surface it actually sits on.
 *
 * The strip lives on an inverted bar, where `--pbui-faint` would measure 2.95:1
 * and be unreadable. `Surface`'s `.inverted` re-points it to
 * `--pbui-faint-inverted` for everything below, so nothing in the strip has to
 * know which kind of surface it is on. Rendered on a pale surface here for
 * comparison.
 */
export const OnBothSurfaces: Story = {
  render: () => (
    <Stack gap={4}>
      <Surface tone="inverted">
        <WorkspaceStrip />
      </Surface>
      <Surface tone="pane" border="hair">
        <WorkspaceStrip />
      </Surface>
    </Stack>
  ),
};
