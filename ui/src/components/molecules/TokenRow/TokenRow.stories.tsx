import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokenRow } from "./TokenRow";
import type { TokenSummary } from "./TokenRow";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const token = (over: Partial<TokenSummary>): TokenSummary => ({
  id: "kf83nd02mzq4x",
  name: "ci ingest",
  scopes: ["drops:read", "drops:write"],
  created_at: "2026-05-02T09:00:00Z",
  last_used_at: "2026-07-24T18:11:00Z",
  expires_at: null,
  revoked_at: null,
  ...over,
});

const meta = {
  title: "Component Library/Molecules/TokenRow",
  component: TokenRow,
  parameters: { tile: false },
  args: { token: token({}) },
} satisfies Meta<typeof TokenRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The whole lifecycle, as a list.
 *
 * A revoked token is shown, not hidden: "did I revoke that one?" is a question
 * that needs an answer, and an absent row does not give one.
 */
export const TheLifecycle: Story = {
  render: () => (
    <Stack gap={3}>
      <TokenRow token={token({})} onRevoke={() => {}} />
      <TokenRow
        token={token({ id: "p2mv84qr7ta6d", name: "never used", last_used_at: null })}
        onRevoke={() => {}}
      />
      <TokenRow
        token={token({
          id: "n4xw90ptr2skb",
          name: "expiring",
          expires_at: "2026-08-01T00:00:00Z",
        })}
        onRevoke={() => {}}
      />
      <TokenRow
        token={token({
          id: "z7bc55klmn3we",
          name: "leaked, revoked",
          scopes: ["admin"],
          revoked_at: "2026-07-20T09:14:00Z",
        })}
        onRevoke={() => {}}
      />
    </Stack>
  ),
};

/**
 * Scopes as chips rather than as `scopes.join(" ")`.
 *
 * They are four separate facts about what the credential may do, and the one
 * that matters most is `admin`. Joined into a string it was in the middle of a
 * long word on a list of eight tokens.
 */
export const EveryScope: Story = {
  render: () => (
    <Stack gap={3}>
      <TokenRow
        token={token({
          name: "everything",
          scopes: ["drops:read", "drops:write", "datasets:write", "admin"],
        })}
        onRevoke={() => {}}
      />
      <Text size="tiny" tone="faint">
        before: drops:read drops:write datasets:write admin
      </Text>
    </Stack>
  ),
};

/** Read-only — no `onRevoke`, so no button. Someone else's token, or the list
 *  rendered for a principal that cannot revoke. */
export const NotRevokable: Story = {
  render: () => <TokenRow token={token({})} />,
};
