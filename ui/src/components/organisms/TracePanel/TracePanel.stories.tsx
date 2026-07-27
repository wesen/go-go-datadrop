import type { Meta, StoryObj } from "@storybook/react-vite";
import { TracePanel } from "./TracePanel";
import type { TraceEntry } from "../../../store/world";
import { TRACE_CAP } from "../../../store/world";
import { readings } from "../../../fixtures";

const SESSION: TraceEntry[] = [
  { seq: 1, type: "doc_added", detail: "α" },
  { seq: 2, type: "source_set", detail: "sensors/readings", note: "2 000 row budget" },
  { seq: 3, type: "encoded", detail: "x ↦ time" },
  { seq: 4, type: "encoded", detail: "y ↦ data.temp_c" },
  { seq: 5, type: "geom_set", detail: "geom line" },
  { seq: 6, type: "step_added", detail: "filter data.temp_c > 20" },
  { seq: 7, type: "step_toggled", detail: "filter data.temp_c > 20", note: "off" },
  { seq: 8, type: "snapshotted", detail: "α @ 18:04" },
  { seq: 9, type: "restored", detail: "α @ 18:04 → α" },
  { seq: 10, type: "step_removed", detail: "filter data.temp_c > 20" },
];

/**
 * Every verb, in order.
 *
 * The trace is a teaching surface people screenshot, which is the reason two of
 * these stories exist: what it looks like when it is empty, and what it looks
 * like when it is long enough to have dropped its own beginning.
 */
const meta = {
  title: "Component Library/Organisms/TracePanel",
  component: TracePanel,
  // `pbui: false` until DATADROP-11. The panel had no presentations, so it
  // needed no provider — and when the transport made the current entry a
  // <traceEntry>, every story in this file threw `usePbui outside a
  // PbuiProvider` at render time while `bun test` stayed green, because the
  // test suite never renders a story.
  parameters: { tile: { width: 560, height: 360 }, pbui: { table: readings } },
  args: { entries: SESSION },
} satisfies Meta<typeof TracePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A short session, one entry per accent the panel knows about. */
export const ASession: Story = {};

/**
 * Empty, which is what a fresh tile shows.
 *
 * The prose names two things that produce an entry, because "nothing yet" on
 * its own does not tell a reader what would change that.
 */
export const Empty: Story = { args: { entries: [] } };

/**
 * **At the cap.**
 *
 * The world slice holds `TRACE_CAP` entries and drops from the front, so a long
 * session's trace starts at a sequence number well above 1. That is deliberate
 * — the numbers are the world's sequence, not the panel's row index, so a gap
 * at the top is evidence of dropping rather than of a bug.
 *
 * The gutter is fixed-width and right-aligned, which is why four-digit
 * sequences do not shift the badges beside them.
 */
export const AtTheCap: Story = {
  args: {
    entries: Array.from({ length: TRACE_CAP }, (_, i) => ({
      seq: 1_284 + i,
      type: i % 3 === 0 ? "encoded" : i % 3 === 1 ? "step_added" : "doc_activated",
      detail: `entry ${i}`,
    })),
  },
};

/**
 * An unknown event type falls back to the alt surface.
 *
 * A verb added to the world slice without a tone here appears unremarkable
 * rather than borrowing the colour of a kind it is not — which is the failure
 * a default accent would produce silently.
 */
export const AnUnknownType: Story = {
  args: {
    entries: [
      ...SESSION.slice(0, 3),
      { seq: 4, type: "workspace_renamed", detail: "build → analysis" },
    ],
  },
};
