import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sparkline } from "./Sparkline";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * A series at a glance: no axes, no scales, no legend, no interaction.
 *
 * Not a small chart. `ChartPanel` computes scales, ticks and marks through the
 * grammar-of-graphics pipeline; that is the right machinery for a chart and
 * roughly forty times the work for a shape drawn at 120×24. A chart answers
 * "what are the values"; a sparkline answers "what is the shape".
 */
const meta = {
  title: "Design System/Atoms/Sparkline",
  component: Sparkline,
  parameters: { tile: false },
  args: {
    points: [3, 5, 4, 8, 9, 7, 12, 14, 13, 18],
    label: "verbs applied per step",
  },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * With a threshold, the line recolours **entirely** once any point crosses it.
 *
 * Colouring only the offending segment would imply the rest of the series is
 * fine. Crossing a budget is a property of the run, not of one sample.
 */
export const Threshold: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>under budget throughout</SectionLabel>
        <Sparkline points={[2, 4, 5, 7, 9, 11, 12]} threshold={20} label="under budget" />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>crosses at the eighth point</SectionLabel>
        <Sparkline points={[2, 4, 5, 7, 9, 11, 12, 21, 19]} threshold={20} label="over budget" />
      </Stack>
      <Text>
        The dashed line is inside the domain even when it sits above every observed value — the
        domain includes the threshold, or the budget line would be drawn off the top of the box and
        silently vanish.
      </Text>
    </Stack>
  ),
};

/**
 * A gap in the data is drawn as a gap.
 *
 * Non-finite entries break the path rather than interpolating across them.
 * Interpolation would invent a value the series does not have, and on a shape
 * this small the invention is invisible.
 */
export const Gaps: Story = {
  render: () => (
    <Stack gap={2}>
      <SectionLabel>a missing sample in the middle</SectionLabel>
      <Sparkline
        points={[4, 6, 9, Number.NaN, Number.NaN, 14, 11, 15]}
        label="series with a gap"
        width={200}
      />
    </Stack>
  ),
};

/**
 * The degenerate inputs, all of which reach a division.
 *
 * A flat series has zero range, and `(v − lo) / 0` is NaN for every point — an
 * SVG path full of NaN renders nothing at all, with no error. The span falls
 * back to 1 so a flat line is drawn flat.
 */
export const Degenerate: Story = {
  render: () => (
    <Stack gap={4}>
      {[
        ["empty — renders a box, not nothing", [] as number[]],
        ["one point", [7]],
        ["flat — zero range", [5, 5, 5, 5, 5, 5]],
        ["all non-finite", [Number.NaN, Number.NaN]],
      ].map(([caption, pts]) => (
        <Stack key={caption as string} gap={1}>
          <SectionLabel>{caption as string}</SectionLabel>
          <Sparkline points={pts as number[]} label={caption as string} />
        </Stack>
      ))}
      <Text>
        Every one of these renders an empty or flat box rather than disappearing. A component that
        vanishes when its data is empty makes the surrounding layout jump, and a jump reads as a
        defect.
      </Text>
    </Stack>
  ),
};

/** Sizes, to show the stroke stays one pixel wide as the box stretches. */
export const Sizes: Story = {
  render: () => (
    <Stack gap={3}>
      {[
        [60, 16],
        [120, 24],
        [320, 48],
      ].map(([w, h]) => (
        <Sparkline
          key={`${w}x${h}`}
          points={[3, 8, 5, 12, 9, 15, 11, 18]}
          label={`${w} by ${h}`}
          width={w as number}
          height={h as number}
        />
      ))}
    </Stack>
  ),
};
