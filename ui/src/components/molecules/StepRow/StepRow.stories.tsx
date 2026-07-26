import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepRow } from "./StepRow";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const noop = () => {};

const meta = {
  title: "Component Library/Molecules/StepRow",
  component: StepRow,
  parameters: { tile: false },
  args: {
    kind: "filter",
    label: "temp_c > 20",
    enabled: true,
    canMoveUp: true,
    onToggle: noop,
    onMoveUp: noop,
    onRemove: noop,
  },
} satisfies Meta<typeof StepRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every verb the pipeline has, as it appears in the editor. */
export const EveryKind: Story = {
  render: () => (
    <Stack gap={2}>
      <StepRow
        kind="filter"
        label="temp_c > 20"
        enabled
        canMoveUp={false}
        onToggle={noop}
        onMoveUp={noop}
        onRemove={noop}
      />
      <StepRow
        kind="derive"
        label="delta = temp_c - baseline"
        enabled
        canMoveUp
        onToggle={noop}
        onMoveUp={noop}
        onRemove={noop}
      />
      <StepRow
        kind="summarize"
        label="by station, mean of temp_c"
        enabled
        canMoveUp
        onToggle={noop}
        onMoveUp={noop}
        onRemove={noop}
      />
      <StepRow
        kind="sort"
        label="temp_c desc"
        enabled
        canMoveUp
        onToggle={noop}
        onMoveUp={noop}
        onRemove={noop}
      />
      <StepRow
        kind="limit"
        label="first 100 rows"
        enabled
        canMoveUp
        onToggle={noop}
        onMoveUp={noop}
        onRemove={noop}
      />
    </Stack>
  ),
};

/**
 * The first step cannot move up.
 *
 * Disabled rather than absent, so the row keeps its shape and the buttons stay
 * aligned down the column.
 */
export const FirstStep: Story = { args: { canMoveUp: false } };

/**
 * A step switched off.
 *
 * Dimmed, not hidden. Toggling a filter off and looking at it beside its
 * neighbours is how a pipeline is debugged; removing it from the list would
 * make the state unreachable except by re-adding the step.
 */
export const Disabled: Story = { args: { enabled: false } };

/**
 * A long label in a narrow tile.
 *
 * The spacer collapses before the buttons do, which is the property that keeps
 * the controls reachable when the pipeline editor is in a 240px split.
 */
export const Narrow: Story = {
  render: () => (
    <Stack gap={2}>
      <div style={{ width: 280, border: "var(--pbui-border-hair)", padding: 4 }}>
        <StepRow
          kind="derive"
          label="normalised = (temp_c - baseline) / spread"
          enabled
          canMoveUp
          onToggle={noop}
          onMoveUp={noop}
          onRemove={noop}
        />
      </div>
      <Text size="tiny" tone="faint">
        the ↑ and ✕ stay on the row
      </Text>
    </Stack>
  ),
};
