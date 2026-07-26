import type { Meta, StoryObj } from "@storybook/react-vite";
import { TourSection } from "./TourSection";
import "../../../apps/all";
import {
  MODULES,
  TOUR_FIXTURES,
  briefGoals,
  briefHints,
  briefQuestion,
  briefSeed,
  grammarLessons,
  grammarSeed,
  objectsLessons,
  rackSeed,
  objectsSeed,
} from "../../../tour";

/**
 * One section of the tour, in each of its shapes.
 *
 * **These are live and they are the real content.** The workbench is the real
 * shell over its own store, answering from committed fixtures; the lessons are
 * the ones the page ships. Press ▶ and the tiles beside the rail move, or do
 * the move yourself and the tick goes green instead of grey.
 *
 * The rail, the rack, the brief and the cheat sheet are **tiles**. Close the
 * lessons tile, split it, swap it for the trace — the thing teaching you about
 * the shell is part of the shell. Press ⤢ in the chrome to fill the window when
 * a section gets crowded.
 *
 * ↺ resets by remounting the subtree, which throws away the store *and* the
 * rail's completion state together. Try it: complete a step, press ↺, and both
 * the world and the ticks go back.
 */
const meta = {
  title: "Applications/Tour/Section",
  component: TourSection,
  parameters: {
    tile: false,
    layout: "fullscreen",
    // The section brings its own PbuiProvider, inside the instance.
    pbui: false,
    a11y: { config: { rules: [{ id: "region", enabled: true }] } },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 20, maxWidth: 1180 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    id: "objects",
    tag: "A",
    title: "Objects and verbs",
    blurb: "",
    config: {},
  },
} satisfies Meta<typeof TourSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A lesson rail beside a workbench — the shape §A, §B and §C all use. */
export const WithRail: Story = {
  args: {
    blurb:
      "Whatever is displayed stays a first-class handle on the real object. It carries its type, so it carries a menu of verbs appropriate to that type.",
    config: {
      fixtures: TOUR_FIXTURES,
      preloaded: objectsSeed(),
      apps: ["sources", "inspector", "watch", "trace", "lessons", "cheat", "launcher"],
      workspaces: false,
    },
    lessons: objectsLessons,
    cheat: {
      title: "Objects",
      rows: [
        ["hover", "the doc line names the object and what L and R will do"],
        ["right-click", "every verb this type has"],
        ["red banner", "a command is accepting an argument · Esc aborts"],
      ],
    },
  },
};

/** §C, whose four-way split is why a section names its own height (DR-51). */
export const TheGrammar: Story = {
  args: {
    id: "grammar",
    tag: "C",
    title: "The grammar of graphics",
    blurb:
      "A chart is not a type you pick from a menu. It is a composition — source ⊳ steps ↦ mapping · geom · scale — editable from either end.",
    tall: true,
    config: {
      fixtures: TOUR_FIXTURES,
      preloaded: grammarSeed(),
      apps: ["chart", "table", "pipeline", "encode", "sources", "lessons", "cheat", "launcher"],
      workspaces: false,
    },
    lessons: grammarLessons,
  },
};

/** §D: a rack instead of a rail. Picking a card re-points the chart tile. */
export const WithRack: Story = {
  args: {
    id: "modules",
    tag: "D",
    title: "The modules",
    blurb:
      "Twenty-five applications share one world. If a tile carries a DOC strip it is a view of a single document; if it does not, it is the whole world.",
    config: { fixtures: TOUR_FIXTURES, preloaded: rackSeed(), workspaces: false },
    modules: MODULES,
    cheat: {
      title: "Modules",
      rows: [
        ["doc-bound", "chart · table · pipeline · encoding"],
        ["emits", "which presentation types are born in this tile"],
        ["the pairs", "pipeline≠table · charts≠snapshots · watchlist≠inspector"],
      ],
    },
  },
};

/** The capstone: no rail, no ▶, five goals that watch the world. */
export const TheBrief: Story = {
  args: {
    id: "brief",
    tag: "✦",
    title: "The brief",
    blurb:
      "A question, a workbench, and five things that have to be true when you are finished. They tick by watching the world, not by watching you.",
    tall: true,
    config: { fixtures: TOUR_FIXTURES, preloaded: briefSeed() },
    brief: { question: briefQuestion, goals: briefGoals, hints: briefHints },
  },
};
