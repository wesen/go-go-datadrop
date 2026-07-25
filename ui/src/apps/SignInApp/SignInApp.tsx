import { useEffect, useState } from "react";
import { readToken, useMeQuery, writeToken } from "../../api/client";
import { registerApp, type AppProps } from "../registry";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";

/**
 * The way in.
 *
 * Serves BOTH deployment modes, so there is exactly one place in the interface
 * that knows about credentials: an OIDC deployment gets sign-in and create-
 * account links, a token deployment gets the token field it has always had.
 */
function SignInApp(_props: AppProps) {
  const { data: me } = useMeQuery();
  const [token, setToken] = useState(() => readToken());
  const [error, setError] = useState<string | null>(null);

  // The callback lands at /ui/?auth_error=… . Read it once and strip it, so a
  // reload or a bookmark does not replay a failure that is over.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (!code) return;
    setError(code);
    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);

  const oidc = me?.auth_mode === "oidc";

  return (
    <AppBody>
      <Stack gap={4}>
        {error && (
          <Surface tone="alt" role="alert">
            <Stack gap={1}>
              <Text size="small" strong tone="danger">
                Sign-in did not complete
              </Text>
              {/* Our words, not the provider's. The server passes a code
                  precisely so that provider-supplied text is never rendered. */}
              <Text size="small" tone="faint">
                {SIGN_IN_ERRORS[error] ?? "Something went wrong on the way back. Try again."}
              </Text>
            </Stack>
          </Surface>
        )}

        {oidc ? (
          <Stack gap={3}>
            <Stack gap={2}>
              <SectionLabel>Sign in</SectionLabel>
              <Text size="small" prose>
                datadrop does not hold your password. Signing in hands you to the
                identity provider, which sends you back here once it is
                satisfied.
              </Text>
            </Stack>

            <Toolbar>
              {/* Plain links, not fetch(). An OIDC redirect cannot be performed
                  with XHR, and attempting it is a standard afternoon lost to
                  CORS. */}
              <a href={`/v1/auth/login?return=${encodeURIComponent(returnPath())}`} data-testid="sign-in">
                <Text size="small" strong>
                  Sign in →
                </Text>
              </a>
              {me?.signup_enabled && (
                <a
                  href={`/v1/auth/login?intent=signup&return=${encodeURIComponent(returnPath())}`}
                  data-testid="sign-up"
                >
                  <Text size="small" strong>
                    Create an account →
                  </Text>
                </a>
              )}
            </Toolbar>

            {me?.provider && (
              <Text size="tiny" tone="faint">
                identity provider: {me.provider.issuer}
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap={3}>
            <Stack gap={2}>
              <SectionLabel>Access token</SectionLabel>
              <Text size="small" prose>
                This server has no user accounts — it is running with a shared
                token. Paste it here; it is kept for this tab only and is never
                written to durable storage.
              </Text>
            </Stack>
            <Toolbar>
              <input
                type="password"
                aria-label="bearer token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                style={{ font: "inherit", padding: "2px 4px", border: "var(--pbui-border-hair)" }}
              />
              <button
                type="button"
                onClick={() => {
                  writeToken(token);
                  window.location.reload();
                }}
              >
                <Text size="small">Use this token</Text>
              </button>
            </Toolbar>
          </Stack>
        )}
      </Stack>
    </AppBody>
  );
}

/** Where to come back to. Same-origin path only; the server re-validates. */
function returnPath(): string {
  return window.location.pathname + window.location.search;
}

const SIGN_IN_ERRORS: Record<string, string> = {
  provider_refused: "The identity provider refused, or you cancelled.",
  state_mismatch:
    "This sign-in did not start in this browser. Start again from this page.",
  state_expired: "That sign-in took too long, or was already used. Start again.",
  exchange_failed: "The identity provider's answer could not be verified.",
  email_unverified:
    "Your email address is not verified yet. Check your inbox, then sign in again.",
  account_disabled: "This account is disabled here. Ask an administrator.",
};

registerApp({
  id: "signin",
  title: "sign in",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: SignInApp,
});
