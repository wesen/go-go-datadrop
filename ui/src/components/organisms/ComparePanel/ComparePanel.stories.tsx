import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComparePanel, type CompareSide } from "./ComparePanel";
import { READINGS, chartSpec, readings, step } from "../../../fixtures";

const A: CompareSide = {
  name: "α @ 18:04",
  limit: 2000,
  spec: chartSpec({ steps: [step.filter(READINGS.temp, ">", "20")] }),
};

const B: CompareSide = {
  name: "by station",
  limit: 50000,
  spec: chartSpec({
    geom: "bar",
    yScale: "log",
    steps: [step.summarize(READINGS.station, "mean", READINGS.temp)],
    mapping: { x: READINGS.station, y: "mean_data.temp_c", color: null, size: null, facet: null },
  }),
};

/**
 * Two pinned snapshots, as an aligned diff.
 *
 * Comparing two charts is almost always asking *what is different*, and making
 * the reader do that by eye is work the machine can do. Differing rows are both
 * toned and bolded: colour alone would fail WCAG 1.4.1, and the signal is this
 * component's entire job.
 */
const meta = {
  title: "Component Library/Organisms/ComparePanel",
  component: ComparePanel,
  parameters: { tile: { width: 560, height: 440 }, pbui: { table: readings } },
  args: { a: A, b: B, onPick: () => {} },
} satisfies Meta<typeof ComparePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two specs that differ in six of ten rows. */
export const BothPinned: Story = {};

/**
 * Neither pinned — the one state that gets prose instead of a diff, because an
 * empty two-column table answers no question.
 */
export const NeitherPinned: Story = { args: { a: null, b: null } };

/**
 * **Only A pinned.**
 *
 * The diff still renders, against an empty column. A single pinned snapshot
 * against nothing is a legible answer to "what did I pin", and suppressing it
 * would mean a reader who pinned one thing sees the same screen as a reader who
 * pinned none.
 */
export const OnlyAPinned: Story = { args: { b: null } };

/**
 * Two identical specifications: nothing is marked.
 *
 * Worth a story because "no rows are highlighted" has two causes — they are the
 * same, or the diff is broken — and the only way to tell them apart is to have
 * seen this.
 */
export const IdenticalSpecs: Story = {
  args: { a: A, b: { ...A, name: "a copy of α" } },
};
