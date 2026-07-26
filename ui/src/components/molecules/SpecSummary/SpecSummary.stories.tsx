import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpecSummary } from "./SpecSummary";
import { READINGS, chartSpec, step } from "../../../fixtures";

/**
 * A chart specification in one line.
 *
 * The sentence the snapshot gallery and the document manager both wanted, and
 * both used to build for themselves out of the same six fields. Content comes
 * from `specFacts`; this component decides only which facts fit on a line and
 * how they are punctuated.
 *
 * `⊳` separates the stages of the composition — source, transform, drawing —
 * and `·` separates the drawing's parts. Two separators rather than one because
 * the reader is scanning for a stage, not parsing a list.
 */
const meta = {
  title: "Component Library/Molecules/SpecSummary",
  component: SpecSummary,
  parameters: { tile: { width: 520 }, pbui: false },
  args: { spec: chartSpec() },
} satisfies Meta<typeof SpecSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A bare specification: no row budget, because a spec does not have one. */
export const ASpecification: Story = {};

/**
 * With a row budget, which is what the document manager passes.
 *
 * The budget belongs to the document rather than to the drawing, so it appears
 * only when a caller has one to report — the gallery does not.
 */
export const WithARowBudget: Story = { args: { limit: 50000 } };

/** A chain: the step count excludes steps toggled off. */
export const WithSteps: Story = {
  args: {
    spec: chartSpec({
      steps: [
        step.filter(READINGS.temp, ">", "20"),
        { ...step.sort(READINGS.temp, "desc"), on: false },
        step.summarize(READINGS.station, "mean", READINGS.temp),
      ],
    }),
  },
};

/**
 * No source: the line reads "no source" rather than an empty string with two
 * separators around it.
 */
export const NoSource: Story = {
  args: { spec: chartSpec({ source: { kind: "stream", drop: "" } }) },
};

/** Nothing mapped: every channel is an em dash rather than blank. */
export const NothingMapped: Story = {
  args: {
    spec: chartSpec({ mapping: { x: null, y: null, color: null, size: null, facet: null } }),
  },
};
