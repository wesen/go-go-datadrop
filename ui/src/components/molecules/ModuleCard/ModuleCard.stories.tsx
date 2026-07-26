import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModuleCard } from "./ModuleCard";

/**
 * One application's reference card.
 *
 * Compare `Pipeline` and `Table` below and read only the last row. The pair is
 * the most-confused pair in the system, and each card names the other: *that is
 * the recipe, this is the food.* That row is why the format is five fixed slots
 * rather than free prose — a fixed slot forces the author of a new card to
 * answer the question rather than skip it.
 *
 * `NoNearNeighbour` shows what an honest empty answer looks like. "Nothing —
 * this one is not mistaken for anything" is information: usually it means the
 * application has no near neighbour, and occasionally that nobody has a model
 * of it at all.
 */
const meta = {
  title: "Component Library/Molecules/ModuleCard",
  component: ModuleCard,
  parameters: { tile: false },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 380 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "pipeline",
    what: "The chain of verbs that produces the data: filter, derive, group∑, sort, limit.",
    emits: "<step> per row, <field> in the OUT schema, <source> as SOURCE.",
    accepts: "<field> — “+ filter…” and “+ group∑…” pause and wait for you to click one.",
    lr: "✓ disables a step in place; R gives move ↑↓ and remove. Order is semantics.",
    vs: "an undo history. Steps are objects you can reorder, not events that happened.",
  },
} satisfies Meta<typeof ModuleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pipeline: Story = {};

/** The other half of the most-confused pair. */
export const Table: Story = {
  args: {
    title: "table",
    what: "The pipeline's live output relation, after every enabled step.",
    emits: "<field> in the headers, <datum> in the row-number cells.",
    accepts: "—",
    lr: "R a row № to keep or exclude its categories; R a header to map or sort by it.",
    vs: "the pipeline — that is the recipe, this is the food.",
  },
};

/** Most rows are “—”, which is a real answer and not a gap. */
export const MostlyEmpty: Story = {
  args: {
    title: "inspector",
    what: "The full description of the last object you inspected, printed as data.",
    emits: "—",
    accepts: "—",
    lr: "Fed by the Inspect verb, which every object type offers.",
    vs: "a properties panel. It is a reader, not an editor.",
  },
};

/** A long `what` wrapping under a narrow rail — the width the rack really gets. */
export const Narrow: Story = {
  args: {
    title: "upload",
    what: "Dataset upload: hash, mount, send, commit — resumable, and honest about which stage failed.",
    emits: "<upload> per queued file.",
    accepts: "—",
    lr: "A draft survives a reload; the queue says which stage each file reached.",
    vs: "a file picker. The four stages are separately observable because they fail separately.",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 260 }}>
        <Story />
      </div>
    ),
  ],
};
