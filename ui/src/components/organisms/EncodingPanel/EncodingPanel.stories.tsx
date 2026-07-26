import type { Meta, StoryObj } from "@storybook/react-vite";
import { EncodingPanel } from "./EncodingPanel";
import { READINGS, chartSpec, readings, step, tableAfter } from "../../../fixtures";

/**
 * The aesthetic mapping, and the three states that need a specific dataset to
 * reach.
 *
 * `logUnavailable` and `staleChannels` are props rather than computations
 * because both need rows, and rows do not belong in a panel. That is what makes
 * them one line of args here instead of a source that has to be loaded and a
 * pipeline that has to be built.
 */
const meta = {
  title: "Component Library/Organisms/EncodingPanel",
  component: EncodingPanel,
  parameters: { tile: { width: 460, height: 480 }, pbui: { table: readings } },
  args: {
    docId: "d1",
    geom: "point",
    yScale: "linear",
    mapping: {
      x: READINGS.time,
      y: READINGS.temp,
      color: READINGS.station,
      size: null,
      facet: null,
    },
    onGeom: () => {},
    onAccept: () => {},
    onClear: () => {},
    onYScale: () => {},
  },
} satisfies Meta<typeof EncodingPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three of five channels mapped, which is the ordinary state. */
export const Mapped: Story = {};

/**
 * Nothing mapped: every channel shows its ⌖ and nothing else.
 *
 * The state a new document opens in, and the one that has to make the accept
 * affordance findable without any prose telling you to look for it.
 */
export const NothingMapped: Story = {
  args: { mapping: { x: null, y: null, color: null, size: null, facet: null } },
};

/**
 * **A stale mapping.**
 *
 * `colour` names a field the pipeline no longer produces — here because a
 * summarize dropped every column except the group key and the aggregate. The
 * row renders the dead name marked stale rather than blanking the control,
 * because a blank control and a wrong specification look identical and only one
 * of them is recoverable by the user.
 *
 * Reaching this by clicking means building a chart, mapping colour, then adding
 * a summarize that eats the column. Nobody does that on purpose.
 */
const summarized = chartSpec({
  steps: [step.summarize(READINGS.station, "mean", READINGS.temp)],
});

export const StaleMapping: Story = {
  parameters: { pbui: { table: tableAfter(summarized) } },
  args: {
    mapping: {
      x: READINGS.station,
      y: "mean_data.temp_c",
      color: READINGS.humidity,
      size: null,
      facet: null,
    },
    staleChannels: ["color"],
  },
};

/**
 * **A log scale that cannot be used.**
 *
 * A log scale needs a strictly positive y domain. The button is disabled and
 * says why, in a tooltip and in prose beside it, rather than being hidden — a
 * control that vanishes teaches nothing about the rule that removed it.
 *
 * `plot.ts` also falls back if a log scale somehow survives to it. Two lines of
 * defence, and this is the one the user can learn from.
 */
export const LogScaleUnavailable: Story = {
  args: { logUnavailable: true, yScale: "linear" },
};

/** Every geom in turn, for a look at the selected treatment. */
export const GeomBar: Story = {
  args: { geom: "bar" },
};

/**
 * A faceted, sized chart: all five channels in use at once.
 *
 * The row that is easy to get wrong is `facet`, which accepts only nominal and
 * temporal fields — the constraint is enforced by the accept filter in the
 * container, so this story is showing the result rather than the rule.
 */
export const EveryChannelMapped: Story = {
  args: {
    mapping: {
      x: READINGS.time,
      y: READINGS.temp,
      color: READINGS.station,
      size: READINGS.humidity,
      facet: READINGS.station,
    },
  },
};
