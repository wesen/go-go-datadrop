import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "./Stack";
import { Surface } from "../Surface";
import { Text } from "../../foundation";

const meta = {
  title: "Design System/Layout/Stack",
  component: Stack,
  parameters: { tile: false },
  args: { children: null },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

const Box = ({ children }: { children: string }) => (
  <Surface tone="alt" border="hair" padding={2}>
    <Text size="small">{children}</Text>
  </Surface>
);

/** The six-step gap scale, which is the prototype's real values rather than a
 *  doubling series: 2, 4, 6, 10, 16, 24. */
export const Gaps: Story = {
  render: () => (
    <Stack gap={4}>
      {([0, 1, 2, 3, 4, 5] as const).map((gap) => (
        <Stack key={gap} gap={1}>
          <Text size="tiny" tone="faint">
            gap={gap}
          </Text>
          <Stack direction="row" gap={gap}>
            <Box>a</Box>
            <Box>b</Box>
            <Box>c</Box>
          </Stack>
        </Stack>
      ))}
    </Stack>
  ),
};

export const Directions: Story = {
  render: () => (
    <Stack direction="row" gap={4}>
      <Stack gap={2}>
        <Text size="tiny" tone="faint">
          column
        </Text>
        <Box>a</Box>
        <Box>b</Box>
      </Stack>
      <Stack direction="row" gap={2} align="start">
        <Box>a</Box>
        <Box>b</Box>
      </Stack>
    </Stack>
  ),
};

/**
 * The bug this component exists to prevent.
 *
 * A flex child defaults to `min-width: auto`, which refuses to shrink below its
 * content — so one long dotted field path pushes a tile wider than its split
 * allows and the whole layout drifts. `min-width: 0` is on the base class, so
 * the text below ellipsises instead of forcing the 220px box open.
 */
export const LongContentDoesNotBlowOutTheBox: Story = {
  render: () => (
    <div style={{ width: 220, border: "var(--pbui-border-firm)" }}>
      <Stack direction="row" gap={2}>
        <Box>fixed</Box>
        <Text truncate title="deployment/region/zone/instance/metric">
          deployment/region/zone/instance/metric
        </Text>
      </Stack>
    </div>
  ),
};

export const Wrapping: Story = {
  render: () => (
    <div style={{ width: 260, border: "var(--pbui-border-hair)" }}>
      <Stack direction="row" gap={2} wrap>
        {Array.from({ length: 9 }, (_, i) => (
          <Box key={i}>{`item ${i + 1}`}</Box>
        ))}
      </Stack>
    </div>
  ),
};
