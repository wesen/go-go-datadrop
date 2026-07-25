import { useEffect, useState } from "react";
import { readToken, useMeQuery, writeToken } from "../../api/client";
import { registerApp, type AppProps } from "../../appkit/registry";
import { SignInPanel } from "../../components/organisms";

/**
 * The way in — the container half.
 *
 * Everything visible is `SignInPanel`; this holds the query, the callback-error
 * plumbing and the token write. The split is what lets the two modes and the
 * six error codes be reviewed as stories rather than as server configurations
 * (DATADROP-6 phase 5).
 */
function SignInApp(_props: AppProps) {
  const { data: me } = useMeQuery();
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

  return (
    <SignInPanel
      mode={me?.auth_mode === "oidc" ? "oidc" : "token"}
      signupEnabled={me?.signup_enabled ?? false}
      issuer={me?.provider?.issuer ?? null}
      errorCode={error}
      returnPath={returnPath()}
      initialToken={readToken()}
      onUseToken={(token) => {
        writeToken(token);
        window.location.reload();
      }}
    />
  );
}

/** Where to come back to. Same-origin path only; the server re-validates. */
function returnPath(): string {
  return window.location.pathname + window.location.search;
}

registerApp({
  id: "signin",
  title: "sign in",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: SignInApp,
});
