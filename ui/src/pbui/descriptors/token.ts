import type { PresentationDescriptor } from "../registry";
import type { TokenRef } from "../types";
import type { Action } from "../verbs";

/**
 * `<token>` — an API credential, by id.
 *
 * Nothing here can reach a secret, because TokenRef has no field for one
 * (DR-28). `describe` feeds the inspector, which is exactly the surface that
 * would leak it.
 */
export const tokenDescriptor: PresentationDescriptor<TokenRef> = {
  ptype: "token",
  tone: "var(--pbui-tone-step)",

  label: (token) => `${token.name} · ${token.id}`,

  describe: (token) => ({
    presentationType: "token",
    id: token.id,
    name: token.name,
    scopes: token.scopes,
    expiresAt: token.expiresAt ?? "never",
    revokedAt: token.revokedAt ?? null,
    // Stated because it is the property people most often misunderstand about
    // scoped credentials.
    note: "scopes narrow what this token may do; they never grant more than its owner has",
  }),

  actions: (token): Action[] => [
    {
      label: "Revoke",
      verb: { kind: "revokeToken", tokenId: token.id },
      // Greyed with a reason rather than hidden: a user who never sees the
      // entry never learns the token is already dead.
      disabledBecause: token.revokedAt ? "this token is already revoked" : undefined,
    },
    { label: "Inspect", verb: { kind: "inspect", ptype: "token", value: token } },
  ],
};
