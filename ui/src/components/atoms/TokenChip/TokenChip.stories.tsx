import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokenChip } from "./TokenChip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * An API token, by id.
 *
 * The absence of a secret field on `TokenRef` is load-bearing rather than an
 * omission (DR-28). A presentation value flows into the inspector, the
 * watchlist and the trace, so a secret placed here would reach all three. The
 * id is the public half — it is what an audit row carries, and it is what makes
 * "which token did this" answerable.
 */
const meta = {
  title: "Design System/Atoms/TokenChip",
  component: TokenChip,
  parameters: { tile: false },
  args: {
    token: {
      id: "kf83nd02mzq4x",
      name: "ci ingest",
      scopes: ["drops:read", "drops:write"],
      expiresAt: null,
      revokedAt: null,
    },
  },
} satisfies Meta<typeof TokenChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lifecycle: Story = {
  render: () => (
    <Stack gap={3}>
      <TokenChip
        token={{
          id: "kf83nd02mzq4x",
          name: "ci ingest",
          scopes: ["drops:read", "drops:write"],
          expiresAt: null,
          revokedAt: null,
        }}
      />
      <TokenChip
        token={{
          id: "p2mv84qr7ta6d",
          name: "expires soon",
          scopes: ["drops:read"],
          expiresAt: "2026-08-01T00:00:00Z",
          revokedAt: null,
        }}
      />
      <TokenChip
        token={{
          id: "z7bc55klmn3we",
          name: "leaked, revoked",
          scopes: ["admin"],
          expiresAt: null,
          revokedAt: "2026-07-20T09:14:00Z",
        }}
      />
      <Text size="tiny" tone="faint" prose>
        A revoked token is shown rather than hidden: the question "did I revoke
        that one?" needs an answer, and an absent row does not give one.
      </Text>
    </Stack>
  ),
};
