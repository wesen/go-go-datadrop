/**
 * The credential guard, in one place, because it now guards three doors.
 *
 * It began in `store/persist.ts` as the audit on `localStorage`. DATADROP-8
 * adds two more: a bundle on its way *out* to the clipboard and a bundle on its
 * way *in* from it. The export side is the load-bearing one — a bundle is
 * designed to be shared, which makes it a far more dangerous carrier than
 * localStorage ever was — and a second copy of this regular expression that
 * drifted from the first would be worse than no second net at all.
 *
 * It lives in `model/` rather than `store/` for the layer graph: `model`
 * imports nothing, `store` imports `model`, and `model/portable.ts` needs it.
 *
 * **This is the second net, not the first.** The first is that no credential is
 * ever put anywhere it could reach: `TokenRef` has no secret field and
 * `pbui/types.ts` says that absence is load-bearing (DR-28). A guard that
 * catches something has already found a design mistake upstream.
 */

/** Keys that must never reach durable storage or a shared document. */
const FORBIDDEN = /^(token|authorization|auth|bearer|secret|password|apikey|api_key)$/i;

/** Walk a value and report the path of any forbidden key. Cycle-safe. */
export function findSecrets(value: unknown, path = "", seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key)) found.push(path ? `${path}.${key}` : key);
    found.push(...findSecrets(child, path ? `${path}.${key}` : key, seen));
  }
  return found;
}
