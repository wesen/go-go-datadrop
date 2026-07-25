import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfilePanel } from "./ProfilePanel";
import type { ProfileDrop, ProfileSession } from "./ProfilePanel";

const drops: ProfileDrop[] = [
  { name: "lab", your_role: "admin", public_read: false, owner_id: "usr_ada" },
  { name: "field-trial", your_role: "writer", public_read: false, owner_id: "usr_bob" },
  { name: "public-weather", your_role: "reader", public_read: true, owner_id: null },
];

const sessions: ProfileSession[] = [
  {
    id: "s1",
    current: true,
    user_agent: "Firefox on Linux",
    created_at: "2026-07-25T09:14:00Z",
    ip: "10.0.0.4",
  },
  {
    id: "s2",
    current: false,
    user_agent: "Safari on iOS",
    created_at: "2026-07-21T18:02:00Z",
    ip: null,
  },
];

const meta = {
  title: "Component Library/Organisms/ProfilePanel",
  component: ProfilePanel,
  parameters: { tile: { width: 520, height: 560 } },
  args: {
    user: {
      id: "usr_ada",
      name: "ada",
      email: "ada@example.org",
      created_at: "2026-05-02T09:00:00Z",
    },
    kind: "session",
    drops,
    sessions,
    provider: { account_url: "http://zitadel.test:17070/ui/console/users/me" },
    onSignOut: () => {},
  },
} satisfies Meta<typeof ProfilePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

/**
 * **The defect.** The root principal: authenticated, but no user record.
 *
 * DATADROP-5 rendered a "Signed in on" heading here with nothing under it.
 * Reaching this by clicking needs a root credential and a server in OIDC mode;
 * reaching it here needs `user={null}` and `kind="root"`.
 *
 * Note what is correct now: no session block at all, because root has no
 * session — and the "You" section says why rather than rendering an empty chip.
 */
export const RootPrincipal: Story = {
  args: { user: null, kind: "root", sessions: undefined },
};

/**
 * The shape the defect really had: a heading with nothing under it.
 *
 * `undefined` sessions mean "still loading" and `[]` means "there are none".
 * Collapsing the two is how a heading comes to render above nothing, so the
 * panel distinguishes them and both are stories.
 */
export const SessionsStillLoading: Story = { args: { sessions: undefined } };

export const NoOtherSessions: Story = { args: { sessions: [] } };

/**
 * Token mode: no identity provider to point at.
 *
 * The "manage your account" link and the paragraph above it describe a system
 * that is not there, so both disappear.
 */
export const NoIdentityProvider: Story = {
  args: { provider: null, kind: "token", sessions: undefined },
};

/**
 * A first-day account.
 *
 * The empty state has a hint, because "none yet" alone leaves the only useful
 * question — how does a drop become visible? — unanswered.
 */
export const NoDropsYet: Story = { args: { drops: [] } };

/** A user the provider gave no name for. The id is what a real person sees. */
export const NoNameFromTheProvider: Story = {
  args: {
    user: { id: "usr_9f2a41c0", name: null, email: null, created_at: "2026-07-25T00:00:00Z" },
  },
};
