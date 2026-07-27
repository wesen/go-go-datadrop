import { Presentation } from "../../../pbui";
import type { TokenRef } from "../../../pbui";
import { Chip } from "../Chip";

/**
 * `<token>` on screen.
 *
 * Shows the name and the public id. The id is deliberately visible: it is what
 * an audit row carries, so being able to read it off the screen is what makes
 * "which credential did this" answerable.
 */
export function TokenChip({ token }: { token: TokenRef }) {
  const revoked = token.revokedAt !== null;
  return (
    <Presentation
      ptype="token"
      value={token}
      doc={`<token> ${token.name} · ${token.id}${revoked ? " · REVOKED" : ""}`}
    >
      <Chip
        label={token.name}
        tone="var(--pbui-tone-step)"
        badge={<code style={{ opacity: 0.7, fontSize: "var(--pbui-fs-tiny)" }}>{token.id}</code>}
        state={revoked ? "stale" : undefined}
        title={revoked ? `revoked ${token.revokedAt}` : token.scopes.join(" ")}
      />
    </Presentation>
  );
}
