import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ModuleRack } from "./ModuleRack";
import { MODULES } from "../../../tour/modules";
import "../../../apps/all";

/**
 * The whole application vocabulary, one card at a time.
 *
 * **These are the real cards** — `tour/modules.tsx`, all twenty-five of them,
 * the same content §D of the tour renders. `test/tour.test.ts` asserts the ids
 * here and the registry's are the same set, so a new application cannot ship
 * without appearing in this story.
 *
 * The two headings are derived from `AppDescriptor.docBound` rather than
 * written down, which matters beyond tidiness: *if a tile carries a DOC strip
 * it is a view of one document and can be re-pointed; if it does not, it is the
 * whole world and there is only one of it* is the single distinction a reader
 * has to internalise about the shell, and a hand-kept list would eventually
 * disagree with the applications it describes.
 *
 * The import of `apps/all` is the story registering the applications, exactly
 * as the shell does. Without it the rack would render nothing at all and the
 * story would be demonstrating the defensive drop rather than the content.
 */
const meta = {
  title: "Component Library/Organisms/ModuleRack",
  component: ModuleRack,
  parameters: { tile: false, pbui: false },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", height: 560, maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: { modules: MODULES },
} satisfies Meta<typeof ModuleRack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Uncontrolled: the rack manages its own selection. */
export const Default: Story = {};

/** Opening on the pair the format exists for — read the last row of each. */
export const Pipeline: Story = { args: { selected: "pipeline" } };
export const Table: Story = { args: { selected: "table" } };

/**
 * Controlled, with the selection reported.
 *
 * This is the shape §D uses: picking a card calls `onSelect`, and the section
 * re-points its large tile at that application so the card and the thing it
 * describes are on screen together.
 */
export const Controlled: Story = {
  render: (args) => {
    const [selected, setSelected] = useState("chart");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: "var(--pbui-fs-small)", color: "var(--pbui-faint)" }}>
          a tile would now be showing: <strong>{selected}</strong>
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <ModuleRack {...args} selected={selected} onSelect={setSelected} />
        </div>
      </div>
    );
  },
};

/**
 * A card naming an application that is not registered is dropped, not rendered
 * as a ghost — belt and braces behind `test/tour.test.ts`, which fails first.
 */
export const UnknownIdsDropped: Story = {
  args: {
    modules: [
      ...MODULES.slice(0, 3),
      {
        id: "no-such-application",
        what: "should never appear",
        emits: "—",
        accepts: "—",
        lr: "—",
        vs: "—",
      },
    ],
  },
};
