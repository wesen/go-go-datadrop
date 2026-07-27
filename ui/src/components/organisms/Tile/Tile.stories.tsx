import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tile } from "./Tile";
import "../../../apps/all";

/**
 * One tile: a title bar and an application.
 *
 * The tile holds `app` and `docId` and nothing else (DR-11). Everything the
 * application shows lives in the world, which is why swapping two tiles is a
 * two-field exchange and closing one loses nothing.
 *
 * The title bar's six chrome buttons are `IconButton`s as of DATADROP-6 phase 2;
 * `TileButton` survives as a four-line wrapper because every one of them wants
 * the same three defaults.
 */
const meta = {
  title: "Component Library/Organisms/Tile",
  component: Tile,
  parameters: { tile: { width: 420, height: 320 } },
  args: { node: { type: "leaf", id: "l1", app: "about", docId: null } },
} satisfies Meta<typeof Tile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * A document-bound application, which gains a DOC strip.
 *
 * Exactly four applications are document-bound — chart, table, pipeline,
 * encoding — because those four are *views of one composition*.
 */
export const DocumentBound: Story = {
  args: { node: { type: "leaf", id: "l1", app: "pipeline", docId: null } },
};

/**
 * An application id that no longer resolves.
 *
 * A workspace persisted from an older release can name an application that has
 * since been removed. The tile has to say so rather than render an empty frame,
 * because an empty frame reads as a bug in the application rather than as a
 * stale layout.
 */
export const UnknownApplication: Story = {
  args: { node: { type: "leaf", id: "l1", app: "an-app-that-was-removed", docId: null } },
};

/** The narrow case: the title bar has six controls and a title to fit. */
export const Narrow: Story = {
  parameters: { tile: { width: 240, height: 280 } },
  args: { node: { type: "leaf", id: "l1", app: "encoding", docId: null } },
};
