import type { Meta, StoryObj } from "@storybook/react-vite";
import { LessonRail } from "./LessonRail";
import type { Lesson } from "../../../appkit/lessons";
import { Kbd } from "../../foundation";
import { worldActions } from "../../../store/world";
import { newStep } from "../../../model/pipeline";
import { readings } from "../../../fixtures";

/**
 * A rail whose steps tick themselves off by watching the world.
 *
 * **These are live.** The decorator supplies a real store, so pressing
 * ▶ *do it for me* dispatches real actions, the predicate then sees real state,
 * and the step ticks — grey, because you watched it. Add a document by any
 * other route and step 2 ticks green instead.
 *
 * That is the property the whole teaching layer rests on and the one worth
 * checking by hand: **any route counts**. A rail cannot know how you got there
 * and does not try.
 */
const meta = {
  title: "Component Library/Organisms/LessonRail",
  component: LessonRail,
  parameters: {
    tile: false,
    // The rail reads the store directly, so the decorator's fake environment
    // would be describing a world nothing is using.
    pbui: {},
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", height: 420, maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
  args: { lessons: [] },
} satisfies Meta<typeof LessonRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Four steps covering every shape a lesson can take.
 *
 * Note what step 2's predicate does NOT say: it does not check that the ▶
 * button was pressed, or that a particular action was dispatched. It asks
 * whether the world has more than one document. Any route there counts.
 */
const LESSONS: Lesson[] = [
  {
    id: "l1",
    title: "Pointing is asking",
    manual: true,
    body: (
      <>
        Sweep the pointer slowly across the field chips and watch the{" "}
        <strong>black line at the bottom of the panel</strong>. It never stops telling you what you
        are pointing at and what a click will do. Nothing here has to be memorised, because the
        screen describes itself as you move.
      </>
    ),
  },
  {
    id: "l2",
    title: "A second document",
    body: (
      <>
        Press <Kbd>＋</Kbd> in any document strip, or use ▶. Either way this ticks — the predicate
        asks the world how many documents it holds, not which button you pressed.
      </>
    ),
    run: ({ dispatch }) => {
      dispatch(worldActions.newDoc(null));
    },
    done: (state) => state.world.docOrder.length > 1,
    predict: {
      q: "You are about to add a second document. Does the first one change?",
      options: ["yes, they share a spec", "no, they are separate"],
      answer: 1,
      reveal:
        "A document is an identity plus a specification. Adding one creates a new specification; nothing about the first is touched.",
    },
  },
  {
    id: "l3",
    title: "A step in the pipeline",
    body: <>Add any step. The predicate counts steps on the active document.</>,
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      // `newStep` picks sensible defaults from the fields it is given, which is
      // why it takes a schema rather than a literal: a filter step with a field
      // name nothing produces is not a step, it is a typo.
      dispatch(worldActions.addStep({ docId, step: newStep("filter", readings.fields) }));
    },
    done: (state) => {
      const doc = state.world.activeDocId ? state.world.docs[state.world.activeDocId] : undefined;
      return (doc?.spec.steps.length ?? 0) > 0;
    },
  },
  {
    id: "l4",
    title: "Everything you did is on the record",
    manual: true,
    body: (
      <>
        The <strong>trace</strong> has been filling since step one without being mentioned. Every
        verb — yours or the tutorial&apos;s — is appended with the object it acted on. Not a debug
        log: a transcript of the session.
      </>
    ),
  },
];

export const Default: Story = { args: { lessons: LESSONS } };

/** With a ↺, which resets by remounting the whole panel rather than by undoing. */
export const WithReset: Story = {
  args: { lessons: LESSONS, onReset: () => window.location.reload() },
};

/** A single manual step: the smallest rail that is still a rail. */
export const OneStep: Story = {
  args: { lessons: [LESSONS[0] as Lesson] },
};
