import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * Where a column's type came from, in three letters.
 *
 * It matters because the four sources have very different reliability: a
 * declared schema is authoritative, a guess from sampled values is not, and the
 * difference decides whether a surprising chart is a data problem or an
 * inference problem.
 */
const meta = {
  title: "Design System/Atoms/ProvenanceBadge",
  component: ProvenanceBadge,
  parameters: { tile: false },
  args: { source: "schema" },
} satisfies Meta<typeof ProvenanceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EverySource: Story = {
  render: () => (
    <Stack gap={2}>
      {(["schema", "envelope", "values", "default"] as const).map((source) => (
        <Stack key={source} direction="row" gap={3} align="center">
          <ProvenanceBadge source={source} />
          <Text size="tiny" tone="faint">
            {source}
          </Text>
        </Stack>
      ))}
    </Stack>
  ),
};
