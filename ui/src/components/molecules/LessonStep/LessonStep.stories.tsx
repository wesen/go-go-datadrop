import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LessonStep } from "./LessonStep";
import { Button } from "../../atoms";
import { Text } from "../../foundation";

/**
 * One row of a lesson rail, in every state at once.
 *
 * Which is the reason this is a component and not part of `LessonRail`: a rail
 * can only show the states its reader has actually reached, so `Watched` — the
 * state that exists to distinguish pressing ▶ from doing the thing — would
 * never appear in a story of the rail unless the story pressed ▶.
 */
const meta = {
  title: "Component Library/Molecules/LessonStep",
  component: LessonStep,
  parameters: { tile: false },
  args: {
    n: 2,
    title: "Right-click gives every verb",
    state: "pending",
    open: false,
    onToggle: () => {},
    children:
      "Right-click the mass_g chip. The menu you get is the list of things a field can do.",
  },
} satisfies Meta<typeof LessonStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Open: Story = {
  args: {
    open: true,
    actions: (
      <>
        <Button variant="raised">▶ do it for me</Button>
        <Text size="tiny" tone="faint">
          — or do it yourself, and this ticks green
        </Text>
      </>
    ),
  },
};

/** Completed by the reader's own hand. */
export const Self: Story = { args: { state: "self", open: true } };

/**
 * Completed after pressing ▶.
 *
 * Grey tick, a WATCHED label, and a line telling them to try it by hand. The
 * label is text rather than colour because grey-versus-green is a distinction
 * a colour-blind reader may not make and a printed page will not carry at all.
 */
export const Watched: Story = {
  args: {
    state: "watched",
    open: true,
    actions: (
      <Text size="tiny" tone="faint">
        you watched this one. try the same move by hand in the panel.
      </Text>
    ),
  },
};

/** A step with no predicate — reading, not doing — so a "✓ got it" stands in. */
export const Manual: Story = {
  args: {
    n: 1,
    title: "Pointing is asking",
    open: true,
    children:
      "Sweep the pointer across the field chips and watch the black line at the bottom of the panel.",
    actions: <Button variant="raised" fill="var(--pbui-tone-source)">✓ got it</Button>,
  },
};

/** Four rows as a rail shows them, one of them open. */
export const AsARail: Story = {
  render: () => {
    const [open, setOpen] = useState<number | null>(3);
    const rows: Array<{ n: number; title: string; state: "pending" | "self" | "watched" }> = [
      { n: 1, title: "Pointing is asking", state: "self" },
      { n: 2, title: "Right-click gives every verb", state: "watched" },
      { n: 3, title: "Left-click does the obvious thing", state: "pending" },
      { n: 4, title: "Accept: a command reaching for its argument", state: "pending" },
    ];
    return (
      <div style={{ border: "var(--pbui-border-firm)", background: "var(--pbui-pane)" }}>
        {rows.map((row) => (
          <LessonStep
            key={row.n}
            n={row.n}
            title={row.title}
            state={row.state}
            open={open === row.n}
            onToggle={() => setOpen(open === row.n ? null : row.n)}
          >
            The prose for step {row.n}. Bold names things on screen; Kbd names controls.
          </LessonStep>
        ))}
      </div>
    );
  },
};
