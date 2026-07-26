import { useState } from "react";
import { AppBody, Stack, Toolbar } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { Button, LinkAction, TextInput } from "../../atoms";
import { Callout } from "../../molecules";

/**
 * The way in, in whichever mode the server is running.
 *
 * Presentational: it takes what `/v1/me` reported and two callbacks, and knows
 * nothing about how a token is stored or how a sign-in is started. That is what
 * makes its awkward states cheap to render — and its awkward states are where
 * DATADROP-5 shipped a defect.
 *
 * **Defect 1 lived here.** Identity-provider prose was rendered in *token*
 * mode, where there is no identity provider. Reaching that by clicking needs a
 * server started with `--auth=token`; reaching it as a story needs one prop.
 *
 * The error text is ours, never the provider's. The server passes a code
 * precisely so that provider-supplied text is never rendered into this page.
 */
export type SignInMode = "oidc" | "token";

const SIGN_IN_ERRORS: Record<string, string> = {
  provider_refused: "The identity provider refused, or you cancelled.",
  state_mismatch: "This sign-in did not start in this browser. Start again from this page.",
  state_expired: "That sign-in took too long, or was already used. Start again.",
  exchange_failed: "The identity provider's answer could not be verified.",
  email_unverified: "Your email address is not verified yet. Check your inbox, then sign in again.",
  account_disabled: "This account is disabled here. Ask an administrator.",
};

export function SignInPanel({
  mode,
  signupEnabled = false,
  issuer,
  errorCode,
  returnPath,
  initialToken = "",
  onUseToken,
}: {
  mode: SignInMode;
  signupEnabled?: boolean;
  issuer?: string | null;
  /** The `auth_error` code from the callback, not a message. */
  errorCode?: string | null;
  returnPath: string;
  initialToken?: string;
  onUseToken?(token: string): void;
}) {
  const [token, setToken] = useState(initialToken);

  return (
    <AppBody>
      <Stack gap={4}>
        {errorCode && (
          <Callout variant="warning" title="Sign-in did not complete">
            <Text size="small" tone="faint">
              {SIGN_IN_ERRORS[errorCode] ?? "Something went wrong on the way back. Try again."}
            </Text>
          </Callout>
        )}

        {mode === "oidc" ? (
          <Stack gap={3}>
            <Stack gap={2}>
              <SectionLabel>Sign in</SectionLabel>
              <Text size="small" prose>
                datadrop does not hold your password. Signing in hands you to the identity provider,
                which sends you back here once it is satisfied.
              </Text>
            </Stack>

            <Toolbar>
              {/* Links, not fetch(). An OIDC authorization request is a
                  top-level navigation to another origin. */}
              <LinkAction
                href={`/v1/auth/login?return=${encodeURIComponent(returnPath)}`}
                data-testid="sign-in"
              >
                Sign in →
              </LinkAction>
              {signupEnabled && (
                <LinkAction
                  href={`/v1/auth/login?intent=signup&return=${encodeURIComponent(returnPath)}`}
                  data-testid="sign-up"
                >
                  Create an account →
                </LinkAction>
              )}
            </Toolbar>

            {issuer && (
              <Text size="tiny" tone="faint">
                identity provider: {issuer}
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap={3}>
            <Stack gap={2}>
              <SectionLabel>Access token</SectionLabel>
              <Text size="small" prose>
                This server has no user accounts — it is running with a shared token. Paste it here;
                it is kept for this tab only and is never written to durable storage.
              </Text>
            </Stack>
            <Toolbar>
              <TextInput
                type="password"
                label="bearer token"
                value={token}
                onValueChange={setToken}
              />
              <Button onClick={() => onUseToken?.(token)}>Use this token</Button>
            </Toolbar>
          </Stack>
        )}
      </Stack>
    </AppBody>
  );
}
