import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DocId } from "../pbui/types";
import { newId } from "./world";

/**
 * The window manager's state: workspaces, each a binary split tree.
 *
 * Ported from pbui-gog.jsx:1126-1152. The tree operations are pure functions
 * with no React in sight, which is what lets them be tested exhaustively —
 * `removeLeaf` promoting a sibling and `cloneTree` sharing no nodes are exactly
 * the kind of thing that is easy to get subtly wrong and invisible until a tile
 * disappears.
 */

export type NodeId = string;
export type AppId = string;
export type StageId = string;

export type Node =
  | { id: NodeId; type: "leaf"; app: AppId; docId: DocId | null }
  | { id: NodeId; type: "split"; dir: "row" | "col"; a: Node; b: Node; ratio: number };

/**
 * Which parts of the shell chrome a stage shows (DATADROP-8 DR-59).
 *
 * Three booleans rather than a variant name, because the three are chosen
 * independently: the sign-in stage wants a masthead and neither of the other
 * two, while an embedded tour panel wants the workspace strip and no masthead.
 */
export interface StageChrome {
  /** The DATALAB wordmark. */
  masthead: boolean;
  /** The workspace strip. False for a stage that has exactly one workspace. */
  workspaces: boolean;
  /** The stage switcher in the top right. Almost always true. */
  stageBar: boolean;
}

/**
 * A stage: a named set of workspaces, an application allow-list, and chrome.
 *
 * The layer the interface was missing (DR-58). `ws-welcome` and `ws-account`
 * used to be *workspaces* that the application had to force the current pointer
 * to — twice, from `Workbench.tsx` — because there was no layer at which "which
 * part of the product am I in" could be expressed. That forcing is the evidence
 * they were always stages wearing a workspace's clothes.
 */
export interface Stage {
  id: StageId;
  name: string;
  /**
   * Which applications this stage offers, or null for every registered one.
   *
   * A *rendering* constraint, applied by the tile picker and the launcher —
   * never a mounting constraint (DR-61). A tile whose layout names an
   * out-of-scope application still renders it, because the alternative is a
   * seeded layout that silently loses a tile.
   */
  apps: AppId[] | null;
  chrome: StageChrome;
  /**
   * The workspace this stage was last on.
   *
   * On the stage rather than only on the layout, so switching away and back
   * returns you where you were (DR-60). `LayoutState.currentSpaceId` mirrors
   * this value for the twenty-odd read sites that predate stages; the two are
   * two views of one fact and `syncSpacePointer` is the only writer of either.
   */
  currentSpaceId: string;
  /** Defined in code: re-created on every load, cannot be deleted (DR-59). */
  pinned?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  tree: Node;
  /**
   * The stage this workspace belongs to.
   *
   * A foreign key on a flat array rather than nesting the workspaces inside
   * `Stage`, deliberately: `persist.validate` walks the workspace array, and
   * `removeSpace` / `renameSpace` / `cloneSpace` / `setCurrentSpace` all index
   * into it. Nesting would grow a stage lookup in every one of them for no
   * gain, and it would make "move this workspace to another stage" a splice
   * between two arrays rather than a one-field write.
   */
  stageId: StageId;
  /** Narrows the stage's allow-list further, or null/absent to inherit it. */
  apps?: AppId[] | null;
  /**
   * A pinned workspace is defined in code, not by the user.
   *
   * It is re-created from source on every load, cannot be deleted, and its tree
   * replaces whatever was stored. That is what makes "hardwired" true rather
   * than aspirational: without it, a user who closed the account space in one
   * release has no account space in the next, and the only route back is
   * clearing localStorage (DR-29).
   *
   * The cost is that tiles added to a pinned space are lost on reload, which is
   * the intended meaning and is why the workspace strip marks them.
   */
  pinned?: boolean;
}

export interface LayoutState {
  stages: Stage[];
  currentStageId: StageId;
  /** Every workspace across every stage, flat, each naming its owner. */
  spaces: Workspace[];
  /** Mirrors the current stage's `currentSpaceId`. See `Stage.currentSpaceId`. */
  currentSpaceId: string;
}

export const leaf = (app: AppId, docId: DocId | null = null): Node => ({
  id: newId(),
  type: "leaf",
  app,
  docId,
});

export const split = (dir: "row" | "col", a: Node, b: Node, ratio = 0.5): Node => ({
  id: newId(),
  type: "split",
  dir,
  a,
  b,
  ratio,
});

/**
 * Replace one node, structurally sharing everything else.
 *
 * Returns the SAME object when nothing below changed. That is not a micro
 * optimisation: it is what lets React.memo skip an untouched subtree when one
 * tile changes, and with fifteen tiles each running evaluate() it is the
 * difference between a responsive divider drag and a slideshow.
 */
export function updateNode(node: Node, id: NodeId, fn: (node: Node) => Node): Node {
  if (node.id === id) return fn(node);
  if (node.type === "split") {
    const a = updateNode(node.a, id, fn);
    const b = updateNode(node.b, id, fn);
    if (a !== node.a || b !== node.b) return { ...node, a, b };
  }
  return node;
}

/** Remove a leaf; its sibling absorbs the space. */
export function removeLeaf(node: Node, id: NodeId): Node {
  if (node.type === "split") {
    if (node.a.id === id) return node.b;
    if (node.b.id === id) return node.a;
    const a = removeLeaf(node.a, id);
    const b = removeLeaf(node.b, id);
    if (a !== node.a || b !== node.b) return { ...node, a, b };
  }
  return node;
}

export function findLeaf(node: Node, id: NodeId): Node | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.a, id) ?? findLeaf(node.b, id);
}

export function countLeaves(node: Node): number {
  return node.type === "leaf" ? 1 : countLeaves(node.a) + countLeaves(node.b);
}

/** Deep copy with entirely fresh ids, for duplicating a workspace. */
export function cloneTree(node: Node): Node {
  return node.type === "leaf"
    ? { ...node, id: newId() }
    : { ...node, id: newId(), a: cloneTree(node.a), b: cloneTree(node.b) };
}

/** Divider positions that snap, and how close counts. */
export const SNAP_RATIOS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
export const SNAP_TOLERANCE = 0.022;

export function snapRatio(value: number): { ratio: number; snapped: boolean } {
  for (const candidate of SNAP_RATIOS) {
    if (Math.abs(value - candidate) < SNAP_TOLERANCE) return { ratio: candidate, snapped: true };
  }
  return { ratio: value, snapped: false };
}

/**
 * A one-stage, one-workspace layout.
 *
 * Only used where a real layout is unavailable — `layoutSlice`'s declared
 * initial state, and a test that wants the smallest legal shape. The product
 * and every store built without a preload get `defaultLayout()` from
 * `store/stages.ts`.
 */
export const initialLayout = (): LayoutState => {
  const stageId = newId();
  const space: Workspace = { id: newId(), name: "build", tree: leaf("launcher"), stageId };
  return {
    stages: [
      {
        id: stageId,
        name: "work",
        apps: null,
        chrome: { masthead: true, workspaces: true, stageBar: true },
        currentSpaceId: space.id,
      },
    ],
    currentStageId: stageId,
    spaces: [space],
    currentSpaceId: space.id,
  };
};

export function stageOf(state: LayoutState): Stage | undefined {
  return state.stages.find((s) => s.id === state.currentStageId) ?? state.stages[0];
}

/** The workspaces belonging to one stage, in layout order. */
export function spacesOfStage(state: LayoutState, stageId: StageId): Workspace[] {
  return state.spaces.filter((s) => s.stageId === stageId);
}

/**
 * Write the space pointer in BOTH places, always.
 *
 * The mirror between `LayoutState.currentSpaceId` and the current stage's own
 * `currentSpaceId` is a correctness hazard that grows with every new reducer
 * (DR-60), so no reducer assigns either field directly — they all come through
 * here, and `test/stages.test.ts` walks every reducer in the slice and fails if
 * one desynchronises them.
 */
function syncSpacePointer(state: LayoutState, spaceId: string): void {
  state.currentSpaceId = spaceId;
  const stage = stageOf(state);
  if (stage) stage.currentSpaceId = spaceId;
}

function current(state: LayoutState): Workspace | undefined {
  return state.spaces.find((s) => s.id === state.currentSpaceId) ?? state.spaces[0];
}

function mutateTree(state: LayoutState, fn: (tree: Node) => Node) {
  const space = current(state);
  if (space) space.tree = fn(space.tree);
}

export const layoutSlice = createSlice({
  name: "layout",
  initialState: initialLayout(),
  reducers: {
    setRatio(state, action: PayloadAction<{ nodeId: NodeId; ratio: number }>) {
      mutateTree(state, (tree) =>
        updateNode(tree, action.payload.nodeId, (node) =>
          node.type === "split" ? { ...node, ratio: action.payload.ratio } : node,
        ),
      );
    },

    splitLeaf(state, action: PayloadAction<{ nodeId: NodeId; dir: "row" | "col" }>) {
      mutateTree(state, (tree) =>
        updateNode(tree, action.payload.nodeId, (node) =>
          split(action.payload.dir, node, leaf("launcher")),
        ),
      );
    },

    closeLeaf(state, action: PayloadAction<NodeId>) {
      const space = current(state);
      // The last tile cannot be closed: an empty workspace has no way back.
      if (!space || countLeaves(space.tree) < 2) return;
      space.tree = removeLeaf(space.tree, action.payload);
    },

    setLeafApp(state, action: PayloadAction<{ nodeId: NodeId; app: AppId; docId?: DocId | null }>) {
      mutateTree(state, (tree) =>
        updateNode(tree, action.payload.nodeId, (node) =>
          node.type === "leaf"
            ? { ...node, app: action.payload.app, docId: action.payload.docId ?? node.docId }
            : node,
        ),
      );
    },

    setLeafDoc(state, action: PayloadAction<{ nodeId: NodeId; docId: DocId | null }>) {
      mutateTree(state, (tree) =>
        updateNode(tree, action.payload.nodeId, (node) =>
          node.type === "leaf" ? { ...node, docId: action.payload.docId } : node,
        ),
      );
    },

    /**
     * Exchange two tiles' applications.
     *
     * Two fields, because a tile holds no application state (DR-11). Everything
     * the applications were showing lives in the world, so nothing migrates.
     */
    swapTiles(state, action: PayloadAction<{ a: NodeId; b: NodeId }>) {
      const space = current(state);
      if (!space) return;
      const first = findLeaf(space.tree, action.payload.a);
      const second = findLeaf(space.tree, action.payload.b);
      if (!first || !second || first.type !== "leaf" || second.type !== "leaf") return;
      const firstApp = { app: first.app, docId: first.docId };
      const secondApp = { app: second.app, docId: second.docId };
      space.tree = updateNode(
        updateNode(space.tree, action.payload.a, (n) => ({ ...n, ...secondApp })),
        action.payload.b,
        (n) => ({ ...n, ...firstApp }),
      );
    },

    /** Move a tile to an edge of another, splitting it. The source closes. */
    dockTile(
      state,
      action: PayloadAction<{
        from: NodeId;
        to: NodeId;
        zone: "left" | "right" | "top" | "bottom";
      }>,
    ) {
      const space = current(state);
      if (!space || action.payload.from === action.payload.to) return;
      const source = findLeaf(space.tree, action.payload.from);
      if (!source || !findLeaf(space.tree, action.payload.to)) return;

      const without = removeLeaf(space.tree, action.payload.from);
      // If the source survived the removal the tree is not what we thought;
      // bail rather than producing a tree with the same leaf in two places.
      if (findLeaf(without, action.payload.from)) return;

      const dir = action.payload.zone === "left" || action.payload.zone === "right" ? "row" : "col";
      const before = action.payload.zone === "left" || action.payload.zone === "top";
      space.tree = updateNode(without, action.payload.to, (node) =>
        before ? split(dir, source, node) : split(dir, node, source),
      );
    },

    addSpace: {
      reducer(state, action: PayloadAction<{ id: string; name: string; stageId?: StageId }>) {
        const stageId = action.payload.stageId ?? state.currentStageId;
        state.spaces.push({
          id: action.payload.id,
          name: action.payload.name,
          tree: leaf("launcher"),
          stageId,
        });
        // A new workspace in ANOTHER stage does not steal the pointer: the user
        // is still where they were, and jumping them somewhere else on an
        // "import a workspace" would lose their place.
        if (stageId === state.currentStageId) syncSpacePointer(state, action.payload.id);
      },
      prepare(name?: string, stageId?: StageId) {
        return { payload: { id: newId(), name: name ?? "workspace", stageId } };
      },
    },

    removeSpace(state, action: PayloadAction<string>) {
      const space = state.spaces.find((s) => s.id === action.payload);
      if (!space || space.pinned) return;
      // At least one workspace per STAGE, not per layout (DR-72). The old
      // per-layout count was wrong in the permissive direction: a stage holding
      // one workspace inside a layout holding twelve would let you delete it,
      // leaving a stage whose canvas is empty with no way back.
      if (spacesOfStage(state, space.stageId).length < 2) return;
      state.spaces = state.spaces.filter((s) => s.id !== action.payload);
      if (state.currentSpaceId === action.payload) {
        syncSpacePointer(state, spacesOfStage(state, state.currentStageId)[0]?.id ?? "");
      }
      // The deleted space may have been another stage's remembered place.
      for (const stage of state.stages) {
        if (stage.currentSpaceId === action.payload) {
          stage.currentSpaceId = spacesOfStage(state, stage.id)[0]?.id ?? "";
        }
      }
    },

    renameSpace(state, action: PayloadAction<{ spaceId: string; name: string }>) {
      const space = state.spaces.find((s) => s.id === action.payload.spaceId);
      if (space && !space.pinned && action.payload.name) space.name = action.payload.name;
    },

    cloneSpace: {
      reducer(state, action: PayloadAction<{ spaceId: string; id: string }>) {
        const space = state.spaces.find((s) => s.id === action.payload.spaceId);
        if (!space) return;
        const copy: Workspace = {
          id: action.payload.id,
          name: `${space.name}′`,
          tree: cloneTree(space.tree),
          stageId: space.stageId,
          // A copy is the user's, never code-defined, however it was made.
          ...(space.apps ? { apps: [...space.apps] } : {}),
        };
        state.spaces.push(copy);
        if (copy.stageId === state.currentStageId) syncSpacePointer(state, copy.id);
      },
      prepare(spaceId: string) {
        // The id is minted by the caller for the same reason `duplicateDoc`'s
        // is: a reducer that calls crypto.randomUUID() is not a pure function
        // of its inputs, and a state tree that changes when you replay it is
        // not replayable.
        return { payload: { spaceId, id: newId() } };
      },
    },

    setCurrentSpace(state, action: PayloadAction<string>) {
      const space = state.spaces.find((s) => s.id === action.payload);
      if (!space) return;
      // Switching to a workspace in another stage switches the stage too. The
      // alternative — refusing — makes "load this template into the account
      // stage and show me" impossible to express as one verb.
      if (space.stageId !== state.currentStageId) {
        if (state.stages.some((s) => s.id === space.stageId)) state.currentStageId = space.stageId;
      }
      syncSpacePointer(state, space.id);
    },

    /** Narrow (or, with null, un-narrow) one workspace's application list. */
    setSpaceApps(state, action: PayloadAction<{ spaceId: string; apps: readonly AppId[] | null }>) {
      const space = state.spaces.find((s) => s.id === action.payload.spaceId);
      if (!space) return;
      space.apps = action.payload.apps === null ? null : [...action.payload.apps];
    },

    /* ------------------------------------------------------------ stages -- */

    addStage: {
      reducer(
        state,
        action: PayloadAction<{
          id: StageId;
          spaceId: string;
          name: string;
          apps: AppId[] | null;
          chrome: StageChrome;
        }>,
      ) {
        const { id, spaceId, name, apps, chrome } = action.payload;
        state.spaces.push({ id: spaceId, name: "build", tree: leaf("launcher"), stageId: id });
        state.stages.push({ id, name, apps, chrome, currentSpaceId: spaceId });
        state.currentStageId = id;
        syncSpacePointer(state, spaceId);
      },
      prepare(name: string, apps: readonly AppId[] | null = null, chrome?: StageChrome) {
        return {
          payload: {
            id: newId(),
            spaceId: newId(),
            name,
            apps: apps === null ? null : [...apps],
            chrome: chrome ?? { masthead: true, workspaces: true, stageBar: true },
          },
        };
      },
    },

    removeStage(state, action: PayloadAction<StageId>) {
      const stage = state.stages.find((s) => s.id === action.payload);
      // A code-defined stage never goes, and neither does the last one: a
      // layout with no stage renders nothing and has no route back (DR-72).
      if (!stage || stage.pinned) return;
      if (state.stages.length < 2) return;
      state.stages = state.stages.filter((s) => s.id !== action.payload);
      state.spaces = state.spaces.filter((s) => s.stageId !== action.payload);
      if (state.currentStageId === action.payload) {
        const next = state.stages[0] as Stage;
        state.currentStageId = next.id;
        syncSpacePointer(
          state,
          next.currentSpaceId || (spacesOfStage(state, next.id)[0]?.id ?? ""),
        );
      }
    },

    renameStage(state, action: PayloadAction<{ stageId: StageId; name: string }>) {
      const stage = state.stages.find((s) => s.id === action.payload.stageId);
      // Same rule the workspace strip already states for pinned spaces: the
      // name comes from code and would be overwritten on the next load, so
      // offering the edit would be a lie.
      if (stage && !stage.pinned && action.payload.name) stage.name = action.payload.name;
    },

    setCurrentStage(state, action: PayloadAction<StageId>) {
      const stage = state.stages.find((s) => s.id === action.payload);
      if (!stage) return;
      state.currentStageId = stage.id;
      // The stage's remembered workspace, repaired if it named one that is gone
      // — otherwise the canvas renders nothing and the strip has no selection.
      const remembered = state.spaces.find(
        (s) => s.id === stage.currentSpaceId && s.stageId === stage.id,
      );
      syncSpacePointer(state, remembered?.id ?? spacesOfStage(state, stage.id)[0]?.id ?? "");
    },

    moveSpaceToStage(state, action: PayloadAction<{ spaceId: string; stageId: StageId }>) {
      const space = state.spaces.find((s) => s.id === action.payload.spaceId);
      const stage = state.stages.find((s) => s.id === action.payload.stageId);
      if (!space || !stage || space.pinned) return;
      // Do not strand the stage it is leaving with no workspaces at all.
      if (spacesOfStage(state, space.stageId).length < 2) return;
      space.stageId = stage.id;
      for (const other of state.stages) {
        if (other.currentSpaceId === space.id && other.id !== stage.id) {
          other.currentSpaceId = spacesOfStage(state, other.id)[0]?.id ?? "";
        }
      }
      if (state.currentSpaceId === space.id) {
        syncSpacePointer(state, spacesOfStage(state, state.currentStageId)[0]?.id ?? "");
      }
    },

    /** Replace the whole layout — used by restoration. */
    replaceLayout(_state, action: PayloadAction<LayoutState>) {
      return action.payload;
    },
  },
});

export const layoutActions = layoutSlice.actions;
