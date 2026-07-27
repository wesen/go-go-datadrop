import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserChip } from "./UserChip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const meta = {
  title: "Design System/Atoms/UserChip",
  component: UserChip,
  parameters: { tile: false },
  args: { user: { id: "usr_ada", name: "ada", email: "ada@example.org" } },
} satisfies Meta<typeof UserChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OthersAndYou: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={3} wrap align="center">
        <UserChip user={{ id: "usr_ada", name: "ada", email: "ada@example.org" }} you />
        <UserChip user={{ id: "usr_bob", name: "bob", email: "bob@example.org" }} />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Your own row is marked twice — the "· you" suffix and the selected fill — because a member
        list where you cannot find yourself is one you cannot reason about.
      </Text>
    </Stack>
  ),
};

/**
 * A user with no email, which is the case for a machine account and for a
 * provider that does not release the claim.
 */
export const NoEmail: Story = {
  render: () => <UserChip user={{ id: "usr_ci", name: "ci-runner", email: null }} />,
};

/**
 * A user with no name either.
 *
 * The applications fall back to email, then to the opaque id. The chip renders
 * whatever it is given, so this story is the reminder that "usr_9f2a…" is a
 * name a real person will see.
 */
export const OnlyAnId: Story = {
  render: () => <UserChip user={{ id: "usr_9f2a41c0", name: "usr_9f2a41c0", email: null }} />,
};
