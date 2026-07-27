import type { Meta, StoryObj } from "@storybook/react-vite";
import { TablePanel } from "./TablePanel";
import { READINGS, chartSpec, pipelineOf, readings, step, tableAfter } from "../../../fixtures";

/**
 * The pipeline's output relation, computed by the pipeline.
 *
 * `evaluate` is pure, so every story below is real output: real row counts,
 * real derived columns, real types on the header chips. A story that
 * hand-wrote rows would be asserting what the pipeline produces rather than
 * showing it.
 */
const meta = {
  title: "Component Library/Organisms/TablePanel",
  component: TablePanel,
  parameters: { tile: { width: 620, height: 420 }, pbui: { table: readings } },
  args: { pipeline: pipelineOf(), docId: "d1" },
} satisfies Meta<typeof TablePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The raw table: 360 rows, so the render cap applies and the footer says so.
 *
 * "showing 200 of 360 pipeline rows — the chart uses all of them" is the
 * important sentence. The cap is on rendering, never on the data, and the two
 * claims are easy to confuse in the direction that makes a chart look wrong.
 */
export const Populated: Story = {};

/**
 * Summarized: four rows, one per station, with a derived column name.
 *
 * The header chips are live `<field>` presentations of the *pipeline's* fields,
 * not the source's — `mean_data.temp_c` does not exist in the fixture. That is
 * the property that makes the table a view of the transform rather than of the
 * source.
 */
const summarized = chartSpec({ steps: [step.summarize(READINGS.station, "mean", READINGS.temp)] });

export const Summarized: Story = {
  // The environment gets the pipeline output, exactly as `useTableFor` gives
  // it to the application. Without this the header chips resolve against the
  // source and `mean_data.temp_c` renders stale — which is the defect this
  // story found.
  parameters: { pbui: { table: tableAfter(summarized) } },
  args: { pipeline: pipelineOf(summarized) },
};

/** A derived column, computed by the pipeline and typed by it. */
const derived = chartSpec({ steps: [step.derive("delta", READINGS.temp, "-", READINGS.humidity)] });

export const WithADerivedColumn: Story = {
  parameters: { pbui: { table: tableAfter(derived) } },
  args: { pipeline: pipelineOf(derived) },
};

/** Sorted and capped, so the visible rows are the interesting ones. */
export const SortedAndLimited: Story = {
  args: {
    pipeline: pipelineOf(chartSpec({ steps: [step.sort(READINGS.temp, "desc"), step.limit(12)] })),
  },
};

/**
 * **A filter that matches nothing.**
 *
 * The table has to say so. An empty `<tbody>` under a full header row reads as
 * a loading state or a rendering fault, and the actual cause — a filter that is
 * too narrow — is one step away in the pipeline tile.
 */
export const NoRows: Story = {
  args: {
    pipeline: pipelineOf(
      chartSpec({ steps: [step.filter(READINGS.station, "=", "no-such-station")] }),
    ),
  },
};

export const NoSource: Story = { args: { pipeline: null, docId: null } };

export const Loading: Story = { args: { pipeline: null, loading: true, docId: null } };
