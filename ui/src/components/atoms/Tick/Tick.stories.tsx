import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tick } from "./Tick";

/**
 * The three states a lesson step can be in, and the reason the third exists.
 *
 * `Watched` is the interesting one. A reader who pressed ▶ *do it for me* and
 * then satisfied the predicate has completed the step without performing it,
 * and the rail says so rather than crediting them. See them side by side below:
 * the difference has to be visible at a glance and in greyscale, because it is
 * the difference between progress and the appearance of it.
 */
const meta = {
  title: "Design System/Atoms/Tick",
  component: Tick,
  parameters: { tile: false },
  args: { state: "pending", n: 3 },
} satisfies Meta<typeof Tick>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Not started: the step's number, so the rail is countable before it is done. */
export const Pending: Story = {};

/** Completed by the reader's own hand. */
export const Self: Story = { args: { state: "self" } };

/** Completed after pressing ▶ — quieter, and labelled by the rail beside it. */
export const Watched: Story = { args: { state: "watched" } };

/** The rail as a reader part-way through would see it. */
export const AColumn: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Tick state="self" n={1} />
      <Tick state="watched" n={2} />
      <Tick state="self" n={3} />
      <Tick state="pending" n={4} />
      <Tick state="pending" n={5} />
    </div>
  ),
};
