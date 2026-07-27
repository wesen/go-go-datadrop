import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpecDiff } from "./SpecDiff";
import { READINGS, chartSpec, step } from "../../../fixtures";
import { specFacts } from "../../../model/chart";

const A = specFacts(chartSpec({ steps: [step.filter(READINGS.temp, ">", "20")] }), 2000);
const B = specFacts(
  chartSpec({
    geom: "bar",
    yScale: "log",
    steps: [step.summarize(READINGS.station, "mean", READINGS.temp)],
    mapping: { x: READINGS.station, y: "mean_data.temp_c", color: null, size: null, facet: null },
  }),
  50000,
);

/**
 * Two fact lists, aligned, with the rows that disagree marked.
 *
 * Difference is carried twice — tone AND weight. Colour alone would fail
 * WCAG 1.4.1, and a reader who cannot see the hue would get no signal at all
 * from a component whose entire job is that signal.
 *
 * Takes fact lists rather than specs, so the caller decides what a fact is. In
 * practice that is `specFacts`, which the one-line summary also reads — which
 * is what stops one spec being described two ways.
 */
const meta = {
  title: "Component Library/Molecules/SpecDiff",
  component: SpecDiff,
  parameters: { tile: { width: 560 }, pbui: false },
  args: { left: A, right: B, leftLabel: "α", rightLabel: "by station" },
} satisfies Meta<typeof SpecDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six of ten rows differ. */
export const Differing: Story = {};

/**
 * Identical: nothing is marked.
 *
 * Worth a story because "no rows highlighted" has two causes — they are the
 * same, or the diff is broken — and the only way to tell them apart is to have
 * seen this one.
 */
export const Identical: Story = { args: { right: A, rightLabel: "a copy" } };

/**
 * **One side empty.**
 *
 * Every row differs, and the empty side is an em dash per row rather than a
 * blank column. This is the shape the compare tile shows when only A is pinned.
 */
export const OneSideEmpty: Story = { args: { right: [], rightLabel: "empty" } };

/**
 * **Keys the other side does not have.**
 *
 * The union, not the intersection: a document carries a row budget and a bare
 * snapshot does not, and intersecting would hide exactly the row worth seeing.
 */
export const AsymmetricKeys: Story = {
  args: {
    left: A,
    right: specFacts(chartSpec()),
    rightLabel: "no budget",
  },
};
