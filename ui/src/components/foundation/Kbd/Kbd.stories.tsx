import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kbd } from "./Kbd";
import { Stack } from "../../layout";
import { Text } from "..";

/**
 * A presentation-based interface documents itself continuously, and a good deal
 * of that documentation names keys. They have to read as keys rather than as
 * prose, or the mouse-doc line becomes a sentence nobody parses.
 */
const meta = {
  title: "Design System/Foundation/Kbd",
  component: Kbd,
  parameters: { tile: false },
  args: { children: "Esc" },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProse: Story = {
  render: () => (
    <Stack gap={3}>
      <Text size="small">
        <Kbd>Esc</Kbd> aborts the pending accept. <Kbd>Enter</Kbd> runs the highlighted verb.{" "}
        <Kbd>R</Kbd> opens the menu for whatever is under the cursor.
      </Text>
      <Stack direction="row" gap={2}>
        <Kbd>Esc</Kbd>
        <Kbd>Enter</Kbd>
        <Kbd>⌘</Kbd>
        <Kbd>Shift</Kbd>
        <Kbd>1</Kbd>
      </Stack>
    </Stack>
  ),
};
