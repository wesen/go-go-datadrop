import type { LayoutState, Node, Workspace } from "./layout";
import { mergePinned } from "./spaces";
import type { WorldState } from "./world";

/**
 * localStorage persistence, defensively.
 *
 * A layout written by a previous version, hand-edited, or truncated by a full
 * quota must produce the defaults and a console warning — never a blank screen.
 * The prototype restores without validating (pbui-gog.jsx:227-240) and gets away
 * with it because the shape never changed; ours will change, repeatedly.
 *
 * The token is NEVER written here. It lives in sessionStorage and nothing else
 * belongs there (guide §5.6). What is persisted is tile arrangements and chart
 * specifications, and that payload is audited by a test for anything
 * token-shaped, because "a snapshot is designed to be shared" and a shared
 * snapshot carrying a bearer token is a credential-exfiltration feature.
 *
 * **The key is a parameter, not a constant** (DATADROP-7 DR-47). It used to be
 * the module-level `KEY` below, which is correct while there is one workbench
 * per page and destructive the moment there is not: five embedded instances
 * would each run the 500 ms debounced `save()` against one key, so the reader's
 * real layout would be overwritten by whichever tutorial section they last
 * scrolled past, silently. `usePersistence(null)` — the default for an embedded
 * instance — never calls either function.
 */

/** The application's key. Embedded instances pass null and persist nothing. */
export const WORKBENCH_KEY = "datadrop-workbench";
/** Bumped when a shape change makes older payloads unreadable. */
const VERSION = 1;

interface Persisted {
  version: number;
  world: Pick<
    WorldState,
    "docs" | "docOrder" | "activeDocId" | "snapshots" | "snapshotOrder" | "pins" | "watch"
  >;
  layout: LayoutState;
}

/** Keys that must never reach durable storage. */
const FORBIDDEN = /^(token|authorization|auth|bearer|secret|password|apikey|api_key)$/i;

/** Walk a value and report any forbidden key. Depth-limited, cycle-safe. */
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

function isNode(value: unknown): value is Node {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<Node> & { type?: string };
  if (typeof node.id !== "string") return false;
  if (node.type === "leaf") return typeof (node as { app?: unknown }).app === "string";
  if (node.type === "split") {
    const s = node as { a?: unknown; b?: unknown; ratio?: unknown; dir?: unknown };
    return (
      (s.dir === "row" || s.dir === "col") &&
      typeof s.ratio === "number" &&
      s.ratio >= 0.05 &&
      s.ratio <= 0.95 &&
      isNode(s.a) &&
      isNode(s.b)
    );
  }
  return false;
}

function isWorkspace(value: unknown): value is Workspace {
  const space = value as Partial<Workspace>;
  return (
    !!space &&
    typeof space.id === "string" &&
    typeof space.name === "string" &&
    isNode(space.tree)
  );
}

export function validate(raw: unknown): Persisted | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<Persisted>;
  if (data.version !== VERSION) return null;
  if (!data.world || !data.layout) return null;
  if (!Array.isArray(data.layout.spaces) || data.layout.spaces.length === 0) return null;
  if (!data.layout.spaces.every(isWorkspace)) return null;
  if (typeof data.world.docs !== "object" || !Array.isArray(data.world.docOrder)) return null;

  // The hardwired spaces are re-created from code on every load, replacing
  // whatever was stored under their ids (DR-29). A user who deleted the account
  // space in a previous release gets it back; a user who added a tile to it
  // loses that tile, which is what "hardwired" means.
  const spaces = mergePinned(data.layout.spaces);

  // A currentSpaceId naming a space that is gone would render nothing.
  const current = spaces.some((s) => s.id === data.layout?.currentSpaceId)
    ? data.layout.currentSpaceId
    : (spaces[0] as Workspace).id;

  return {
    version: VERSION,
    world: data.world,
    layout: { spaces, currentSpaceId: current },
  };
}

export function save(key: string, world: WorldState, layout: LayoutState): void {
  const payload: Persisted = {
    version: VERSION,
    world: {
      docs: world.docs,
      docOrder: world.docOrder,
      activeDocId: world.activeDocId,
      snapshots: world.snapshots,
      snapshotOrder: world.snapshotOrder,
      pins: world.pins,
      watch: world.watch,
      // Deliberately not the trace: it is a session-scoped teaching surface,
      // and restoring yesterday's transcript beside today's work is confusing
      // rather than useful.
    },
    layout,
  };

  const secrets = findSecrets(payload);
  if (secrets.length > 0) {
    // Refuse rather than truncate. Losing a layout is an annoyance; writing a
    // credential to durable storage is not.
    console.error("refusing to persist: credential-shaped keys", secrets);
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    // A full quota must not take the application down with it.
    console.warn("could not persist the workbench layout", error);
  }
}

export function load(key: string): Persisted | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const valid = validate(parsed);
    if (!valid) {
      console.warn("stored workbench layout is not readable by this version — using defaults");
      return null;
    }
    return valid;
  } catch (error) {
    console.warn("could not restore the workbench layout", error);
    return null;
  }
}

export function clear(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
