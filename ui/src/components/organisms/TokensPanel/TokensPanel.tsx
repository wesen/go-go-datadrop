import { useState } from "react";
import { AppBody, Stack, Toolbar } from "../../layout";
import { CodeText, Divider, SectionLabel, Text } from "../../foundation";
import { Button, CheckboxRow, SelectInput, TextInput } from "../../atoms";
import { Callout, EmptyState, ErrorNotice, ScopeChecklist, TokenRow } from "../../molecules";
import type { TokenSummary } from "../../molecules";

export interface MintRequest {
  name: string;
  scopes: string[];
  expiresIn: string;
}

export interface MintedToken {
  id: string;
  token: string;
}

const EXPIRIES = [
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "", label: "never" },
];

/**
 * The way in for machines.
 *
 * **The secret is a prop and never state that outlives the panel.** It exists
 * in the container's component state and in one HTTP response; it is never put
 * in Redux, never in a presentation value and never in a verb (DR-28), so it
 * cannot reach the inspector, the watchlist, the trace or localStorage. A
 * Storybook control for it would be a fourth place, which is why the story uses
 * a literal that is not a real token shape.
 *
 * Minting requires a browser session: a token must not be able to mint another
 * token, or revoking a leaked one leaves its offspring alive with no way to
 * enumerate them. Shown as a disabled form *with the reason* rather than a
 * hidden one — a rule you cannot see is a rule you cannot learn.
 */
export function TokensPanel({
  tokens,
  scopes: available,
  mintable,
  mintableReason,
  minting = false,
  minted,
  error,
  showRevoked,
  onShowRevokedChange,
  onMint,
  onDismissMinted,
  onRevoke,
  onCopy,
}: {
  tokens: readonly TokenSummary[];
  scopes: readonly string[];
  mintable: boolean;
  mintableReason?: string;
  minting?: boolean;
  /** Non-null for exactly as long as the one-time panel is up. */
  minted?: MintedToken | null;
  error?: string | null;
  showRevoked: boolean;
  onShowRevokedChange(next: boolean): void;
  onMint(request: MintRequest): void;
  onDismissMinted(): void;
  onRevoke(id: string): void;
  onCopy?(secret: string): void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(["drops:read"]);
  const [expiresIn, setExpiresIn] = useState("90d");

  return (
    <AppBody>
      <Stack gap={4}>
        {minted && (
          <Callout
            variant="ok"
            title="Copy this now — it is shown once"
            actions={
              <>
                <Button onClick={() => onCopy?.(minted.token)}>Copy</Button>
                <Button onClick={onDismissMinted}>Done</Button>
              </>
            }
          >
            <Stack gap={2}>
              <CodeText wrapAnywhere>{minted.token}</CodeText>
              <Text size="tiny" tone="faint" prose>
                datadrop stores only a hash of this. Dismissing this panel is irreversible; if you
                lose it, revoke the token and mint another.
              </Text>
            </Stack>
          </Callout>
        )}

        <Stack gap={2}>
          <SectionLabel>New token</SectionLabel>
          {!mintable && mintableReason && (
            <Text size="small" tone="faint" prose>
              {mintableReason}
            </Text>
          )}
          <Toolbar tight>
            <TextInput
              label="token name"
              placeholder="ci ingest"
              value={name}
              disabled={!mintable}
              onValueChange={setName}
            />
            <SelectInput
              label="expires in"
              value={expiresIn}
              disabled={!mintable}
              onValueChange={setExpiresIn}
              options={EXPIRIES}
            />
          </Toolbar>
          <ScopeChecklist
            available={available}
            selected={selected}
            disabled={!mintable}
            onSelectedChange={setSelected}
          />
          <Toolbar tight>
            <Button
              disabled={!mintable || !name.trim() || selected.length === 0}
              busy={minting ? "minting…" : undefined}
              data-testid="mint-token"
              onClick={() => onMint({ name, scopes: selected, expiresIn })}
            >
              Mint token
            </Button>
          </Toolbar>
          {error && <ErrorNotice message={error} />}
        </Stack>

        <Divider />

        <Stack gap={2}>
          <Toolbar tight>
            <SectionLabel>Your tokens</SectionLabel>
            <CheckboxRow
              size="tiny"
              label="show revoked"
              checked={showRevoked}
              onCheckedChange={onShowRevokedChange}
            />
          </Toolbar>

          {tokens.length === 0 ? (
            <EmptyState
              message="none yet"
              hint="Mint one above to use the CLI or CI. It works with `datadrop` unchanged."
            />
          ) : (
            tokens.map((token) => <TokenRow key={token.id} token={token} onRevoke={onRevoke} />)
          )}
        </Stack>
      </Stack>
    </AppBody>
  );
}
