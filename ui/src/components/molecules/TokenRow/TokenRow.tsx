import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { Button, ScopeChip, TokenChip } from "../../atoms";
import type { TokenRef } from "../../../pbui";

/**
 * Deliberately the wire shape from `api/client`, optional fields and all.
 *
 * The alternative is a normalised type here and a mapping in every container,
 * which is four hand-written object literals whose only job is to turn
 * `undefined` into `null`. A row that renders the server's own shape is one
 * less place for those two to disagree.
 */
export interface TokenSummary {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
}

/**
 * One API token in the list.
 *
 * The scopes were `token.scopes.join(" ")` — four separate facts rendered as
 * one long word. They are now `ScopeChip`s, so `admin` is visible on a list of
 * eight tokens rather than buried in the middle of a string.
 *
 * A revoked token is shown, not hidden. "Did I revoke that one?" is a question
 * that needs an answer, and an absent row does not give one; the chip carries
 * the revoked state and the revoke button disappears.
 *
 * The value passed to `TokenChip` is a `TokenRef`, which has no secret field.
 * That absence is load-bearing (DR-28): a presentation value flows into the
 * inspector, the watchlist and the trace, so a secret placed here reaches all
 * three.
 */
export function TokenRow({
  token,
  onRevoke,
}: {
  token: TokenSummary;
  onRevoke?(id: string): void;
}) {
  const ref: TokenRef = {
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    expiresAt: token.expires_at ?? null,
    revokedAt: token.revoked_at ?? null,
  };

  return (
    <Stack direction="row" gap={2} align="center" wrap data-part="token-row">
      <TokenChip token={ref} />
      <Stack direction="row" gap={1} wrap as="span">
        {token.scopes.map((scope) => (
          <ScopeChip key={scope} scope={scope} />
        ))}
      </Stack>
      <Text size="tiny" tone="faint">
        {token.last_used_at ? `used ${token.last_used_at.slice(0, 10)}` : "never used"}
        {token.expires_at ? ` · expires ${token.expires_at.slice(0, 10)}` : ""}
      </Text>
      {!token.revoked_at && onRevoke && (
        <Button size="tiny" tone="danger" onClick={() => onRevoke(token.id)}>
          revoke
        </Button>
      )}
    </Stack>
  );
}
