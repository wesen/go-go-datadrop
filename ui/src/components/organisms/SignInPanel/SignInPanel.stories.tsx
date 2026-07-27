import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignInPanel } from "./SignInPanel";

/**
 * Every mode and every failure the sign-in page can be in.
 *
 * This is the story set §18.2 asks for, and the reason is specific: **defect 1
 * of DATADROP-5 lived in the token-mode branch of this component** —
 * identity-provider prose rendered where there is no identity provider.
 * Reaching that by clicking needs a server started with `--auth=token`.
 * Reaching it here needs one prop.
 */
const meta = {
  title: "Component Library/Organisms/SignInPanel",
  component: SignInPanel,
  parameters: { tile: { width: 460, height: 340 } },
  args: { mode: "oidc", returnPath: "/ui/" },
} satisfies Meta<typeof SignInPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OidcWithSignup: Story = {
  args: { mode: "oidc", signupEnabled: true, issuer: "http://zitadel.test:17070" },
};

/**
 * Signup disabled — the ordinary state of a closed deployment.
 *
 * The "Create an account" link disappears rather than erroring, because the
 * provider would refuse `prompt=create` and the error would then be the
 * provider's words rather than ours.
 */
export const OidcWithoutSignup: Story = {
  args: { mode: "oidc", signupEnabled: false, issuer: "http://zitadel.test:17070" },
};

/**
 * **The defect.** Token mode: no provider, no links, no provider prose.
 *
 * Note what is *absent* — "datadrop does not hold your password", "identity
 * provider: …", and both links. Rendering any of them here is the bug that
 * shipped.
 */
export const TokenMode: Story = {
  args: { mode: "token" },
};

export const TokenModeWithAToken: Story = {
  args: { mode: "token", initialToken: "local-root-token" },
};

/**
 * The failure codes, in our words.
 *
 * The server passes a code rather than a message precisely so that
 * provider-supplied text is never rendered into this page.
 */
export const ProviderRefused: Story = {
  args: { mode: "oidc", signupEnabled: true, errorCode: "provider_refused" },
};

export const StateMismatch: Story = {
  args: { mode: "oidc", signupEnabled: true, errorCode: "state_mismatch" },
};

export const EmailUnverified: Story = {
  args: { mode: "oidc", signupEnabled: true, errorCode: "email_unverified" },
};

/**
 * A code this release does not know.
 *
 * A later server can add one. The fallback has to be a sentence — not the raw
 * code, and certainly not a blank panel.
 */
export const AnUnknownErrorCode: Story = {
  args: { mode: "oidc", signupEnabled: true, errorCode: "something_new_from_a_later_release" },
};
