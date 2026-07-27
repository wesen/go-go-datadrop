import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemberPanel } from "./MemberPanel";
import type { MemberRef } from "../../../pbui";

const members: MemberRef[] = [
  {
    drop: "lab",
    user: { id: "usr_ada", name: "ada", email: "ada@example.org" },
    role: "admin",
    isOwner: true,
  },
  {
    drop: "lab",
    user: { id: "usr_bob", name: "bob", email: "bob@example.org" },
    role: "writer",
    isOwner: false,
  },
  {
    drop: "lab",
    user: { id: "usr_cy", name: "cy", email: null },
    role: "reader",
    isOwner: false,
  },
];

const meta = {
  title: "Component Library/Organisms/MemberPanel",
  component: MemberPanel,
  parameters: { tile: { width: 520, height: 320 } },
  args: {
    drop: "lab",
    members,
    yourRole: "admin",
    unowned: false,
    onClaim: () => {},
    onAdd: () => {},
    onRoleChange: () => {},
    onRemove: () => {},
  },
} satisfies Meta<typeof MemberPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsAnAdmin: Story = {};

/**
 * A writer's view — the list, and the reason there is no editor.
 *
 * Rendering nothing here would leave "why can I not add anyone?" unanswerable
 * from the screen.
 */
export const AsAWriter: Story = { args: { yourRole: "writer" } };

/**
 * An unowned drop.
 *
 * Existing drops predate ownership and stay unowned (DR-25): guessing an owner
 * would be a silent grant. So the claim affordance exists, and this is the only
 * place it appears.
 */
export const UnownedDrop: Story = { args: { unowned: true } };

/** The failure that happens most: an address with no account behind it. */
export const LookupFailed: Story = {
  args: { error: "no datadrop account has that address yet" },
};

/**
 * A drop with exactly one member — you.
 *
 * The empty branch has to say something. "nobody else has access" is a fact; a
 * blank region is a rendering bug as far as anyone reading it can tell.
 */
export const NobodyElse: Story = { args: { members: [] } };
