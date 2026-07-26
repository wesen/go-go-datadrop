import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorPanel } from "./InspectorPanel";
import { READINGS } from "../../../fixtures";

/**
 * Whatever was last inspected.
 *
 * The two stories that matter are the empty one and the deep one. Everything
 * between is the same `JSON.stringify` with different content.
 */
const meta = {
  title: "Component Library/Organisms/InspectorPanel",
  component: InspectorPanel,
  parameters: { tile: { width: 460, height: 400 }, pbui: false },
  args: { inspected: null },
} satisfies Meta<typeof InspectorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Nothing inspected — and the prose says how to change that.
 *
 * "Nothing inspected yet" alone would leave a reader with no route forward. The
 * right-click is the least discoverable interaction in the product, so the one
 * empty state guaranteed to be seen early is where it gets named.
 */
export const Empty: Story = {};

/**
 * A field, as its descriptor describes it.
 *
 * Read `statisticsOver`. Every statistic carries the window it was computed
 * over, because a mean over a 2 000-row sample of forty thousand is a different
 * fact from a mean over the lot — and reporting the number without the window
 * is the failure this whole surface exists to avoid.
 */
export const AField: Story = {
  args: {
    inspected: {
      title: "<field>",
      value: {
        presentationType: "field",
        name: READINGS.temp,
        type: "quantitative",
        typeSource: "inferred from the sampled values",
        distinct: 214,
        nullCount: 0,
        statisticsOver: "the loaded window: 360 of at least 361 rows",
        n: 360,
        min: 15.2,
        max: 27.9,
        mean: 21.44,
        sd: 2.61,
      },
    },
  },
};

/**
 * A deeply nested value, which is what a `<datum>` or a snapshot produces.
 *
 * The reason `pre-wrap` and `break-word` are both set: a source reference and a
 * dotted payload name will exceed a narrow tile, and a `<pre>` that does not
 * wrap gives the tile a horizontal scrollbar alongside its vertical one.
 */
export const ADeepObject: Story = {
  args: {
    inspected: {
      title: "<chart>",
      value: {
        presentationType: "chart",
        name: "α @ 18:04",
        at: "2026-07-26T18:04:11.512Z",
        limit: 2000,
        spec: {
          source: { kind: "stream", drop: "sensors", stream: "readings" },
          steps: [
            { id: "s1", kind: "filter", on: true, field: READINGS.temp, op: ">", value: "20" },
            { id: "s2", kind: "summarize", on: true, by: READINGS.station, fn: "mean", field: READINGS.temp },
          ],
          geom: "bar",
          mapping: { x: READINGS.station, y: "mean_data.temp_c", color: null, size: null, facet: null },
          yScale: "linear",
        },
      },
    },
  },
};
