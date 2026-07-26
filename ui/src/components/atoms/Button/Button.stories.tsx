import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * The two treatments, side by side.
 *
 * Putting them on one page is the point of the story rather than a convenience:
 * before this component existed the two were separated by a directory boundary
 * and nobody had noticed there were two.
 */
const meta = {
  title: "Design System/Atoms/Button",
  component: Button,
  parameters: { tile: false },
  args: { children: "Button" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bare: Story = {
  name: "Bare — the default",
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="center">
        <Button>Commit</Button>
        <Button tone="danger">Discard</Button>
        <Button selected>Selected</Button>
        <Button disabled>Disabled</Button>
        <Button busy="minting…">Mint token</Button>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        reset.css strips background, border and padding from every button, so a bare one renders as
        text with a pointer cursor. Twenty-nine of the forty-two hand-written buttons looked like
        this.
      </Text>
    </Stack>
  ),
};

export const Framed: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={2} align="center">
        <Button variant="framed">new doc</Button>
        <Button variant="framed" tone="danger">
          remove
        </Button>
        <Button variant="framed" selected>
          selected
        </Button>
        <Button variant="framed" disabled>
          disabled
        </Button>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        The six copies of `const btn: React.CSSProperties`, reconciled.
      </Text>
    </Stack>
  ),
};

/**
 * The finding from guide §7.2, on screen.
 *
 * This story exists to document rather than to demonstrate. The six copies of
 * the framed style were identical except for this one property — three used
 * 9.5px and three used 10.5px — so the next person choosing a size sees that
 * the choice is real, and that it was previously made by accident six times.
 */
export const BothSizes: Story = {
  name: "Both sizes — the divergence that started this",
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="baseline">
        <Button variant="framed" size="tiny">
          tiny — 9.5px
        </Button>
        <Button variant="framed" size="small">
          small — 10.5px
        </Button>
      </Stack>
      <Stack direction="row" gap={3} align="baseline">
        <Button size="tiny">tiny, bare</Button>
        <Button size="small">small, bare</Button>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Gallery, Compare and Charts used 9.5px. Encoding, Pipeline and Source used 10.5px. Nobody
        decided that (guide §7.2).
      </Text>
    </Stack>
  ),
};

/**
 * The state a hand-written button could get wrong, and did.
 *
 * `selected` sets `aria-pressed`; before this atom, half the toggle buttons in
 * the tree set it and half did not. There is no way to see the difference by
 * looking, which is exactly why it belongs to the component.
 */
export const PressedIsAnnounced: Story = {
  render: () => (
    <Stack gap={2}>
      <Stack direction="row" gap={3}>
        <Button variant="framed" selected>
          on
        </Button>
        <Button variant="framed">off</Button>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        The left button reports aria-pressed=true. Both are distinguishable without colour: the
        selected fill is accompanied by the announcement, and a monochrome display still shows the
        fill difference.
      </Text>
    </Stack>
  ),
};
