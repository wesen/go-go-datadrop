import type { Meta, StoryObj } from "@storybook/react-vite";
import { GalleryPanel, type SnapshotView } from "./GalleryPanel";
import { READINGS, chartSpec, readings, step } from "../../../fixtures";

const SNAPSHOTS: SnapshotView[] = [
  {
    id: "s1",
    name: "α @ 18:04",
    at: "2026-07-26T18:04:11.512Z",
    limit: 2000,
    spec: chartSpec({ steps: [step.filter(READINGS.temp, ">", "20")] }),
  },
  {
    id: "s2",
    name: "by station",
    at: "2026-07-26T18:31:02.004Z",
    limit: 2000,
    spec: chartSpec({
      geom: "bar",
      steps: [step.summarize(READINGS.station, "mean", READINGS.temp)],
      mapping: { x: READINGS.station, y: "mean_data.temp_c", color: null, size: null, facet: null },
    }),
  },
];

/**
 * Frozen specifications.
 *
 * A snapshot holds no rows — it holds how to get them, plus the row budget so a
 * restore reproduces the same window. Every summary line here is rendered by
 * `SpecSummary` over `specFacts`, which is also what the compare tile reads, so
 * a snapshot cannot be described one way on its card and another way in a diff.
 */
const meta = {
  title: "Component Library/Organisms/GalleryPanel",
  component: GalleryPanel,
  parameters: { tile: { width: 520, height: 480 }, pbui: { table: readings } },
  args: {
    snapshots: SNAPSHOTS,
    pins: [null, null],
    activeDocName: "α",
    onRestore: () => {},
    onPin: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof GalleryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two snapshots, neither pinned. */
export const Populated: Story = {};

/**
 * Empty, and it says where snapshots come from.
 *
 * "No snapshots" alone leaves a reader with nowhere to go; the ⚑ is in another
 * tile, so the empty state has to name it.
 */
export const Empty: Story = { args: { snapshots: [] } };

/**
 * **Both slots pinned.**
 *
 * The markers are worded — "pinned A", "pinned B" — rather than being a colour,
 * and the compare tile names them identically. A position is not a hue, and a
 * reader who cannot separate the two tones still has to know which is which.
 */
export const BothPinned: Story = { args: { pins: ["s1", "s2"] } };

/**
 * A snapshot whose source is gone.
 *
 * Restoring it produces a document that reports the problem rather than a blank
 * tile — the card itself is unremarkable, which is the point: a snapshot is a
 * specification, and a specification naming a source that no longer exists is
 * still a valid specification.
 */
export const ASourcelessSnapshot: Story = {
  args: {
    snapshots: [
      {
        ...SNAPSHOTS[0]!,
        name: "from a deleted drop",
        spec: chartSpec({ source: { kind: "stream", drop: "", stream: "" } }),
      },
    ],
  },
};
