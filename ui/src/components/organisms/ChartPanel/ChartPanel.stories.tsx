import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChartPanel } from "./ChartPanel";
import { READINGS, chartPlot, chartSpec, readings, step } from "../../../fixtures";

/**
 * The chart, driven by the real engine rather than by hand-written literals.
 *
 * `buildPlot` and `evaluate` are pure — a table and a specification in, a plot
 * out, with no DOM and no server — so every story below is the actual output of
 * the actual code path the application uses. A mark in the wrong place here is
 * a defect in `model/plot.ts`, not in this panel.
 *
 * That is also why the pipeline stories matter. A chart of raw rows exercises
 * scales and marks; a chart of *summarised* rows exercises the thing the
 * workbench is for, and it is the state that is most expensive to reach by
 * clicking — load a source, add a summarize step, choose a group key, choose an
 * aggregate. Here it is one line.
 */
const meta = {
  title: "Component Library/Organisms/ChartPanel",
  component: ChartPanel,
  // The tile has to be wider than the plot. `reset.css` sets
  // `svg { max-width: 100% }`, so a plot drawn at 560px inside a container
  // narrower than that is scaled down and its right-hand content clips — which
  // reads as a broken chart rather than as a story sized wrong. In the
  // application the ResizeObserver measures the real container and buildPlot is
  // given that number, so the two can never disagree.
  parameters: { tile: { width: 700, height: 420 }, pbui: { table: readings } },
  args: { plot: chartPlot(), docId: "d1", colorField: null },
} satisfies Meta<typeof ChartPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Points: Story = {};

/** Every geom the grammar has, over one fixture. */
export const Line: Story = { args: { plot: chartPlot(chartSpec({ geom: "line" })) } };
export const Bar: Story = { args: { plot: chartPlot(chartSpec({ geom: "bar" })) } };
export const Area: Story = { args: { plot: chartPlot(chartSpec({ geom: "area" })) } };

/**
 * A colour channel, so the legend appears and its entries are live.
 *
 * Right-click an entry: the `<cat>` presentation offers "filter to this
 * category", which injects a real step into the pipeline rather than filtering
 * the view.
 */
export const WithALegend: Story = {
  args: {
    plot: chartPlot(
      chartSpec({
        mapping: { x: READINGS.time, y: READINGS.temp, color: READINGS.station, size: null, facet: null },
      }),
    ),
    colorField: READINGS.station,
  },
};

/**
 * **A chart of pipeline output**, which is what the workbench is actually for.
 *
 * One bar per station, showing mean temperature. The rows behind it are not in
 * the source: `evaluate` produced them from a summarize step, and `buildPlot`
 * drew what came out. Both run here exactly as they run in the application.
 */
export const SummarizedByStation: Story = {
  args: {
    plot: chartPlot(
      chartSpec({
        steps: [step.summarize(READINGS.station, "mean", READINGS.temp)],
        geom: "bar",
        mapping: {
          x: READINGS.station,
          y: `mean_${READINGS.temp}`,
          color: null,
          size: null,
          facet: null,
        },
      }),
    ),
  },
};

/** A filtered chart: the same encoding over a quarter of the rows. */
export const Filtered: Story = {
  args: {
    plot: chartPlot(
      chartSpec({
        steps: [step.filter(READINGS.station, "=", "roof")],
        mapping: { x: READINGS.time, y: READINGS.temp, color: READINGS.station, size: null, facet: null },
      }),
    ),
    colorField: READINGS.station,
  },
};

/** Faceted: one panel per station, on shared scales. */
export const Faceted: Story = {
  args: {
    plot: chartPlot(
      chartSpec({
        mapping: { x: READINGS.time, y: READINGS.temp, color: null, size: null, facet: READINGS.station },
      }),
    ),
  },
};

/**
 * **No source.** The first thing anyone sees, and the one that has to say what
 * to do rather than rendering empty axes.
 */
export const NoSource: Story = { args: { plot: null, docId: null } };

export const Loading: Story = { args: { plot: null, loading: true, docId: null } };

/**
 * **A specification that cannot be drawn.**
 *
 * `problems` is non-empty and each entry says which part is missing. Rendering
 * empty axes instead would look like an absence of *data*, which is a different
 * and much more alarming claim.
 */
export const NothingToDrawYet: Story = {
  args: {
    plot: chartPlot(
      chartSpec({ mapping: { x: null, y: null, color: null, size: null, facet: null } }),
    ),
  },
};

/**
 * **The truncation banner**, which must never let a chart look complete when it
 * is not.
 *
 * Note the wording: "of at least N+1". When a table is truncated the server has
 * *proved* a further row exists, because it asks for `limit + 1` and discards
 * the extra.
 */
export const Truncated: Story = {
  args: {
    plot: chartPlot(),
    table: { ...readings, truncated: true, strategy: "latest", row_count: 2000 },
  },
};
