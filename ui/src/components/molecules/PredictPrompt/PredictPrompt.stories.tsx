import type { Meta, StoryObj } from "@storybook/react-vite";
import { PredictPrompt } from "./PredictPrompt";

/**
 * The question that makes the answer land.
 *
 * Click an option to see the reveal. There is no reset and no second attempt —
 * a second attempt turns a prediction into a quiz, and the point was never the
 * score.
 *
 * The two shipped here are the real ones from tracks A and C. The geom question
 * is the one that does the most work: most readers guess "it buckets the
 * numbers for you", and being wrong is what makes the reveal an argument rather
 * than a fact.
 */
const meta = {
  title: "Component Library/Molecules/PredictPrompt",
  component: PredictPrompt,
  parameters: { tile: false },
  args: {
    question: "Right-click the seabirds chip instead of a field. Do you get the same menu?",
    options: ["the same menu", "a different menu"],
    answer: 1,
    reveal:
      "A source is a different type, so it offers different verbs. The menu is not attached to the pixel; it is attached to what the pixel is.",
  },
} satisfies Meta<typeof PredictPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unanswered: Story = {};

/** The one that carries a design argument. */
export const TheGeomQuestion: Story = {
  args: {
    question:
      "A bar geom needs categories on x. x is currently wing_mm, a measurement. What happens?",
    options: ["it buckets the numbers for you", "it says what is wrong"],
    answer: 1,
    reveal:
      "Guessing would be worse than useless — you would get a chart you had not asked for and could not reason about. Instead the spec reports that it does not describe a drawable chart, and names the reason.",
  },
};

/** Three options, to check the row wraps rather than overflowing a narrow rail. */
export const ThreeOptions: Story = {
  args: {
    question:
      "Two tiles are pointed at one document. You re-point the right-hand one. What happens to the left?",
    options: ["it follows", "it is unchanged", "both reset"],
    answer: 1,
    reveal:
      "They were only moving together because they looked at the same document. Nothing was ever wired between the tiles.",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
};
