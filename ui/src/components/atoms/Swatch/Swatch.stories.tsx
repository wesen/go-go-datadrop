import type { Meta, StoryObj } from "@storybook/react-vite";
import { Swatch } from "./Swatch";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * The colour of a mark, beside the thing it means.
 *
 * `color` is a resolved value rather than a token name because `buildPlot` is a
 * pure function with no DOM access: it puts a concrete colour on every mark,
 * and the legend has to agree with what it drew. A legend that disagrees with
 * its marks is a bug that survives review, because both halves look right in
 * isolation.
 */
const meta = {
  title: "Design System/Atoms/Swatch",
  component: Swatch,
  parameters: { tile: false },
  args: { color: "var(--pbui-cat-1)", label: "series 1" },
} satisfies Meta<typeof Swatch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The eight-colour categorical palette, generated from model/plot.ts. */
export const TheCategoricalPalette: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={2} align="center">
        {Array.from({ length: 8 }, (_, i) => (
          <Swatch key={i} color={`var(--pbui-cat-${i + 1})`} label={`category ${i + 1}`} />
        ))}
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Never hand-edit these tokens: `bun run tokens` writes them from PALETTE in model/plot.ts,
        and test/tokens.test.ts proves the two still agree.
      </Text>
    </Stack>
  ),
};

export const InALegendRow: Story = {
  render: () => (
    <Stack gap={1}>
      {["north", "south", "east"].map((label, i) => (
        <Stack key={label} direction="row" gap={2} align="center">
          <Swatch color={`var(--pbui-cat-${i + 1})`} label={label} />
          <Text size="small">{label}</Text>
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * A long label must not squeeze the colour it describes.
 *
 * `flex-shrink: 0` on the swatch. Without it the square becomes a sliver in a
 * narrow tile, which is the one thing it cannot afford to be.
 */
export const NarrowContainer: Story = {
  render: () => (
    <div style={{ width: 120, border: "var(--pbui-border-hair)", padding: 4 }}>
      <Stack direction="row" gap={2} align="center">
        <Swatch color="var(--pbui-cat-4)" label="a very long category name" />
        <Text size="small" truncate title="a very long category name">
          a very long category name
        </Text>
      </Stack>
    </div>
  ),
};
