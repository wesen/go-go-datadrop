import type { Meta, StoryObj } from "@storybook/react-vite";
import { TemplateTable, type TemplateView } from "./TemplateTable";

/**
 * The stored template library.
 *
 * Note what is **not** here: a `<Presentation ptype="template">`. A fourth
 * presentation type is possible and is not worth it — a template is a stored
 * file, not an object in the interface that other objects can accept — so the
 * row's four buttons are the whole vocabulary and a menu would be a second way
 * to reach them. The restraint is recorded so the question is not reopened.
 */
const meta = {
  title: "Component Library/Organisms/TemplateTable",
  component: TemplateTable,
  parameters: { tile: { width: 760, height: 420 } },
  args: {
    templates: [],
    usage: { count: 0, limit: 50, kb: 0, limitKb: 2048 },
    onLoad: () => {},
    onCopy: () => {},
    onRename: () => {},
    onDelete: () => {},
    onImport: () => {},
  },
} satisfies Meta<typeof TemplateTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const TEMPLATES: TemplateView[] = [
  {
    id: "t1",
    name: "weekly sensor review",
    kind: "workspace",
    savedAt: "2026-07-24T09:12:00.000Z",
    summary: "A workspace “weekly sensor review”: 3 tiles, 1 document, reading sensors / readings.",
    apps: ["sources", "chart", "table"],
  },
  {
    id: "t2",
    name: "raw feed, unfiltered",
    kind: "tile",
    savedAt: "2026-07-22T16:40:00.000Z",
    summary: "A tile: table on a document called α, reading sensors / readings.",
    apps: ["table"],
  },
  {
    id: "t3",
    name: "client demo",
    kind: "stage",
    savedAt: "2026-07-19T11:02:00.000Z",
    summary: "A stage “client demo”: 2 workspaces, 5 tiles, 2 documents, reading census / 2024.",
    apps: ["chart", "table", "pipeline", "encode", "sources"],
  },
];

/** A few saved, none expanded. */
export const Populated: Story = {
  args: { templates: TEMPLATES, usage: { count: 3, limit: 50, kb: 8, limitKb: 2048 } },
};

/**
 * **Empty**, which is what every user sees on their first visit.
 *
 * The message says what is true and the hint says what to do about it — the
 * distinction `EmptyState` exists for. "No stored templates" alone answers "is
 * this broken?" and leaves the only real question unanswered.
 */
export const Empty: Story = {};

/**
 * The awkward mode: the library is full.
 *
 * Reaching this by clicking means saving fifty templates. The refusal is a
 * sentence naming the limit — "50 templates is the limit — delete one first" —
 * because the alternative is a save button that silently does nothing at the
 * fiftieth press.
 */
export const Full: Story = {
  args: {
    templates: TEMPLATES,
    usage: { count: 50, limit: 50, kb: 1980, limitKb: 2048 },
    message: "50 templates is the limit — delete one first",
  },
};

/**
 * A long name, which is the overflow case a table like this actually meets.
 *
 * The name truncates with an ellipsis and keeps its `title`; the kind badge and
 * the date must not be pushed off the row, because they are how a reader tells
 * two similarly-named templates apart.
 */
export const LongName: Story = {
  args: {
    templates: [
      {
        ...(TEMPLATES[0] as TemplateView),
        name: "weekly sensor review — north and south stations, temperature only, filtered above 20°C",
      },
      ...TEMPLATES.slice(1),
    ],
    usage: { count: 3, limit: 50, kb: 8, limitKb: 2048 },
  },
};
