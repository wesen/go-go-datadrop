import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokensPanel } from "./TokensPanel";
import type { TokenSummary } from "../../molecules";

const SCOPES = ["drops:read", "drops:write", "datasets:write", "admin"];

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
  title: "Component Library/Organisms/TokensPanel",
  component: TokensPanel,
  parameters: { tile: { width: 560, height: 620 } },
  args: {
    tokens: [token({}), token({ id: "p2mv84qr7ta6d", name: "laptop", last_used_at: null })],
    scopes: SCOPES,
    mintable: true,
    showRevoked: false,
    onShowRevokedChange: () => {},
    onMint: () => {},
    onDismissMinted: () => {},
    onRevoke: () => {},
  },
} satisfies Meta<typeof TokensPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

/**
 * A first-day account.
 *
 * The hint is the useful half: "none yet" says the list is empty, and the
 * sentence under it says the token will work with `datadrop` unchanged — which
 * is the whole reason to mint one.
 */
export const NoTokensYet: Story = { args: { tokens: [] } };

/**
 * **The awkward mode** (§18.2): authenticated by a token, not by a session.
 *
 * A token must not be able to mint another token, or revoking a leaked
 * credential leaves whatever it created still working with no way to enumerate
 * it. The form is *shown* disabled with the reason rather than hidden: a rule
 * you cannot see is a rule you cannot learn.
 *
 * Reaching this by clicking needs a `ddp_` credential in the browser. Reaching
 * it here needs one prop.
 */
export const NotMintable: Story = {
  args: {
    mintable: false,
    mintableReason:
      "Minting requires a signed-in browser session. A token may not mint another token — otherwise revoking a leaked credential would leave whatever it created still working.",
  },
};

/**
 * The one-time secret.
 *
 * The value is a literal that is deliberately **not** a real token shape. The
 * secret exists in component state and in one HTTP response; it is never in
 * Redux, never in a presentation value and never in a verb (DR-28). A Storybook
 * control for it would be a fourth place, and Storybook args are encodable in a
 * URL.
 */
export const JustMinted: Story = {
  args: {
    minted: {
      id: "n4xw90ptr2skb",
      token: "ddp_exampleexampl_exampleexampleexampleexampleexam",
    },
  },
};

export const Minting: Story = { args: { minting: true } };

export const MintFailed: Story = {
  args: { error: "could not mint the token" },
};

/**
 * Revoked tokens shown.
 *
 * "Did I revoke that one?" is a question that needs an answer, and an absent
 * row does not give one. The revoked row keeps its chip and loses its button.
 */
export const ShowingRevoked: Story = {
  args: {
    showRevoked: true,
    tokens: [
      token({}),
      token({
        id: "z7bc55klmn3we",
        name: "leaked, revoked",
        scopes: ["admin"],
        revoked_at: "2026-07-20T09:14:00Z",
      }),
    ],
  },
};
