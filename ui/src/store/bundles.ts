import {
  BUNDLE_VERSION,
  FORMAT,
  clampRatio,
  type Bundle,
  type PortableDoc,
  type PortableNode,
  type StagePayload,
  type TilePayload,
  type WorkspacePayload,
} from "../model/portable";
import { findSecrets } from "../model/secrets";
import type { DocId } from "../pbui/types";
import { findLeaf, type LayoutState, type Node, type Stage, type Workspace } from "./layout";
import type { Doc, WorldState } from "./world";

/**
 * State ↔ bundle, in both directions, and nowhere else.
 *
 * Every function here is **pure**: it takes state and returns a value, or takes
 * a bundle plus the ids to mint and returns the nodes and documents to insert.
 * Nothing reads a clock or a random number generator except through an argument,
 * for the reason `applyVerb.ts` already states about `Date.now()` — a reducer
 * that is not a pure function of its inputs produces a state tree that changes
 * when you replay it.
 *
 * The whole of DR-64 lives in `collect` and `hydrate` below: the exporter walks
 * the tree replacing `docId` with an index into a documents array, and the
 * importer walks the bundle minting one document per entry and replacing the
 * index with the new id. Twenty lines each, and between them they are why two
 * tiles on one document are still two tiles on one document after a round trip.
 */

/* ------------------------------------------------------------- export -- */

/** The exporting side of DR-64: ids out, indices in. */
class DocCollector {
  readonly docs: PortableDoc[] = [];
  private readonly index = new Map<DocId, number>();

  constructor(private readonly world: WorldState) {}

  /** The array index for a document id, adding it on first sight. */
  at(docId: DocId | null): number | undefined {
    if (!docId) return undefined;
    const seen = this.index.get(docId);
    if (seen !== undefined) return seen;
    const doc = this.world.docs[docId];
    if (!doc) return undefined;
    const next = this.docs.length;
    this.index.set(docId, next);
    this.docs.push(portableDoc(doc));
    return next;
  }
}

function portableDoc(doc: Doc): PortableDoc {
  // structuredClone rather than a spread: a shallow copy would alias `steps`
  // and `mapping`, so a later edit to the document would silently edit a bundle
  // that has already been measured — the same trap `cloneSpec` documents.
  return { name: doc.name, limit: doc.limit, spec: structuredClone(doc.spec) };
}

function portableTree(node: Node, collector: DocCollector): PortableNode {
  if (node.type === "leaf") {
    const doc = collector.at(node.docId);
    return {
      leaf: {
        app: node.app,
        // Written only when present, so a bundle a human reads has no
        // `"label": undefined` noise and two identical layouts stringify
        // identically.
        ...(node.label ? { label: node.label } : {}),
        ...(doc === undefined ? {} : { doc }),
      },
    };
  }
  return {
    split: {
      dir: node.dir,
      ratio: clampRatio(node.ratio),
      a: portableTree(node.a, collector),
      b: portableTree(node.b, collector),
    },
  };
}

function envelope<K extends Bundle["kind"]>(
  kind: K,
  name: string,
  payload: Bundle<K>["payload"],
  at: string,
): Bundle<K> {
  return { format: FORMAT, version: BUNDLE_VERSION, kind, exportedAt: at, name, payload };
}

/**
 * The export-side credential audit.
 *
 * Thrown rather than returned, because there is no recovery and no partial
 * result worth having: a bundle that trips this is a design mistake upstream,
 * and the caller's job is to tell the user the copy did not happen. The
 * importing side refuses the same shapes with a reason, because there the input
 * is untrusted and a sentence is the whole interaction.
 */
function auditted<B extends Bundle>(bundle: B): B {
  const secrets = findSecrets(bundle);
  if (secrets.length > 0) {
    throw new Error(`refusing to export: credential-shaped keys — ${secrets.join(", ")}`);
  }
  return bundle;
}

export interface BundleState {
  world: WorldState;
  layout: LayoutState;
}

export function bundleForTile(state: BundleState, nodeId: string, at: string): Bundle<"tile"> {
  const space = state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId);
  const node = space ? findLeaf(space.tree, nodeId) : null;
  if (node?.type !== "leaf") {
    throw new Error(`no tile ${nodeId} in the current workspace`);
  }
  const doc = node.docId ? state.world.docs[node.docId] : undefined;
  const payload: TilePayload = {
    app: node.app,
    ...(node.label ? { label: node.label } : {}),
    ...(doc ? { doc: portableDoc(doc) } : {}),
  };
  return auditted(envelope("tile", node.label ?? node.app, payload, at));
}

export function bundleForWorkspace(
  state: BundleState,
  spaceId: string,
  at: string,
): Bundle<"workspace"> {
  const space = state.layout.spaces.find((s) => s.id === spaceId);
  if (!space) throw new Error(`no workspace ${spaceId}`);
  const collector = new DocCollector(state.world);
  const tree = portableTree(space.tree, collector);
  const payload: WorkspacePayload = {
    name: space.name,
    tree,
    docs: collector.docs,
    ...(space.apps ? { apps: [...space.apps] } : {}),
  };
  return auditted(envelope("workspace", space.name, payload, at));
}

export function bundleForStage(state: BundleState, stageId: string, at: string): Bundle<"stage"> {
  const stage = state.layout.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`no stage ${stageId}`);
  // ONE collector across every workspace in the stage, which is what hoists the
  // documents and preserves sharing between two workspaces that read the same
  // one — the same argument as DR-64, one level up.
  const collector = new DocCollector(state.world);
  const spaces: WorkspacePayload[] = state.layout.spaces
    .filter((space) => space.stageId === stageId)
    .map((space) => ({
      name: space.name,
      tree: portableTree(space.tree, collector),
      docs: [],
      ...(space.apps ? { apps: [...space.apps] } : {}),
    }));
  const payload: StagePayload = {
    name: stage.name,
    apps: stage.apps ? [...stage.apps] : null,
    chrome: { ...stage.chrome },
    spaces,
    docs: collector.docs,
  };
  return auditted(envelope("stage", stage.name, payload, at));
}

/* ------------------------------------------------------------- import -- */

/**
 * Ids the caller minted, consumed in order.
 *
 * The alternative — calling `crypto.randomUUID()` in here — would make every
 * function below impure and every test dependent on a mock. `idsNeeded` says
 * how many to mint, so the caller can produce exactly the right number before
 * dispatching.
 */
export class IdPool {
  private next = 0;
  constructor(private readonly ids: readonly string[]) {}
  take(): string {
    const id = this.ids[this.next++];
    if (id === undefined) throw new Error("not enough ids were minted for this bundle");
    return id;
  }
}

/** How many fresh ids applying this bundle will consume. */
export function idsNeeded(bundle: Bundle): number {
  if (bundle.kind === "tile") {
    const payload = bundle.payload as TilePayload;
    return 1 + (payload.doc ? 1 : 0); // the leaf, and its document
  }
  if (bundle.kind === "workspace") {
    const payload = bundle.payload as WorkspacePayload;
    return 1 + payload.docs.length + nodesIn(payload.tree);
  }
  const payload = bundle.payload as StagePayload;
  return (
    1 + payload.docs.length + payload.spaces.reduce((n, space) => n + 1 + nodesIn(space.tree), 0)
  );
}

function nodesIn(node: PortableNode): number {
  return "leaf" in node ? 1 : 1 + nodesIn(node.split.a) + nodesIn(node.split.b);
}

export interface MintedDocs {
  /** New documents, keyed by their new id, to merge into the world. */
  docs: Record<DocId, Doc>;
  /** Bundle document index → new document id. */
  byIndex: string[];
}

/** Mint one world document per bundle document, in order. */
export function hydrateDocs(docs: readonly PortableDoc[], pool: IdPool): MintedDocs {
  const out: MintedDocs = { docs: {}, byIndex: [] };
  for (const portable of docs) {
    const id = pool.take();
    out.docs[id] = {
      id,
      name: portable.name,
      limit: portable.limit,
      spec: structuredClone(portable.spec),
    };
    out.byIndex.push(id);
  }
  return out;
}

/**
 * The importing side of DR-64: indices out, fresh ids in.
 *
 * A `doc` index that names nothing becomes `docId: null`, which is the tile's
 * "follow the active document" state and is the honest reading of a bundle that
 * has been edited by hand.
 */
export function hydrateTree(node: PortableNode, byIndex: readonly string[], pool: IdPool): Node {
  if ("leaf" in node) {
    const index = node.leaf.doc;
    const docId = index === undefined ? null : (byIndex[index] ?? null);
    return {
      id: pool.take(),
      type: "leaf",
      app: node.leaf.app,
      docId,
      ...(node.leaf.label ? { label: node.leaf.label } : {}),
    };
  }
  return {
    id: pool.take(),
    type: "split",
    dir: node.split.dir,
    ratio: clampRatio(node.split.ratio),
    a: hydrateTree(node.split.a, byIndex, pool),
    b: hydrateTree(node.split.b, byIndex, pool),
  };
}

export interface TileImport {
  leaf: Extract<Node, { type: "leaf" }>;
  docs: Record<DocId, Doc>;
}

export function applyTileBundle(bundle: Bundle<"tile">, ids: readonly string[]): TileImport {
  const pool = new IdPool(ids);
  const payload = bundle.payload;
  const minted = hydrateDocs(payload.doc ? [payload.doc] : [], pool);
  return {
    leaf: {
      id: pool.take(),
      type: "leaf",
      app: payload.app,
      docId: minted.byIndex[0] ?? null,
      ...(payload.label ? { label: payload.label } : {}),
    },
    docs: minted.docs,
  };
}

export interface WorkspaceImport {
  space: Workspace;
  docs: Record<DocId, Doc>;
}

export function applyWorkspaceBundle(
  bundle: Bundle<"workspace">,
  stageId: string,
  ids: readonly string[],
): WorkspaceImport {
  const pool = new IdPool(ids);
  const payload = bundle.payload;
  const minted = hydrateDocs(payload.docs, pool);
  return {
    space: {
      id: pool.take(),
      name: payload.name,
      stageId,
      tree: hydrateTree(payload.tree, minted.byIndex, pool),
      ...(payload.apps ? { apps: [...payload.apps] } : {}),
    },
    docs: minted.docs,
  };
}

export interface StageImport {
  stage: Stage;
  spaces: Workspace[];
  docs: Record<DocId, Doc>;
}

export function applyStageBundle(bundle: Bundle<"stage">, ids: readonly string[]): StageImport {
  const pool = new IdPool(ids);
  const payload = bundle.payload;
  const minted = hydrateDocs(payload.docs, pool);
  const stageId = pool.take();
  const spaces: Workspace[] = payload.spaces.map((space) => ({
    id: pool.take(),
    name: space.name,
    stageId,
    tree: hydrateTree(space.tree, minted.byIndex, pool),
    ...(space.apps ? { apps: [...space.apps] } : {}),
  }));
  return {
    stage: {
      id: stageId,
      name: payload.name,
      apps: payload.apps ? [...payload.apps] : null,
      // `chrome` is assigned from `PortableChrome` to `StageChrome` here, which
      // is the one place the two structurally-identical types meet. If they ever
      // diverge, this line stops compiling — which is the point of not sharing
      // them across the layer boundary by an import.
      chrome: { ...payload.chrome },
      currentSpaceId: "",
      // An imported stage is the user's, never code-defined, however it was
      // made. A bundle claiming `pinned` would otherwise create a stage that
      // cannot be deleted and that no release will ever re-create.
    },
    spaces,
    docs: minted.docs,
  };
}
