import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentedBar, type Segment } from "./SegmentedBar";
import { KindLegend } from "../KindLegend";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { kfmt, pctfmt } from "../../../model/format";

/**
 * One bar divided into proportional segments, each independently addressable.
 *
 * Nothing else in the design system composes objects spatially like this. A
 * `Legend` lists them, a `Meter` measures one thing, a chart draws marks in a
 * coordinate space — this lays a set of objects side by side *in proportion*,
 * so relative size is the primary reading while identity stays available on
 * each piece.
 *
 * `renderSegment` is the seam that keeps it provider-free, the same one
 * `Legend` uses for `renderEntry`. A caller wanting live presentations wraps
 * each segment there; this component never imports `Presentation`.
 */
const meta = {
  title: "Component Library/Molecules/SegmentedBar",
  component: SegmentedBar,
  parameters: { tile: false },
  args: {
    label: "context window",
    segments: [
      {
        id: "sys",
        weight: 900,
        tone: "var(--pbui-tone-neutral)",
        label: "system prompt",
        pinned: true,
      },
      {
        id: "tools",
        weight: 620,
        tone: "var(--pbui-tone-neutral)",
        label: "tool schemas",
        pinned: true,
      },
      { id: "mem", weight: 900, tone: "var(--pbui-tone-step)", label: "memory" },
      { id: "files", weight: 8400, tone: "var(--pbui-tone-source)", label: "file bodies" },
      { id: "tool-out", weight: 4100, tone: "var(--pbui-tone-field)", label: "tool results" },
    ],
    total: 24_000,
  },
} satisfies Meta<typeof SegmentedBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * With and without a `total`, which is the switch between two different
 * questions.
 *
 * No total: the segments fill the bar, and the reading is "what is this made
 * of". With a total: the remainder is hatched headroom, and the reading becomes
 * "how much is left". A composition drawn with headroom understates every
 * share; a budget drawn without it hides the only number that matters.
 */
export const CompositionVersusBudget: Story = {
  render: function CompositionVersusBudgetStory(_args) {
    const segments: Segment[] = [
      { id: "a", weight: 8400, tone: "var(--pbui-tone-source)", label: "file bodies" },
      { id: "b", weight: 4100, tone: "var(--pbui-tone-field)", label: "tool results" },
      { id: "c", weight: 1520, tone: "var(--pbui-tone-neutral)", label: "system" },
    ];
    return (
      <Stack gap={4}>
        <Stack gap={2}>
          <SectionLabel>no total — a composition</SectionLabel>
          <SegmentedBar label="composition" segments={segments} />
        </Stack>
        <Stack gap={2}>
          <SectionLabel>total 24 000 — a budget, with headroom hatched</SectionLabel>
          <SegmentedBar
            label="budget"
            segments={segments}
            total={24_000}
            summary={`${kfmt(14_020)} / ${kfmt(24_000)} · ${pctfmt(14_020 / 24_000)}`}
          />
        </Stack>
      </Stack>
    );
  },
};

/**
 * Overflow: the weights exceed the total.
 *
 * Two things are true here and the second is a limitation, not a feature.
 *
 * The safe part: there is no negative-width headroom and no segment escaping
 * the bar. Measured, the three segments are 774 + 378 + 203 px inside a 1355px
 * bar, and every child stays within its bounds.
 *
 * The limitation: **the segments are renormalised to fit.** Flex distributes
 * the available width in proportion to the weights and has no way to represent
 * "wider than the container", so an over-budget bar has the same segment
 * geometry as an exactly-full one. Only the red border and the OVER badge
 * distinguish them, which means the overflow signal is carried entirely by
 * those two marks rather than by the proportions.
 *
 * If a caller needs overflow to be legible *as size*, this is the wrong widget
 * and the honest answer is a second bar drawn to a larger scale.
 */
export const Overflow: Story = {
  args: {
    label: "over budget",
    total: 10_000,
    segments: [
      { id: "a", weight: 8400, tone: "var(--pbui-tone-source)", label: "file bodies" },
      { id: "b", weight: 4100, tone: "var(--pbui-tone-field)", label: "tool results" },
      { id: "c", weight: 2200, tone: "var(--pbui-tone-step)", label: "memory" },
    ],
  },
};

/** Segment counts from a handful to a crowd. The 2px floor keeps slivers visible. */
export const Density: Story = {
  render: () => {
    const make = (n: number): Segment[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        weight: 1 + ((i * 7) % 11),
        tone: `var(--pbui-cat-${(i % 8) + 1})`,
        label: `segment ${i + 1}`,
      }));
    return (
      <Stack gap={4}>
        {[3, 12, 60].map((n) => (
          <Stack key={n} gap={2}>
            <SectionLabel>{n} segments</SectionLabel>
            <SegmentedBar label={`${n} segments`} segments={make(n)} />
          </Stack>
        ))}
        <Text>
          At 60 the narrowest segments hit the 2px floor. They stop being proportional at that
          point, which is the honest trade: a 0.4px segment is invisible, and an invisible segment
          is indistinguishable from one that is not there.
        </Text>
      </Stack>
    );
  },
};

/** Pinned and dimmed, which are states rather than identities. */
export const States: Story = {
  args: {
    label: "segment states",
    total: undefined,
    segments: [
      { id: "a", weight: 3, tone: "var(--pbui-tone-source)", label: "ordinary" },
      { id: "b", weight: 3, tone: "var(--pbui-tone-field)", label: "pinned", pinned: true },
      { id: "c", weight: 3, tone: "var(--pbui-tone-step)", label: "dimmed", dimmed: true },
      {
        id: "d",
        weight: 3,
        tone: "var(--pbui-tone-doc)",
        label: "pinned and dimmed",
        pinned: true,
        dimmed: true,
      },
    ],
  },
};

/** The degenerate inputs. */
export const Degenerate: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>no segments at all</SectionLabel>
        <SegmentedBar label="empty" segments={[]} />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>no segments, but a total — all headroom</SectionLabel>
        <SegmentedBar label="all headroom" segments={[]} total={1000} />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>every weight zero</SectionLabel>
        <SegmentedBar
          label="all zero"
          segments={[
            { id: "a", weight: 0, tone: "var(--pbui-tone-source)", label: "a" },
            { id: "b", weight: 0, tone: "var(--pbui-tone-field)", label: "b" },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>a negative weight, which must not invert the layout</SectionLabel>
        <SegmentedBar
          label="negative"
          segments={[
            {
              id: "a",
              weight: -5,
              tone: "var(--pbui-tone-danger, var(--pbui-tone-doc))",
              label: "negative",
            },
            { id: "b", weight: 10, tone: "var(--pbui-tone-field)", label: "positive" },
          ]}
        />
      </Stack>
    </Stack>
  ),
};

/**
 * The pairing this widget is built for: a bar for proportion, a legend for
 * identity. Neither answers the other's question.
 */
export const WithLegend: Story = {
  render: () => {
    const kinds = [
      { kind: "file", tone: "var(--pbui-tone-source)", total: 8400, count: 12 },
      { kind: "tool", tone: "var(--pbui-tone-field)", total: 4100, count: 7 },
      { kind: "system", tone: "var(--pbui-tone-neutral)", total: 1520, count: 2 },
      { kind: "memory", tone: "var(--pbui-tone-step)", total: 900, count: 5 },
    ];
    return (
      <Stack gap={3}>
        <SegmentedBar
          label="context window"
          total={24_000}
          summary={`${kfmt(14_920)} / ${kfmt(24_000)} · ${pctfmt(14_920 / 24_000)}`}
          segments={kinds.map((k) => ({
            id: k.kind,
            weight: k.total,
            tone: k.tone,
            label: `${k.kind} · ${kfmt(k.total)}`,
          }))}
        />
        <KindLegend label="context window composition" kinds={kinds} />
      </Stack>
    );
  },
};
