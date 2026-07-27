import type { Meta, StoryObj } from "@storybook/react-vite";
import { GoalItem } from "./GoalItem";

/**
 * One line of the capstone brief.
 *
 * A satisfied goal fades but does not vanish. The list *is* the brief: a reader
 * three goals in needs to see what they have done as much as what is left, and
 * a shrinking list would re-flow under their eye at the moment they look away.
 */
const meta = {
  title: "Component Library/Molecules/GoalItem",
  component: GoalItem,
  parameters: { tile: false },
  args: { done: false, children: "only terns are left in the data" },
} satisfies Meta<typeof GoalItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotYet: Story = {};
export const Satisfied: Story = { args: { done: true } };

/** The brief part-way through. */
export const AList: Story = {
  render: () => (
    <div style={{ maxWidth: 340 }}>
      <GoalItem done>only terns are left in the data</GoalItem>
      <GoalItem done>one number per island — grouped and summarised</GoalItem>
      <GoalItem done={false}>a bar chart that actually draws</GoalItem>
      <GoalItem done={false}>frozen as a snapshot, so it survives what you do next</GoalItem>
      <GoalItem done={false}>
        the evidence beside the picture — a table and a chart, on one document, at once
      </GoalItem>
    </div>
  ),
};
