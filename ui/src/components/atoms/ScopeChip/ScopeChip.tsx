import styles from "./ScopeChip.module.css";

/**
 * One scope on a token.
 *
 * TokensApp rendered these as `token.scopes.join(" ")` — a single string, so
 * four scopes read as one long word and nothing could be pointed at. They are
 * four separate facts about what a credential may do, and the one that matters
 * most is `admin`.
 *
 * Not a `Chip`: a Chip is the body of a *presentation*, and a scope is not one
 * — there is no scope descriptor, no menu of scope verbs, and adding them would
 * mean claiming a scope is an object you can act on. It is an attribute.
 */
export function ScopeChip({ scope }: { scope: string }) {
  // `admin` is the one worth a second look on a list of eight tokens.
  const privileged = scope === "admin";
  return (
    <span
      className={[styles.scope, privileged ? styles.privileged : ""].filter(Boolean).join(" ")}
      title={privileged ? `${scope} — bypasses per-drop membership checks` : scope}
    >
      {scope}
    </span>
  );
}
