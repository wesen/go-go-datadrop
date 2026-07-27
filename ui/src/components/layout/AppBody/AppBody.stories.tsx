import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppBody } from "./AppBody";
import { Toolbar } from "../Toolbar";
import { Stack } from "../Stack";
import { SectionLabel, Text } from "../../foundation";

/**
 * The scrolling half of the pair that makes a tile work.
 *
 * A tile is a bounded flex column: a `Toolbar` that does not shrink and an
 * `AppBody` that does, and scrolls. Rendered inside the tile decorator, so the
 * bound is real rather than assumed.
 */
const meta = {
  title: "Design System/Layout/AppBody",
  component: AppBody,
  args: { children: null },
} satisfies Meta<typeof AppBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scrolls: Story = {
  parameters: { tile: { width: 320, height: 220 } },
  render: () => (
    <>
      <Toolbar bordered tight>
        <SectionLabel>a tile</SectionLabel>
      </Toolbar>
      <AppBody>
        <Stack gap={2}>
          {Array.from({ length: 30 }, (_, i) => (
            <Text key={i} size="small">
              row {i + 1}
            </Text>
          ))}
        </Stack>
      </AppBody>
    </>
  ),
};

/** `flush` for a table that draws to its own edges. */
export const Flush: Story = {
  parameters: { tile: { width: 320, height: 160 } },
  render: () => (
    <AppBody flush>
      <div style={{ background: "var(--pbui-pane-alt)", height: 400 }}>
        <Text size="small">no padding — the content owns its own edges</Text>
      </div>
    </AppBody>
  ),
};
