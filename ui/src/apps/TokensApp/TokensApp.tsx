import { useState } from "react";
import {
  useCreateTokenMutation,
  useListTokensQuery,
  useMeQuery,
  useRevokeTokenMutation,
  type CreatedToken,
} from "../../api/client";
import { registerApp, type AppProps } from "../../appkit/registry";
import { AppBody } from "../../components/layout";
import { Text } from "../../components/foundation";
import { TokensPanel } from "../../components/organisms";
import { usePbui } from "../../pbui";

const SCOPES = ["drops:read", "drops:write", "datasets:write", "admin"] as const;

/**
 * The way in for machines — the container.
 *
 * The secret lives in this component's state and in one HTTP response, and
 * nowhere else: never in Redux, never in a presentation value, never in a verb
 * (DR-28). The verb fired below carries the name and the scopes precisely so
 * that the trace records the mint without recording the credential.
 */
function TokensApp(_props: AppProps) {
  const { data: me } = useMeQuery();
  const [showRevoked, setShowRevoked] = useState(false);
  // Skipped for the root principal as well as for anonymous: root has no user
  // record, so /v1/me/tokens 403s — correctly, but a 403 in the console on
  // every page load is noise, and noise is where real errors go to hide.
  const { data } = useListTokensQuery(showRevoked, {
    skip: !me?.authenticated || !me.user,
  });
  const [createToken, { isLoading: minting }] = useCreateTokenMutation();
  const [revokeToken] = useRevokeTokenMutation();
  const pbui = usePbui();

  const [minted, setMinted] = useState<CreatedToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mint(name: string, scopes: string[], expiresIn: string) {
    setError(null);
    try {
      const created = await createToken({
        name,
        scopes,
        ...(expiresIn ? { expires_in: expiresIn } : {}),
      }).unwrap();
      setMinted(created);
      // The verb, for the trace. It carries the name and the scopes; the secret
      // stays in `minted` and goes nowhere else.
      pbui.perform({
        kind: "createToken",
        name: created.name,
        scopes: created.scopes,
        expiresIn: expiresIn || null,
      });
    } catch (caught) {
      setError(detailOf(caught));
    }
  }

  if (!me?.authenticated) {
    return (
      <AppBody>
        <Text size="small" tone="faint">
          not signed in
        </Text>
      </AppBody>
    );
  }

  return (
    <TokensPanel
      tokens={data?.tokens ?? []}
      scopes={SCOPES}
      // A token must not be able to mint another token, or revoking a leaked
      // one leaves its offspring alive with no way to enumerate them.
      mintable={me.kind === "session"}
      mintableReason="Minting requires a signed-in browser session. A token may not mint another token — otherwise revoking a leaked credential would leave whatever it created still working."
      minting={minting}
      minted={minted}
      error={error}
      showRevoked={showRevoked}
      onShowRevokedChange={setShowRevoked}
      onMint={({ name, scopes, expiresIn }) => void mint(name, scopes, expiresIn)}
      onDismissMinted={() => setMinted(null)}
      onRevoke={(id) => void revokeToken(id)}
      onCopy={(secret) => void navigator.clipboard?.writeText(secret)}
    />
  );
}

/** Pull the server's problem detail out of an RTK Query error. */
function detailOf(caught: unknown): string {
  const data = (caught as { data?: { detail?: string } })?.data;
  return data?.detail ?? "could not mint the token";
}

registerApp({
  id: "tokens",
  title: "tokens",
  tone: "var(--pbui-tone-step)",
  docBound: false,
  Component: TokensApp,
});
