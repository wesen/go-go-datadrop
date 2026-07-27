import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FileDropZone } from "./FileDropZone";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * Two affordances, and both are necessary.
 *
 * A drop target alone assumes a mouse, a window arrangement that lets you see
 * the file manager and the browser at once, and the knowledge that the surface
 * is droppable at all — none of which a keyboard user has. The button assumes
 * none of them, and it is the one a screen reader reaches.
 */
const meta = {
  title: "Component Library/Molecules/FileDropZone",
  component: FileDropZone,
  parameters: { tile: false },
  args: { onFiles: () => {} },
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live() {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Stack gap={2}>
      <FileDropZone
        accept=".csv,text/csv,.tsv,.json,.ndjson,.md,.txt"
        buttonLabel="Choose CSV files…"
        onFiles={(files) => setPicked(Array.from(files).map((f) => f.name))}
      />
      {picked.length > 0 && (
        <Text size="tiny" tone="faint">
          picked: {picked.join(", ")}
        </Text>
      )}
    </Stack>
  );
}

/** Live — drop files on it, or press the button. */
export const Ready: Story = { render: () => <Live /> };

/**
 * Disabled, with the reason.
 *
 * `disabledReason` rather than a bare `disabled`, because "choose a drop and
 * name the dataset first" is the entire content of the disabled state. A greyed
 * box with no sentence is a puzzle.
 */
export const Disabled: Story = {
  render: () => (
    <FileDropZone
      disabled
      disabledReason="choose a drop and name the dataset first"
      onFiles={() => {}}
    />
  ),
};

/**
 * The drag state, which is unmistakable on purpose.
 *
 * Firm border *and* the selection fill — two changes rather than one, so it
 * survives greyscale. While a file is hovering the pointer is busy and there is
 * no other feedback.
 */
export const Dragging: Story = {
  render: () => (
    <Stack gap={2}>
      <FileDropZone onFiles={() => {}} />
      <Text size="tiny" tone="faint" prose>
        Drag a file over the surface above to see it. The state is carried by the border weight as
        well as the fill.
      </Text>
    </Stack>
  ),
};
