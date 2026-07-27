import type { Meta, StoryObj } from "@storybook/react-vite";
import { Surface } from "./Surface";
import { Stack } from "../Stack";
import { SectionLabel, Text } from "../../foundation";

/**
 * Every visual container in the workbench is one of these, which is how the
 * first three visual rules — no radius, borders are 1 or 2px solid ink, shadows
 * are offset and never blurred — end up true by construction rather than by
 * review.
 */
const meta = {
  title: "Design System/Layout/Surface",
  component: Surface,
  parameters: { tile: false },
  args: { children: null },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <Stack direction="row" gap={3} wrap>
      {(["pane", "alt", "selected", "inverted"] as const).map((tone) => (
        <Surface key={tone} tone={tone} border="hair" padding={3}>
          <Stack gap={1}>
            <SectionLabel>{tone}</SectionLabel>
            <Text size="small">body text</Text>
            <Text size="small" tone="faint">
              faint text
            </Text>
          </Stack>
        </Surface>
      ))}
    </Stack>
  ),
};

/**
 * The inverted surface re-points `--pbui-faint` for its descendants.
 *
 * `--pbui-faint` is tuned for pale surfaces and measures 2.95:1 against
 * `--pbui-ink`, so a dark bar that reused it would be unreadable. Compare the
 * faint line in the `inverted` card above with the one on `pane`: nothing below
 * the surface has to know which kind it is sitting on.
 */
export const Borders: Story = {
  render: () => (
    <Stack direction="row" gap={3}>
      {(["none", "hair", "firm"] as const).map((border) => (
        <Surface key={border} border={border} padding={3}>
          <Text size="small">{border}</Text>
        </Surface>
      ))}
    </Stack>
  ),
};

export const Elevation: Story = {
  render: () => (
    <Stack direction="row" gap={5}>
      {(["flat", "raised", "floating"] as const).map((elevation) => (
        <Surface key={elevation} elevation={elevation} border="firm" padding={3}>
          <Text size="small">{elevation}</Text>
        </Surface>
      ))}
    </Stack>
  ),
};

export const Padding: Story = {
  render: () => (
    <Stack direction="row" gap={3} align="start">
      {([0, 2, 3, 4] as const).map((padding) => (
        <Surface key={padding} border="hair" padding={padding} tone="alt">
          <Text size="tiny">pad-{padding}</Text>
        </Surface>
      ))}
    </Stack>
  ),
};
