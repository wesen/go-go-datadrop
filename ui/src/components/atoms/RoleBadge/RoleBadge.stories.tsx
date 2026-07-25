import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoleBadge } from "./RoleBadge";
import { Chip } from "../Chip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * What a caller may do to a drop, in one glyph.
 *
 * A badge rather than a colour: the tone scale is already carrying presentation
 * type, and stacking a second meaning on it would make both unreadable.
 */
const meta = {
  title: "Design System/Atoms/RoleBadge",
  component: RoleBadge,
  parameters: { tile: false },
  args: { role: "admin" },
} satisfies Meta<typeof RoleBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * All four values, including the empty one.
 *
 * The empty role renders nothing at all, which is the case a caller with no
 * membership hits — and rendering an empty box there would imply a role that
 * does not exist.
 *
 * Hover each: the title reads "you are a writer" and "you are **an** admin".
 * That article is selected in code, and it is the detail DATADROP-5 shipped
 * wrong — "you are a admin" — because nothing rendered the admin case where
 * anyone would read it.
 */
export const EveryRole: Story = {
  render: () => (
    <Stack gap={2}>
      {(["reader", "writer", "admin", ""] as const).map((role) => (
        <Stack key={role || "none"} direction="row" gap={3} align="center">
          <span style={{ minWidth: 24, display: "inline-block" }}>
            <RoleBadge role={role} />
          </span>
          <Text size="tiny" tone="faint">
            {role || "(no membership — renders nothing)"}
          </Text>
        </Stack>
      ))}
    </Stack>
  ),
};

export const BesideAChip: Story = {
  render: () => (
    <Stack direction="row" gap={3} wrap align="center">
      {(["reader", "writer", "admin"] as const).map((role) => (
        <Chip
          key={role}
          label="lab"
          tone="var(--pbui-tone-source)"
          badge={<RoleBadge role={role} />}
        />
      ))}
    </Stack>
  ),
};
