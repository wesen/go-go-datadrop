import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocChip } from "./DocChip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * A chart document.
 *
 * The active document is the one ambient verbs land on, and a user who cannot
 * see which it is cannot predict where a menu entry will act — so the active
 * state is marked rather than implied.
 */
const meta = {
  title: "Design System/Atoms/DocChip",
  component: DocChip,
  parameters: { tile: false, activeDocId: "d1" },
  args: { docId: "d1" },
} satisfies Meta<typeof DocChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveAndNot: Story = {
  parameters: { pbui: { activeDocId: "d1" } },
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center">
        <DocChip docId="d1" />
        <DocChip docId="d2" />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        The left one is active. Ambient verbs — those fired from a chip that names no document —
        land there.
      </Text>
    </Stack>
  ),
};
