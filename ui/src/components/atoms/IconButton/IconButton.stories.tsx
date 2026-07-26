import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const meta = {
  title: "Design System/Atoms/IconButton",
  component: IconButton,
  parameters: { tile: false },
  args: { glyph: "✕", label: "remove" },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every glyph currently in the tree, with the verb each one means. */
export const TheGlyphsInUse: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={2} align="center">
        <IconButton variant="framed" glyph="↑" label="move up" />
        <IconButton variant="framed" glyph="↓" label="move down" />
        <IconButton variant="framed" glyph="✕" label="remove step" tone="danger" />
        <IconButton variant="framed" glyph="⌖" label="accept a field for y" />
        <IconButton variant="framed" glyph="×" label="clear y" />
        <IconButton glyph="↕" label="resize the split" />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Hover any of them: the label is the accessible name and the tooltip. A glyph-only button
        without one announces as "button" and nothing else, which is why `label` is a required prop
        rather than an optional one.
      </Text>
    </Stack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Stack gap={2}>
      <Stack direction="row" gap={2}>
        <IconButton variant="framed" glyph="↑" label="move up" disabled />
        <IconButton variant="framed" glyph="↓" label="move down" />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        The first step in a pipeline cannot move up. Every hand-written site that dimmed a button
        also set `disabled`, so the opacity was the disabled treatment all along — it is attached to
        `:disabled` here so the two cannot come apart.
      </Text>
    </Stack>
  ),
};

export const Bare: Story = {
  render: () => (
    <Stack direction="row" gap={3} align="center">
      <IconButton glyph="✕" label="close" />
      <IconButton glyph="✕" label="close, dangerous" tone="danger" />
      <IconButton glyph="✕" label="close, tiny" size="tiny" />
    </Stack>
  ),
};
