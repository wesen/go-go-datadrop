import type { Meta, StoryObj } from "@storybook/react-vite";
import { KindLegend } from "./KindLegend";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { formatBytes, msfmt } from "../../../model/format";

/**
 * What a set of kinds accounts for: a swatch, a bar, a total and a count.
 *
 * Related to `Legend`, not the same thing. `Legend` decodes the colours of a
 * chart the reader is already looking at, and is coupled to the encoding layer
 * that produced them. This decodes nothing — it is a breakdown, and it is used
 * where there is no chart at all.
 */
const meta = {
  title: "Component Library/Molecules/KindLegend",
  component: KindLegend,
  parameters: { tile: false },
  args: {
    label: "context window composition",
    kinds: [
      { kind: "file", tone: "var(--pbui-tone-source)", total: 8400, count: 12 },
      { kind: "tool", tone: "var(--pbui-tone-field)", total: 4100, count: 7 },
      { kind: "system", tone: "var(--pbui-tone-neutral)", total: 1520, count: 2 },
      { kind: "memory", tone: "var(--pbui-tone-step)", total: 900, count: 5 },
    ],
  },
} satisfies Meta<typeof KindLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Input order does not matter — the component sorts descending by total.
 *
 * Sorting here rather than at the call site is deliberate. Every caller wants
 * this order, and a legend that reorders as its data changes reads as flicker
 * rather than as information.
 */
export const SortsItself: Story = {
  args: {
    label: "deliberately shuffled input",
    kinds: [
      { kind: "memory", tone: "var(--pbui-tone-step)", total: 900, count: 5 },
      { kind: "file", tone: "var(--pbui-tone-source)", total: 8400, count: 12 },
      { kind: "system", tone: "var(--pbui-tone-neutral)", total: 1520, count: 2 },
      { kind: "tool", tone: "var(--pbui-tone-field)", total: 4100, count: 7 },
    ],
  },
};

/** A caller supplies its own formatter when the quantity is not a bare count. */
export const Formatters: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>bytes</SectionLabel>
        <KindLegend
          label="dataset composition by bytes"
          format={formatBytes}
          kinds={[
            { kind: "csv", tone: "var(--pbui-tone-source)", total: 9_400_000, count: 3 },
            { kind: "json", tone: "var(--pbui-tone-field)", total: 2_100_000, count: 11 },
            { kind: "md", tone: "var(--pbui-tone-neutral)", total: 48_000, count: 2 },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>durations</SectionLabel>
        <KindLegend
          label="time by verb kind"
          format={msfmt}
          kinds={[
            { kind: "evaluate", tone: "var(--pbui-tone-step)", total: 4200, count: 31 },
            { kind: "render", tone: "var(--pbui-tone-chart)", total: 890, count: 31 },
            { kind: "fetch", tone: "var(--pbui-tone-source)", total: 12_400, count: 4 },
          ]}
        />
      </Stack>
    </Stack>
  ),
};

/** The degenerate cases: nothing, and everything at zero. */
export const Degenerate: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>no kinds at all</SectionLabel>
        <KindLegend label="empty" kinds={[]} />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>every total is zero — the bars divide by the max</SectionLabel>
        <KindLegend
          label="all zero"
          kinds={[
            { kind: "file", tone: "var(--pbui-tone-source)", total: 0, count: 0 },
            { kind: "tool", tone: "var(--pbui-tone-field)", total: 0, count: 0 },
          ]}
        />
        <Text size="tiny" tone="faint">
          empty bars rather than NaN widths — the max is 0 and the fraction falls back to 0
        </Text>
      </Stack>
    </Stack>
  ),
};

/** Long kind names truncate rather than pushing the bars out of alignment. */
export const LongNames: Story = {
  args: {
    label: "long names",
    kinds: [
      {
        kind: "a-very-long-kind-name-indeed",
        tone: "var(--pbui-tone-source)",
        total: 4000,
        count: 3,
      },
      { kind: "short", tone: "var(--pbui-tone-field)", total: 2000, count: 9 },
    ],
  },
};
