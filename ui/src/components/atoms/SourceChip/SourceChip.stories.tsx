import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceChip } from "./SourceChip";
import { Stack } from "../../layout";
import { SectionLabel } from "../../foundation";

const meta = {
  title: "Design System/Atoms/SourceChip",
  component: SourceChip,
  parameters: { tile: false },
  args: { source: { kind: "stream", drop: "lab", stream: "temps" } },
} satisfies Meta<typeof SourceChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The two kinds of source, which read as the same kind of object.
 *
 * A stream is live and a dataset file is fixed, but both are things a chart can
 * be pointed at — so both are `<source>` presentations with the same tone, and
 * clicking either loads it.
 */
export const StreamAndDataset: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack gap={2}>
        <SectionLabel>streams</SectionLabel>
        <Stack direction="row" gap={2} wrap>
          <SourceChip source={{ kind: "stream", drop: "lab", stream: "temps" }} />
          <SourceChip source={{ kind: "stream", drop: "lab", stream: "humidity" }} />
        </Stack>
      </Stack>
      <Stack gap={2}>
        <SectionLabel>dataset files</SectionLabel>
        <Stack direction="row" gap={2} wrap>
          <SourceChip
            source={{
              kind: "dataset",
              drop: "lab",
              dataset: "readings",
              version: 3,
              path: "readings.csv",
            }}
          />
          <SourceChip
            source={{
              kind: "dataset",
              drop: "field-trial",
              dataset: "census",
              version: 1,
              path: "data/2026/counts.csv",
            }}
          />
        </Stack>
      </Stack>
    </Stack>
  ),
};
