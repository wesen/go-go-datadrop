import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { HintList } from "./HintList";

/**
 * Hints, one press at a time, and never the answer.
 *
 * The ordering is the design: navigational, then conceptual, then mechanical. A
 * reader stuck on *where* a control is should not be handed the reasoning, and
 * one stuck on the reasoning is not helped by being told where to click.
 *
 * `Exhausted` is worth looking at. The terminal message matters more than it
 * seems: without it a reader keeps pressing, expecting the answer, and the
 * moment they realise it is not coming is worse than being told.
 */
const meta = {
  title: "Component Library/Molecules/HintList",
  component: HintList,
  parameters: { tile: false },
  args: { hints: [], shown: 0, onReveal: () => {} },
} satisfies Meta<typeof HintList>;

export default meta;
type Story = StoryObj<typeof meta>;

const HINTS = [
  "No sources tile in this layout? Every tile has an application dropdown in its title bar — or split one with ⬌ and pick from the launcher.",
  "Terns are one of three species. A filter step keeps rows — and right-clicking a Tern mark in the chart writes one for you.",
  "Three islands, one number each: that is group∑ by island, summarising mass_g.",
  "After a group∑ the schema collapses to two columns, so the x and y you had before will need re-pointing.",
  "geom_bar wants the category on x and the aggregate on y.",
];

/** Interactive: press through all five and then past the end. */
export const Interactive: Story = {
  render: () => {
    const [shown, setShown] = useState(0);
    return (
      <div style={{ maxWidth: 360 }}>
        <HintList hints={HINTS} shown={shown} onReveal={() => setShown((n) => n + 1)} />
      </div>
    );
  },
};

export const Untouched: Story = { args: { hints: HINTS, shown: 0 } };
export const TwoRevealed: Story = { args: { hints: HINTS, shown: 2 } };
export const Exhausted: Story = { args: { hints: HINTS, shown: HINTS.length } };
