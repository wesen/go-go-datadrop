import type { Meta, StoryObj } from "@storybook/react-vite";
import { TruncationNotice } from "./TruncationNotice";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { readings } from "../../../fixtures";
import type { Table } from "../../../model/table";

/**
 * The banner that must never let a chart look complete when it is not.
 *
 * It is not dismissible, deliberately: someone who dismisses it and screenshots
 * the chart has produced a misleading artifact.
 */
const meta = {
  title: "Component Library/Molecules/TruncationNotice",
  component: TruncationNotice,
  parameters: { tile: false, pbui: { table: readings } },
  args: { table: readings },
} satisfies Meta<typeof TruncationNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

const truncated = (strategy: "latest" | "head", rows: number): Table => ({
  ...readings,
  truncated: true,
  strategy,
  row_count: rows,
});

/**
 * "at least N+1", never "at least N".
 *
 * When a table is truncated the server has *proved* a further row exists — it
 * asks for `limit + 1` and discards the extra. TruncationBanner.tsx printed
 * `row_count` twice and rendered "showing the most recent 2,000 of at least
 * 2,000 rows": a sentence asserting the sample IS the whole source, inside the
 * banner whose only job is to deny that.
 */
export const BothStrategies: Story = {
  render: () => (
    <Stack gap={4}>
      <TruncationNotice table={truncated("latest", 2000)} />
      <TruncationNotice table={truncated("head", 500)} />
      <Text size="tiny" tone="faint" prose>
        Read the numbers: 2,000 of at least 2,001. The source is presented, so
        "raise the row budget" is reachable by right-click from where the advice
        is read.
      </Text>
    </Stack>
  ),
};

/**
 * Not truncated — the component renders nothing.
 *
 * The empty case is the common one and it has to cost nothing: a container that
 * reserved space for an absent banner would push every chart down by a row.
 */
export const NotTruncated: Story = {
  render: () => (
    <Stack gap={2}>
      <TruncationNotice table={{ ...readings, truncated: false }} />
      <Text size="tiny" tone="faint">
        nothing above this line — the component returns null
      </Text>
    </Stack>
  ),
};
