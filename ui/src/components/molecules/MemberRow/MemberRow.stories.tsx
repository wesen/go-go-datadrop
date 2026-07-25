import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemberRow } from "./MemberRow";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import type { MemberRef } from "../../../pbui";

const member = (over: Partial<MemberRef>): MemberRef => ({
  drop: "lab",
  user: { id: "usr_bob", name: "bob", email: "bob@example.org" },
  role: "reader",
  isOwner: false,
  ...over,
});

const meta = {
  title: "Component Library/Molecules/MemberRow",
  component: MemberRow,
  parameters: { tile: false },
  args: { member: member({}), canEdit: false },
} satisfies Meta<typeof MemberRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A reader's view: who else can see this, and no controls.
 *
 * Reading the list needs only `reader`. Knowing who else can see something you
 * can see is not a privilege, and hiding it makes "why can they read this"
 * unanswerable without finding an administrator.
 */
export const AsAReader: Story = {
  render: () => (
    <Stack gap={2}>
      <MemberRow member={member({ role: "admin", isOwner: true, user: { id: "usr_ada", name: "ada", email: "ada@example.org" } })} canEdit={false} />
      <MemberRow member={member({ role: "writer" })} canEdit={false} />
      <MemberRow member={member({ role: "reader", user: { id: "usr_cy", name: "cy", email: null } })} canEdit={false} />
    </Stack>
  ),
};

export const AsAnAdmin: Story = {
  render: () => (
    <Stack gap={2}>
      <MemberRow member={member({ role: "writer" })} canEdit onRoleChange={() => {}} onRemove={() => {}} />
      <MemberRow member={member({ role: "reader", user: { id: "usr_cy", name: "cy", email: null } })} canEdit onRoleChange={() => {}} onRemove={() => {}} />
    </Stack>
  ),
};

/**
 * The owner's row, which an admin cannot edit.
 *
 * Shown disabled rather than without controls: a member list where the owner
 * silently has no dropdown reads as a rendering bug, and the disabled control
 * with its tooltip says which rule is in force.
 */
export const TheOwner: Story = {
  render: () => (
    <Stack gap={3}>
      <MemberRow
        member={member({
          role: "admin",
          isOwner: true,
          user: { id: "usr_ada", name: "ada", email: "ada@example.org" },
        })}
        canEdit
        onRoleChange={() => {}}
        onRemove={() => {}}
      />
      <Text size="tiny" tone="faint" prose>
        Hover the remove button: "the owner cannot be removed".
      </Text>
    </Stack>
  ),
};

/**
 * A name that is really an opaque id.
 *
 * The applications fall back to email, then to the user id. "usr_9f2a41c0" is a
 * name a real person will see, which is worth looking at rather than assuming.
 */
export const OnlyAnId: Story = {
  render: () => (
    <MemberRow
      member={member({ user: { id: "usr_9f2a41c0", name: "usr_9f2a41c0", email: null } })}
      canEdit
      onRoleChange={() => {}}
      onRemove={() => {}}
    />
  ),
};
