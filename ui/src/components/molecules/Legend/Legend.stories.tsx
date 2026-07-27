import type { Meta, StoryObj } from "@storybook/react-vite";
import { Legend } from "./Legend";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * What the colours mean.
 *
 * The entries carry *resolved* colours, not token names, because `buildPlot`
 * is pure and puts a concrete colour on each mark. A legend that disagrees with
 * its marks is a bug that survives review, because both halves look right in
 * isolation.
 */
const meta = {
  title: "Component Library/Molecules/Legend",
  component: Legend,
  parameters: { tile: false },
  args: { title: "station", entries: [] },
} satisfies Meta<typeof Legend>;

export default meta;
type Story = StoryObj<typeof meta>;

const entries = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    label: ["north", "south", "east", "west", "central", "coastal", "inland", "alpine"][i]!,
    color: `var(--pbui-cat-${i + 1})`,
    value: i,
  }));

export const Populated: Story = {
  render: () => <Legend title="station" entries={entries(4)} />,
};

/**
 * More categories than the palette has colours.
 *
 * Eight get a colour and the rest are drawn neutral. Saying so is the
 * difference between "the chart is wrong" and "the chart is showing you eight
 * of sixty" — and the count is the only honest way to say it, because listing
 * fifty-two grey entries would be worse than saying nothing.
 */
export const Overflowing: Story = {
  render: () => (
    <Stack gap={3}>
      <Legend title="station" entries={entries(8)} overflow={52} />
      <Text size="tiny" tone="faint" prose>
        The palette has eight colours. A field with sixty distinct values gets eight of them.
      </Text>
    </Stack>
  ),
};

/**
 * Entries with no title.
 *
 * `buildPlot` produces `legendTitle: null` when there is no colour channel to
 * name. The label is omitted rather than rendered empty — a heading above
 * content it does not name is worse than no heading.
 */
export const NoTitle: Story = {
  render: () => <Legend title={null} entries={entries(3)} />,
};

/**
 * Empty renders nothing at all.
 *
 * A chart with no colour channel has no legend, and reserving space for an
 * absent one would shift every unmapped chart sideways.
 */
export const Empty: Story = {
  render: () => (
    <Stack gap={2}>
      <Legend title="station" entries={[]} />
      <Text size="tiny" tone="faint">
        nothing above this line
      </Text>
    </Stack>
  ),
};

/**
 * The DR-38 seam.
 *
 * ChartApp makes each entry a live `<cat>` presentation — right-click it and
 * you get "filter to this category". A molecule that wrapped itself in
 * `Presentation` would need a provider in every story; instead the caller
 * passes a function. Here the wrapper is a visible outline so the seam is
 * legible.
 */
export const WithACustomEntryRenderer: Story = {
  render: () => (
    <Legend
      title="station"
      entries={entries(3)}
      renderEntry={(entry, body) => (
        <span
          style={{ outline: "1px dotted var(--pbui-line)", display: "inline-block" }}
          title={`the caller wrapped ${entry.label}`}
        >
          {body}
        </span>
      )}
    />
  ),
};
