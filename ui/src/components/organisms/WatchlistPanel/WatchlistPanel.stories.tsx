import type { Meta, StoryObj } from "@storybook/react-vite";
import { WatchlistPanel, type WatchView } from "./WatchlistPanel";
import { READINGS, readings } from "../../../fixtures";

/**
 * Six presentation types in one list — a state no other component produces.
 *
 * This is the reason the watchlist is worth a story at all. Reaching it by
 * clicking means watching six different kinds of object from five different
 * tiles, and nobody has ever done that on purpose.
 */
const MIXED: WatchView[] = [
  { id: "w1", ptype: "field", value: { docId: "d1", name: READINGS.temp } },
  { id: "w2", ptype: "source", value: { kind: "stream", drop: "sensors", stream: "readings" } },
  { id: "w3", ptype: "doc", value: "d1" },
  { id: "w4", ptype: "step", value: "s1" },
  { id: "w5", ptype: "cat", value: { docId: "d1", field: READINGS.station, value: "north" } },
  { id: "w6", ptype: "datum", value: { docId: "d1", row: readings.rows[0] ?? {} } },
];

/**
 * A scratchpad of pinned objects, of any type.
 *
 * The clearest demonstration in the product that presentations are handles
 * rather than pictures: a watched field is still a live field, and right-
 * clicking one here offers the same verbs as right-clicking it in a table
 * header.
 *
 * The panel never switches on the type — it re-presents through the registry,
 * so it works for a type nobody has written yet.
 */
const meta = {
  title: "Component Library/Organisms/WatchlistPanel",
  component: WatchlistPanel,
  parameters: { tile: { width: 500, height: 380 }, pbui: { table: readings } },
  args: { entries: MIXED, onWatch: () => {}, onRemove: () => {} },
} satisfies Meta<typeof WatchlistPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six types at once. Each chip carries its own tone and its own verbs. */
export const MixedTypes: Story = {};

/**
 * Empty, and the prose says what makes the watchlist different from a
 * bookmark: the object stays live.
 */
export const Empty: Story = { args: { entries: [] } };

/** One entry, which is what the list looks like the first time it is used. */
export const OneEntry: Story = { args: { entries: [MIXED[0]!] } };

/**
 * **A type with no descriptor.**
 *
 * `labelFor` falls back to a truncated JSON rendering and `toneFor` to the
 * neutral tone, so an unregistered type degrades to an unremarkable chip rather
 * than to a crash or to "[object Object]".
 *
 * Two presentation types are in exactly this state today — `tile` and
 * `workspace` are declared and have no descriptors — so this is not a
 * hypothetical.
 */
export const AnUndescribedType: Story = {
  args: {
    entries: [{ id: "w7", ptype: "workspace", value: "ws-build" }],
  },
};
