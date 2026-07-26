import type { ChartSpec, Geom } from "./chart";
import { describeSource } from "./chart";
import type { Step } from "./pipeline";
import { findSecrets } from "./secrets";
import type { SourceRef } from "./table";

/**
 * The portable format: one envelope, three kinds.
 *
 * A tile, a workspace or a whole stage as a small JSON document that survives
 * a chat message, another browser and another account. Pure — no React, no
 * store, no browser API — which is why it is in `model/`: the strictest row in
 * the layer table, and the cheapest place to test.
 *
 * It describes a store shape, so `store/` might look like the natural home. It
 * is not: the format is a *value type*, like `ChartSpec`. It has no lifecycle,
 * no reducer and no persistence, and its whole job is to be converted to and
 * from. The conversions that touch `LayoutState` live in `store/bundles.ts` and
 * import this, which is the right direction.
 *
 * ## What a bundle contains, and what it must never contain
 *
 * **Never a credential.** `findSecrets` guards both directions — the exporter
 * refuses to produce a bundle that trips it and the importer refuses to accept
 * one. The export side is the load-bearing one: a bundle is *designed to be
 * shared*, which makes it a far more dangerous carrier than localStorage.
 *
 * **Necessarily a `SourceRef`.** A bundle names drops, streams and datasets and
 * carries the filters the user typed. That is not data — there is not one row
 * in it — but it is not nothing: an internal drop name may itself be sensitive
 * and a filter value may be worse. The clipboard is the right transport for
 * exactly the reason DATADROP-3 chose a URL fragment over a query parameter:
 * nothing transmits it anywhere unless the user pastes it somewhere.
 *
 * **Importing a bundle grants no access.** A workspace naming a drop the
 * importer cannot read imports fine and shows a 403 in that tile. Authorisation
 * is the server's job; the bundle is a set of references; a client that
 * pre-filtered them would be enforcing a policy it does not know.
 */

export const BUNDLE_VERSION = 1;

export type BundleKind = "tile" | "workspace" | "stage";

/**
 * Caps. A bundle that exceeds any of these is refused, not truncated.
 *
 * A clipboard is a more hostile input than your own localStorage: it holds
 * whatever the last program put there, and a user will paste a log line, half a
 * bundle truncated by a chat client, and a 4 MB minified bundle from a colleague
 * who scripted something. `depth` in particular guards the recursive walkers
 * below against a hand-made tree that would blow the stack.
 */
export const LIMITS = {
  bytes: 512 * 1024, // a 512 kB layout is not a layout
  leaves: 64, // 64 tiles is more than any screen can show
  docs: 64,
  depth: 24, // split-tree depth
  spaces: 32, // per stage
} as const;

/**
 * A stage's chrome, restated here.
 *
 * Structurally identical to `store/layout.ts`'s `StageChrome` and deliberately
 * not imported from it: `model` may import nothing outside `model`, and the
 * direction of that rule is what keeps this file testable in milliseconds. The
 * two are checked against each other by assignment at the one place they meet,
 * `store/bundles.ts`.
 */
export interface PortableChrome {
  masthead: boolean;
  workspaces: boolean;
  stageBar: boolean;
}

/**
 * A document, by content.
 *
 * No id. See `PortableNode` for why.
 */
export interface PortableDoc {
  name: string;
  limit: number;
  spec: ChartSpec;
}

/**
 * A split tree, with ids removed and documents referenced BY INDEX (DR-64).
 *
 * This is the most important decision in the format and the easiest to get
 * wrong, because the obvious implementation — `JSON.stringify(node)` — compiles,
 * runs and produces a plausible-looking bundle that is broken in two ways.
 *
 * `id` is a node id unique to the exporting tree. Importing it into the tree it
 * came from — which is exactly what "duplicate by copy and paste" does —
 * produces two nodes with one id, and a duplicate React key is a hit-test that
 * returns the wrong tile.
 *
 * `docId` names a document in the exporting store's `world` slice, which the
 * receiving store has never heard of. Inlining the document at each leaf
 * instead would be simpler to write and would silently destroy the property the
 * world/layout split exists to provide: a workspace with a chart and a table on
 * document α would come back as two tiles on two *independent copies* of α, and
 * changing a filter in the pipeline would stop moving the chart. The user would
 * report that as "import is broken" and would be right.
 *
 * An index preserves sharing exactly. Two leaves with `doc: 0` import to two
 * leaves pointing at one minted document.
 */
export type PortableNode =
  | { leaf: { app: string; label?: string; doc?: number } }
  | { split: { dir: "row" | "col"; ratio: number; a: PortableNode; b: PortableNode } };

export interface TilePayload {
  app: string;
  label?: string;
  /**
   * Inlined, not an array with an index of zero.
   *
   * The one place the format is not uniform, and it is worth the inconsistency:
   * a tile has at most one document, and the tile bundle is the one users will
   * actually read.
   */
  doc?: PortableDoc;
}

export interface WorkspacePayload {
  name: string;
  tree: PortableNode;
  docs: PortableDoc[];
  /** The workspace's own allow-list, if it had one. */
  apps?: string[] | null;
}

export interface StagePayload {
  name: string;
  apps: string[] | null;
  chrome: PortableChrome;
  spaces: WorkspacePayload[];
  /**
   * Hoisted to the stage, because two workspaces in one stage may share a
   * document and the index argument applies identically one level up. A
   * workspace payload nested here has an empty `docs` and its leaves index into
   * this array.
   */
  docs: PortableDoc[];
}

export type PayloadFor<K> = K extends "tile"
  ? TilePayload
  : K extends "workspace"
    ? WorkspacePayload
    : K extends "stage"
      ? StagePayload
      : never;

export interface Bundle<K extends BundleKind = BundleKind> {
  /**
   * A magic string, checked before anything else.
   *
   * Users paste the wrong thing — a chart permalink, a CSV row, a log line,
   * half a bundle truncated by a chat client. A magic string means the failure
   * message can be "that is not a DATALAB layout" rather than "unexpected token
   * < in JSON at position 0", and the difference between those two sentences is
   * whether the reader knows what to do next.
   */
  format: "datadrop.layout";
  /**
   * Checked for exact equality on the way in.
   *
   * Version 2 will exist; a version-2 bundle pasted into a version-1 build must
   * be refused with "exported by a newer version" rather than partially
   * understood.
   */
  version: number;
  kind: K;
  /** ISO 8601. Informational — shown in the template library, never trusted. */
  exportedAt: string;
  /** Free text the exporter typed, or the object's own name. */
  name: string;
  payload: PayloadFor<K>;
}

export const FORMAT = "datadrop.layout" as const;

/* ------------------------------------------------------------- reasons -- */

/**
 * Every refusal, in one place, because these strings are the specification.
 *
 * `parseBundle` returns a *reason* rather than `null` — the one place it
 * differs in shape from its sibling `persist.validate`. `validate`'s caller
 * falls back to defaults and writes a console warning nobody reads;
 * `parseBundle`'s caller is a dialog with a human in front of it, and "that
 * bundle names 91 tiles; the limit is 64" is a sentence that ends the
 * interaction. A `null` there produces "import failed", which does not.
 */
export const REASONS = {
  notALayout: "that is not a DATALAB layout",
  newer: "that was exported by a newer version of DATALAB",
  older: "that was exported by an older version and cannot be read",
  damaged: "that bundle is damaged",
  credential: "that bundle contains something credential-shaped and was refused",
  wrongKind: (found: BundleKind, wanted: BundleKind) =>
    `that is a ${found}; this ${wanted} can only take a ${wanted}`,
  tooManyTiles: (found: number) =>
    `that bundle names ${found} tiles; the limit is ${LIMITS.leaves}`,
  tooManyDocs: (found: number) =>
    `that bundle names ${found} documents; the limit is ${LIMITS.docs}`,
  tooManySpaces: (found: number) =>
    `that bundle names ${found} workspaces; the limit is ${LIMITS.spaces}`,
  tooDeep: `that bundle nests tiles more than ${LIMITS.depth} deep`,
  tooBig: (bytes: number) =>
    `that bundle is ${Math.round(bytes / 1024)} kB; the limit is ${LIMITS.bytes / 1024} kB`,
} as const;

export type ParseResult = { ok: true; bundle: Bundle } | { ok: false; reason: string };

/* ---------------------------------------------------------- validation -- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSource(value: unknown): value is SourceRef {
  if (!isRecord(value)) return false;
  if (value.kind !== "stream" && value.kind !== "dataset") return false;
  return typeof value.drop === "string";
}

const GEOMS = new Set<string>(["point", "line", "bar", "area"]);
const STEP_KINDS = new Set<string>(["filter", "derive", "summarize", "sort", "limit"]);

function isStep(value: unknown): value is Step {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.kind !== "string" || !STEP_KINDS.has(value.kind)) return false;
  return typeof value.on === "boolean";
}

function isSpec(value: unknown): value is ChartSpec {
  if (!isRecord(value)) return false;
  if (!isSource(value.source)) return false;
  if (!Array.isArray(value.steps) || !value.steps.every(isStep)) return false;
  if (typeof value.geom !== "string" || !GEOMS.has(value.geom)) return false;
  if (!isRecord(value.mapping)) return false;
  for (const channel of ["x", "y", "color", "size", "facet"]) {
    const mapped = value.mapping[channel];
    if (mapped !== null && mapped !== undefined && typeof mapped !== "string") return false;
  }
  return value.yScale === "linear" || value.yScale === "log";
}

function isDoc(value: unknown): value is PortableDoc {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.limit === "number" &&
    Number.isFinite(value.limit) &&
    isSpec(value.spec)
  );
}

/**
 * Structure and depth in one walk.
 *
 * Depth is checked *here* rather than afterwards because the check has to
 * bound the recursion that would otherwise blow the stack on a hand-made
 * bundle — a validator that overflows before reporting its limit is not a
 * validator.
 */
function isPortableNode(value: unknown, depth = 0): value is PortableNode {
  if (depth > LIMITS.depth) return false;
  if (!isRecord(value)) return false;

  if ("leaf" in value) {
    const leaf = value.leaf;
    if (!isRecord(leaf)) return false;
    if (typeof leaf.app !== "string" || leaf.app === "") return false;
    if (leaf.label !== undefined && typeof leaf.label !== "string") return false;
    if (leaf.doc !== undefined && !Number.isInteger(leaf.doc)) return false;
    return true;
  }
  if ("split" in value) {
    const split = value.split;
    if (!isRecord(split)) return false;
    if (split.dir !== "row" && split.dir !== "col") return false;
    if (typeof split.ratio !== "number" || !Number.isFinite(split.ratio)) return false;
    return isPortableNode(split.a, depth + 1) && isPortableNode(split.b, depth + 1);
  }
  return false;
}

/** How deep a portable tree nests. Only called on a structurally valid one. */
function depthOf(node: PortableNode): number {
  return "leaf" in node ? 1 : 1 + Math.max(depthOf(node.split.a), depthOf(node.split.b));
}

/** How many leaves a portable tree has. */
export function countPortableLeaves(node: PortableNode): number {
  return "leaf" in node ? 1 : countPortableLeaves(node.split.a) + countPortableLeaves(node.split.b);
}

/** Every leaf in a portable tree, in order. */
export function portableLeaves(
  node: PortableNode,
): Array<{ app: string; label?: string; doc?: number }> {
  return "leaf" in node
    ? [node.leaf]
    : [...portableLeaves(node.split.a), ...portableLeaves(node.split.b)];
}

/**
 * Clamp a split ratio into the range the renderer can draw.
 *
 * The same clamp `persist.validate` applies, and for the same reason: a ratio
 * of 0.001 is a tile one pixel wide with no way to grab its divider.
 */
export function clampRatio(ratio: number): number {
  return Math.min(0.95, Math.max(0.05, ratio));
}

function checkWorkspacePayload(payload: unknown, ownDocs: boolean): string | null {
  if (!isRecord(payload)) return REASONS.damaged;
  if (typeof payload.name !== "string") return REASONS.damaged;
  if (!isPortableNode(payload.tree)) return REASONS.damaged;
  if (payload.apps !== undefined && payload.apps !== null) {
    if (!Array.isArray(payload.apps) || !payload.apps.every((a) => typeof a === "string")) {
      return REASONS.damaged;
    }
  }
  if (ownDocs) {
    if (!Array.isArray(payload.docs) || !payload.docs.every(isDoc)) return REASONS.damaged;
    if (payload.docs.length > LIMITS.docs) return REASONS.tooManyDocs(payload.docs.length);
  } else if (payload.docs !== undefined && !Array.isArray(payload.docs)) {
    return REASONS.damaged;
  }

  const tree = payload.tree as PortableNode;
  const leaves = countPortableLeaves(tree);
  if (leaves > LIMITS.leaves) return REASONS.tooManyTiles(leaves);
  if (depthOf(tree) > LIMITS.depth) return REASONS.tooDeep;
  return null;
}

/**
 * Text in, a bundle or a reason out. Never throws, never partially applies.
 *
 * A sibling of `store/persist.ts`'s `validate`: reject a wrong version
 * outright, check structure narrowly rather than trusting `as`, repair what is
 * repairable (a ratio out of range is clamped, as `validate` clamps it), and
 * refuse everything else with a sentence.
 */
export function parseBundle(text: string, expect?: BundleKind): ParseResult {
  if (text.length > LIMITS.bytes) return { ok: false, reason: REASONS.tooBig(text.length) };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: REASONS.notALayout };
  }

  if (!isRecord(raw) || raw.format !== FORMAT) {
    return { ok: false, reason: REASONS.notALayout };
  }
  if (typeof raw.version !== "number") return { ok: false, reason: REASONS.notALayout };
  if (raw.version > BUNDLE_VERSION) return { ok: false, reason: REASONS.newer };
  if (raw.version < BUNDLE_VERSION) return { ok: false, reason: REASONS.older };

  const kind = raw.kind;
  if (kind !== "tile" && kind !== "workspace" && kind !== "stage") {
    return { ok: false, reason: REASONS.notALayout };
  }
  if (expect && kind !== expect) {
    return { ok: false, reason: REASONS.wrongKind(kind, expect) };
  }
  if (typeof raw.name !== "string" || typeof raw.exportedAt !== "string") {
    return { ok: false, reason: REASONS.damaged };
  }

  // The credential audit runs on the WHOLE parsed value, before any of it is
  // trusted, and it is the same function `save()` uses. Both directions, one
  // net (DR-28's second one — the first is that no credential is anywhere it
  // could reach a spec).
  if (findSecrets(raw).length > 0) return { ok: false, reason: REASONS.credential };

  const payload = raw.payload;
  if (kind === "tile") {
    if (!isRecord(payload)) return { ok: false, reason: REASONS.damaged };
    if (typeof payload.app !== "string" || payload.app === "") {
      return { ok: false, reason: REASONS.damaged };
    }
    if (payload.label !== undefined && typeof payload.label !== "string") {
      return { ok: false, reason: REASONS.damaged };
    }
    if (payload.doc !== undefined && !isDoc(payload.doc)) {
      return { ok: false, reason: REASONS.damaged };
    }
  } else if (kind === "workspace") {
    const bad = checkWorkspacePayload(payload, true);
    if (bad) return { ok: false, reason: bad };
  } else {
    if (!isRecord(payload)) return { ok: false, reason: REASONS.damaged };
    if (typeof payload.name !== "string") return { ok: false, reason: REASONS.damaged };
    if (payload.apps !== null && !Array.isArray(payload.apps)) {
      return { ok: false, reason: REASONS.damaged };
    }
    const chrome = payload.chrome;
    if (
      !isRecord(chrome) ||
      typeof chrome.masthead !== "boolean" ||
      typeof chrome.workspaces !== "boolean" ||
      typeof chrome.stageBar !== "boolean"
    ) {
      return { ok: false, reason: REASONS.damaged };
    }
    if (!Array.isArray(payload.docs) || !payload.docs.every(isDoc)) {
      return { ok: false, reason: REASONS.damaged };
    }
    if (payload.docs.length > LIMITS.docs) {
      return { ok: false, reason: REASONS.tooManyDocs(payload.docs.length) };
    }
    if (!Array.isArray(payload.spaces)) return { ok: false, reason: REASONS.damaged };
    if (payload.spaces.length > LIMITS.spaces) {
      return { ok: false, reason: REASONS.tooManySpaces(payload.spaces.length) };
    }
    let total = 0;
    for (const space of payload.spaces) {
      const bad = checkWorkspacePayload(space, false);
      if (bad) return { ok: false, reason: bad };
      total += countPortableLeaves((space as WorkspacePayload).tree);
    }
    if (total > LIMITS.leaves) return { ok: false, reason: REASONS.tooManyTiles(total) };
  }

  return { ok: true, bundle: raw as unknown as Bundle };
}

/* ------------------------------------------------------------ reading -- */

/** Counts for the export confirmation and the template library. */
export function measureBundle(bundle: Bundle): {
  tiles: number;
  docs: number;
  spaces: number;
  bytes: number;
} {
  const bytes = JSON.stringify(bundle).length;
  if (bundle.kind === "tile") {
    const payload = bundle.payload as TilePayload;
    return { tiles: 1, docs: payload.doc ? 1 : 0, spaces: 0, bytes };
  }
  if (bundle.kind === "workspace") {
    const payload = bundle.payload as WorkspacePayload;
    return {
      tiles: countPortableLeaves(payload.tree),
      docs: payload.docs.length,
      spaces: 1,
      bytes,
    };
  }
  const payload = bundle.payload as StagePayload;
  return {
    tiles: payload.spaces.reduce((n, space) => n + countPortableLeaves(space.tree), 0),
    docs: payload.docs.length,
    spaces: payload.spaces.length,
    bytes,
  };
}

/** Every source a bundle names, deduplicated, in order. */
export function sourcesOf(bundle: Bundle): SourceRef[] {
  const docs =
    bundle.kind === "tile"
      ? [(bundle.payload as TilePayload).doc].filter((d): d is PortableDoc => !!d)
      : ((bundle.payload as WorkspacePayload | StagePayload).docs ?? []);
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const doc of docs) {
    const key = describeSource(doc.spec.source);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(doc.spec.source);
  }
  return out;
}

/**
 * One sentence describing a bundle, for the dialog and the library.
 *
 * Re-run on every keystroke in the import dialog, which is what lets the
 * confirm button be disabled for content that would fail. **A user should never
 * be able to press a button that then reports an error** — the same principle
 * as `CHANNEL_ACCEPTS` filtering the channel dropdown rather than the plot
 * engine rejecting the selection afterwards.
 */
export function describeBundle(bundle: Bundle): string {
  const { tiles, docs, spaces } = measureBundle(bundle);
  const sources = sourcesOf(bundle);
  const reading = sources.length === 0 ? "" : `, reading ${sources.map(describeSource).join(", ")}`;

  if (bundle.kind === "tile") {
    const payload = bundle.payload as TilePayload;
    const doc = payload.doc ? ` on a document called ${payload.doc.name}` : "";
    return `A tile: ${payload.app}${doc}${reading}.`;
  }
  if (bundle.kind === "workspace") {
    const payload = bundle.payload as WorkspacePayload;
    return `A workspace “${payload.name}”: ${plural(tiles, "tile")}, ${plural(docs, "document")}${reading}.`;
  }
  const payload = bundle.payload as StagePayload;
  return (
    `A stage “${payload.name}”: ${plural(spaces, "workspace")}, ` +
    `${plural(tiles, "tile")}, ${plural(docs, "document")}${reading}.`
  );
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Application ids a bundle names that this build does not have.
 *
 * A **warning**, never a refusal. Three answers are defensible — refuse, drop
 * those tiles, or import them naming the missing application — and the third is
 * right, because `Tile` already renders exactly that case ("no application
 * called 'chartsy' — choose one above") and it preserves the shape of what was
 * shared. The reader sees a four-tile layout with one tile they cannot fill,
 * which is true, rather than a three-tile layout, which is a lie about what
 * their colleague sent. Refusing outright makes the common case — a version skew
 * of one application — unrecoverable.
 */
export function unknownApps(bundle: Bundle, known: ReadonlySet<string>): string[] {
  const apps: string[] = [];
  if (bundle.kind === "tile") apps.push((bundle.payload as TilePayload).app);
  else if (bundle.kind === "workspace") {
    apps.push(...portableLeaves((bundle.payload as WorkspacePayload).tree).map((l) => l.app));
  } else {
    for (const space of (bundle.payload as StagePayload).spaces) {
      apps.push(...portableLeaves(space.tree).map((l) => l.app));
    }
  }
  return [...new Set(apps.filter((app) => !known.has(app)))].sort();
}

/** A geom this build can draw, or "point". Used when re-hydrating a spec. */
export function safeGeom(geom: string): Geom {
  return (GEOMS.has(geom) ? geom : "point") as Geom;
}
