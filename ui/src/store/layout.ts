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

export type Node =
  | { id: NodeId; type: "leaf"; app: AppId; docId: DocId | null }
  | { id: NodeId; type: "split"; dir: "row" | "col"; a: Node; b: Node; ratio: number };

export interface Workspace {
  id: string;
  name: string;
  tree: Node;
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
  spaces: Workspace[];
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

export const initialLayout = (): LayoutState => {
  const space: Workspace = { id: newId(), name: "build", tree: leaf("launcher") };
  return { spaces: [space], currentSpaceId: space.id };
};

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
      action: PayloadAction<{ from: NodeId; to: NodeId; zone: "left" | "right" | "top" | "bottom" }>,
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
      reducer(state, action: PayloadAction<Workspace>) {
        state.spaces.push(action.payload);
        state.currentSpaceId = action.payload.id;
      },
      prepare(name?: string) {
        return {
          payload: { id: newId(), name: name ?? "workspace", tree: leaf("launcher") },
        };
      },
    },

    removeSpace(state, action: PayloadAction<string>) {
      if (state.spaces.length < 2) return;
      state.spaces = state.spaces.filter((s) => s.id !== action.payload);
      if (state.currentSpaceId === action.payload) {
        state.currentSpaceId = state.spaces[0]?.id ?? "";
      }
    },

    renameSpace(state, action: PayloadAction<{ spaceId: string; name: string }>) {
      const space = state.spaces.find((s) => s.id === action.payload.spaceId);
      if (space && action.payload.name) space.name = action.payload.name;
    },

    cloneSpace(state, action: PayloadAction<string>) {
      const space = state.spaces.find((s) => s.id === action.payload);
      if (!space) return;
      const copy: Workspace = { id: newId(), name: `${space.name}′`, tree: cloneTree(space.tree) };
      state.spaces.push(copy);
      state.currentSpaceId = copy.id;
    },

    setCurrentSpace(state, action: PayloadAction<string>) {
      if (state.spaces.some((s) => s.id === action.payload)) state.currentSpaceId = action.payload;
    },

    /** Replace the whole layout — used by restoration. */
    replaceLayout(_state, action: PayloadAction<LayoutState>) {
      return action.payload;
    },
  },
});

export const layoutActions = layoutSlice.actions;
