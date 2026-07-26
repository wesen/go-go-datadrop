import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemberInvite } from "./MemberInvite";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * Add someone by the thing a human knows about them.
 *
 * The address is turned into a user id by a server lookup, and that lookup is
 * an existence oracle over email addresses — which is why the server restricts
 * it to callers who already administer something. That constraint lives in the
 * server; this component does not know the lookup exists.
 */
const meta = {
  title: "Component Library/Molecules/MemberInvite",
  component: MemberInvite,
  parameters: { tile: false },
  args: { drop: "lab", onAdd: () => {} },
} satisfies Meta<typeof MemberInvite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <MemberInvite drop="lab" onAdd={() => {}} />,
};

/**
 * The failure that happens most: an address with no account behind it.
 *
 * `error` sets `aria-invalid` on the field as well as rendering the message, so
 * the two are associated rather than merely adjacent. The hand-written version
 * rendered the sentence below the field with nothing tying them together, which
 * a screen reader reports as two unrelated things.
 */
export const LookupFailed: Story = {
  render: () => (
    <Stack gap={3}>
      <MemberInvite drop="lab" error="no datadrop account has that address yet" onAdd={() => {}} />
      <Text size="tiny" tone="faint" prose>
        Dashed border as well as red, and the field reports aria-invalid.
      </Text>
    </Stack>
  ),
};
