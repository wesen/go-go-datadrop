import { useState } from "react";
import {
  useCreateTokenMutation,
  useListTokensQuery,
  useMeQuery,
  useRevokeTokenMutation,
  type CreatedToken,
} from "../../api/client";
import { registerApp, type AppProps } from "../registry";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { Divider, SectionLabel, Text } from "../../components/foundation";
import { TokenChip } from "../../components/atoms";
import { usePbui } from "../../pbui";

const SCOPES = ["drops:read", "drops:write", "datasets:write", "admin"] as const;

const EXPIRIES: Array<{ label: string; value: string }> = [
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
  { label: "never", value: "" },
];

/**
 * The way in for machines.
 *
 * The secret exists in component state and in one HTTP response. It is never
 * put in Redux, never in a presentation value, and never in a verb — so it
 * cannot reach the inspector, the watchlist, the trace, or localStorage
 * (DR-28).
 */
function TokensApp(_props: AppProps) {
  const { data: me } = useMeQuery();
  const [showRevoked, setShowRevoked] = useState(false);
  const { data } = useListTokensQuery(showRevoked, { skip: !me?.authenticated });
  const [createToken, { isLoading: minting }] = useCreateTokenMutation();
  const [revokeToken] = useRevokeTokenMutation();
  const pbui = usePbui();

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["drops:read"]);
  const [expiresIn, setExpiresIn] = useState("90d");
  const [minted, setMinted] = useState<CreatedToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Minting requires a browser session: a token must not be able to mint
  // another token, or revoking a leaked one leaves its offspring alive with no
  // way to enumerate them. Shown as a disabled form with the reason, rather
  // than a hidden one.
  const mintable = me?.kind === "session";

  async function mint() {
    setError(null);
    try {
      const created = await createToken({
        name,
        scopes,
        ...(expiresIn ? { expires_in: expiresIn } : {}),
      }).unwrap();
      setMinted(created);
      setName("");
      // The verb, for the trace. It carries the name and the scopes; the secret
      // stays in `minted` and goes nowhere else.
      pbui.perform({ kind: "createToken", name: created.name, scopes: created.scopes, expiresIn: expiresIn || null });
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
    <AppBody>
      <Stack gap={4}>
        {minted && (
          <Surface tone="alt" role="status">
            <Stack gap={2}>
              <Text size="small" strong>
                Copy this now — it will not be shown again
              </Text>
              <code
                data-testid="minted-token"
                style={{
                  display: "block",
                  wordBreak: "break-all",
                  padding: "var(--pbui-space-2)",
                  border: "var(--pbui-border-hair)",
                  background: "var(--pbui-pane)",
                  fontSize: "var(--pbui-fs-small)",
                }}
              >
                {minted.token}
              </code>
              <Toolbar tight>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(minted.token)}
                >
                  <Text size="small">Copy</Text>
                </button>
                <button type="button" onClick={() => setMinted(null)}>
                  <Text size="small">Done</Text>
                </button>
              </Toolbar>
              <Text size="tiny" tone="faint" prose>
                datadrop stores only a hash of this. Dismissing this panel is
                irreversible; if you lose it, revoke the token and mint another.
              </Text>
            </Stack>
          </Surface>
        )}

        <Stack gap={2}>
          <SectionLabel>New token</SectionLabel>
          {!mintable && (
            <Text size="small" tone="faint" prose>
              Minting requires a signed-in browser session. A token may not mint
              another token — otherwise revoking a leaked credential would leave
              whatever it created still working.
            </Text>
          )}
          <Toolbar tight>
            <input
              aria-label="token name"
              placeholder="ci ingest"
              value={name}
              disabled={!mintable}
              onChange={(event) => setName(event.target.value)}
              style={{ font: "inherit", padding: "2px 4px", border: "var(--pbui-border-hair)" }}
            />
            <select
              aria-label="expires in"
              value={expiresIn}
              disabled={!mintable}
              onChange={(event) => setExpiresIn(event.target.value)}
              style={{ font: "inherit" }}
            >
              {EXPIRIES.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Toolbar>
          <Toolbar tight>
            {SCOPES.map((scope) => (
              <label key={scope} style={{ fontSize: "var(--pbui-fs-small)" }}>
                <input
                  type="checkbox"
                  disabled={!mintable}
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((s) => s !== scope),
                    )
                  }
                />{" "}
                {scope}
              </label>
            ))}
          </Toolbar>
          <Toolbar tight>
            <button
              type="button"
              disabled={!mintable || minting || !name.trim() || scopes.length === 0}
              onClick={() => void mint()}
              data-testid="mint-token"
            >
              <Text size="small">{minting ? "minting…" : "Mint token"}</Text>
            </button>
          </Toolbar>
          {error && (
            <Text size="small" tone="danger">
              {error}
            </Text>
          )}
          <Text size="tiny" tone="faint" prose>
            Scopes narrow what a token may do. They never grant more than you
            have: remove yourself from a drop and every token you hold loses it
            immediately.
          </Text>
        </Stack>

        <Divider />

        <Stack gap={2}>
          <Toolbar tight>
            <SectionLabel>Your tokens</SectionLabel>
            <label style={{ fontSize: "var(--pbui-fs-tiny)" }}>
              <input
                type="checkbox"
                checked={showRevoked}
                onChange={(event) => setShowRevoked(event.target.checked)}
              />{" "}
              show revoked
            </label>
          </Toolbar>

          {data?.tokens.length ? (
            data.tokens.map((token) => (
              <Toolbar key={token.id} tight>
                <TokenChip
                  token={{
                    id: token.id,
                    name: token.name,
                    scopes: token.scopes,
                    expiresAt: token.expires_at ?? null,
                    revokedAt: token.revoked_at ?? null,
                  }}
                />
                <Text size="tiny" tone="faint">
                  {token.scopes.join(" ")} ·{" "}
                  {token.last_used_at
                    ? `used ${token.last_used_at.slice(0, 10)}`
                    : "never used"}
                  {token.expires_at ? ` · expires ${token.expires_at.slice(0, 10)}` : ""}
                </Text>
                {!token.revoked_at && (
                  <button type="button" onClick={() => void revokeToken(token.id)}>
                    <Text size="tiny">revoke</Text>
                  </button>
                )}
              </Toolbar>
            ))
          ) : (
            <Text size="small" tone="faint">
              none yet
            </Text>
          )}
        </Stack>
      </Stack>
    </AppBody>
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
