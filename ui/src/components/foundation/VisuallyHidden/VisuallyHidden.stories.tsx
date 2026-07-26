import type { Meta, StoryObj } from "@storybook/react-vite";
import { VisuallyHidden } from "./VisuallyHidden";
import { Stack, Surface } from "../../layout";
import { Text } from "..";

/**
 * A story for something invisible, which sounds absurd and is not.
 *
 * What it demonstrates is that the element takes no space and collapses no
 * layout: the two lines below are adjacent even though there is a whole
 * announced sentence between them. `clip-path` plus a 1px box, rather than
 * `display: none` or `visibility: hidden` — both of which would remove it from
 * the accessibility tree, which is the exact opposite of the point.
 */
const meta = {
  title: "Design System/Foundation/VisuallyHidden",
  component: VisuallyHidden,
  parameters: { tile: false },
  args: { children: "announced but not drawn" },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TakesNoSpace: Story = {
  render: () => (
    <Surface border="hair" padding={3}>
      <Stack gap={0}>
        <Text size="small">first line</Text>
        <VisuallyHidden>
          There is an entire announced sentence between these two lines.
        </VisuallyHidden>
        <Text size="small">second line — adjacent, as if nothing were between them</Text>
      </Stack>
    </Surface>
  ),
};

/**
 * The live region that carries the mouse documentation.
 *
 * A presentation-based interface explains itself by describing whatever is
 * under the cursor. That is useless to a screen reader unless it is also
 * announced, which is what `live` is for.
 */
export const LiveRegion: Story = {
  render: () => (
    <Stack gap={2}>
      <VisuallyHidden live="polite">&lt;field&gt; temp_c — quantitative, 240 rows</VisuallyHidden>
      <Text size="tiny" tone="faint" prose>
        Nothing renders. A screen reader announces the field description as the pointer moves, which
        is what makes the mouse-doc line reachable without a mouse.
      </Text>
    </Stack>
  ),
};
