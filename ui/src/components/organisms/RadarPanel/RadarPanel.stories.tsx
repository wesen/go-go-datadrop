import type { Meta, StoryObj } from "@storybook/react-vite";
import { RadarPanel } from "./RadarPanel";
import { buildRadar } from "../../../model/radar";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * A radar chart — the second coordinate system in the design system.
 *
 * Radar is not a fifth geom. A geom is a mark shape drawn *inside* a coordinate
 * system; point, line, bar and area all consume the same scales. Radar replaces
 * the system: no x, no y, no axis ticks. So `buildRadar` is a sibling of
 * `buildPlot`, not a branch inside it.
 *
 * Every shape here comes from that pure function, which is why the geometry can
 * be asserted at exact coordinates with no DOM — see `ui/test/radar.test.ts`.
 */
const AXES = [
  { label: "PTS", max: 32 },
  { label: "REB", max: 14 },
  { label: "AST", max: 11 },
  { label: "STL", max: 2.2 },
  { label: "BLK", max: 2.6 },
  { label: "3P%", max: 42 },
  { label: "TS%", max: 66 },
];

const SERIES = [
  {
    key: "a",
    label: "high volume scorer",
    color: "var(--pbui-cat-1)",
    values: [31, 5, 6, 1.1, 0.4, 38, 61],
  },
  {
    key: "b",
    label: "two-way big",
    color: "var(--pbui-cat-2)",
    values: [18, 13, 2, 0.9, 2.4, 29, 63],
  },
  {
    key: "c",
    label: "distributor",
    color: "var(--pbui-cat-3)",
    values: [14, 4, 10.5, 1.8, 0.3, 40, 58],
  },
];

const meta = {
  title: "Component Library/Organisms/RadarPanel",
  component: RadarPanel,
  parameters: { tile: { width: 520, height: 460 }, pbui: false },
  args: { plot: buildRadar(AXES, SERIES, 300), size: 300 },
} satisfies Meta<typeof RadarPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** One series, which is a profile rather than a comparison. */
export const Single: Story = {
  args: { plot: buildRadar(AXES, [SERIES[0]!], 300) },
};

/**
 * Why the cap exists.
 *
 * Three translucent polygons can be told apart. The notice says what was
 * dropped rather than letting two series quietly vanish.
 */
export const TooManySeries: Story = {
  render: () => {
    const many = [
      ...SERIES,
      {
        key: "d",
        label: "rim runner",
        color: "var(--pbui-cat-4)",
        values: [12, 9, 1, 0.5, 1.6, 12, 65],
      },
      {
        key: "e",
        label: "bench guard",
        color: "var(--pbui-cat-5)",
        values: [9, 2, 4, 1.2, 0.1, 35, 55],
      },
    ];
    return (
      <Stack gap={2}>
        <SectionLabel>five series requested, three drawn</SectionLabel>
        <RadarPanel plot={buildRadar(AXES, many, 300)} />
      </Stack>
    );
  },
};

/**
 * The refusals. Each names what to change rather than drawing something wrong.
 */
export const Refusals: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>two axes — not a polygon</SectionLabel>
        <RadarPanel
          plot={buildRadar(AXES.slice(0, 2), [{ ...SERIES[0]!, values: [31, 5] }], 300)}
        />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>an axis with a zero maximum — nothing to scale against</SectionLabel>
        <RadarPanel
          plot={buildRadar(
            [
              { label: "PTS", max: 32 },
              { label: "BROKEN", max: 0 },
              { label: "AST", max: 11 },
            ],
            [{ ...SERIES[0]!, values: [31, 5, 6] }],
            300,
          )}
        />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>a series with the wrong number of values</SectionLabel>
        <RadarPanel plot={buildRadar(AXES, [{ ...SERIES[0]!, values: [1, 2] }], 300)} />
      </Stack>
    </Stack>
  ),
};

/**
 * The shape-preserving edges.
 *
 * A zero is floored to 5% of the radius. Without the floor that vertex sits on
 * the centre and the polygon self-intersects into a bowtie, which reads as a
 * rendering fault rather than as a low value.
 */
export const Edges: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>a zero on one spoke</SectionLabel>
        <RadarPanel
          plot={buildRadar(AXES, [{ ...SERIES[0]!, values: [31, 0, 6, 1.1, 0.4, 38, 61] }], 300)}
        />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>a value above its maximum, clamped to the outer ring</SectionLabel>
        <RadarPanel
          plot={buildRadar(AXES, [{ ...SERIES[0]!, values: [99, 5, 6, 1.1, 0.4, 38, 61] }], 300)}
        />
      </Stack>
      <Text>
        Both keep the polygon convex and inside the outer ring. The underlying values are still
        reported honestly on each vertex.
      </Text>
    </Stack>
  ),
};
