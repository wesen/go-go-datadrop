import type { Lesson } from "../../appkit/lessons";
import { layoutActions, type Node } from "../../store/layout";

/** Every leaf of the current workspace, flattened. */
function leaves(state: Parameters<NonNullable<Lesson["done"]>>[0]) {
  const space = state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId);
  if (!space) return [];
  const out: Array<{ id: string; app: string; docId: string | null }> = [];
  const walk = (node: Node): void => {
    if (node.type === "leaf") out.push({ id: node.id, app: node.app, docId: node.docId });
    else {
      walk(node.a);
      walk(node.b);
    }
  };
  walk(space.tree);
  return out;
}

/**
 * §B — Tiles, documents, workspaces.
 *
 * The confusion worth clearing up before anything else: **tiles are windows,
 * documents are the thing**. Two tiles pointed at one document move together
 * because they are not copies; re-point one and the link is gone, because
 * nothing was ever wired between them.
 *
 * Every predicate here reads `state.layout` rather than `state.world`, which is
 * the concrete payoff of DR-49. The prototype cannot do this — its tile tree
 * lives in the shell's `useState`, so it publishes a summary through a ref
 * written during render (`pbui-landing.jsx:1667-1674`) and every layout
 * predicate reads that instead. Ours is a plain selector.
 */
export const layoutLessons: Lesson[] = [
  {
    id: "b1",
    title: "Two tiles, one document",
    manual: true,
    body: (
      <>
        Both tiles are pointed at document <strong>α</strong> — look at their DOC strips.
        Right-click any mark in the chart and choose <strong>Keep only …</strong>. A filter step is
        written into α&apos;s pipeline, so the chart redraws <em>and</em> the table&apos;s rows
        drop, together. Nothing is wired between them: they are two views of one object.
      </>
    ),
  },
  {
    id: "b2",
    title: "Layouts are disposable",
    body: (
      <>
        Split a tile with <strong>⬌</strong> or <strong>⬍</strong> in its title bar, then pick an
        application in the empty one. Drag a title bar&apos;s <strong>⠿</strong> onto another tile:
        the <strong>centre</strong> swaps the two applications, an <strong>edge</strong> docks it
        there. Nothing you do here can lose work, because no application keeps its state in the
        tile.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const first = leaves(getState())[0];
      if (first) dispatch(layoutActions.splitLeaf({ nodeId: first.id, dir: "col" }));
    },
    done: (state) => leaves(state).length > 2,
  },
  {
    id: "b3",
    title: "Re-point a view at another document",
    body: (
      <>
        The world holds two documents: <strong>α</strong> on the stream and <strong>β</strong> on
        the dataset. Use the dropdown in any DOC strip to point a tile at <strong>β</strong>. The
        tile changes what it is looking at; α is untouched. <strong>＋</strong> in the same strip
        spawns a brand-new document into that tile.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const state = getState();
      const bound = leaves(state).filter((leaf) => leaf.app === "chart" || leaf.app === "table");
      const second = state.world.docOrder[1];
      const target = bound[1] ?? bound[0];
      if (target && second) {
        dispatch(layoutActions.setLeafDoc({ nodeId: target.id, docId: second }));
      }
    },
    // Two DIFFERENT documents visible at once — which is the state the lesson
    // is about, and which a check for "the dropdown changed" would miss when
    // the reader used ＋ instead.
    done: (state) => {
      const shown = new Set(
        leaves(state)
          .filter((leaf) => leaf.docId != null)
          .map((leaf) => leaf.docId),
      );
      return shown.size > 1;
    },
    predict: {
      q: "You are about to point the right-hand tile at β. Does the left-hand chart change too?",
      options: ["yes, they are linked", "no, they are separate"],
      answer: 1,
      reveal:
        "They were only moving together because they were looking at the same document. Re-point one and the link is gone — nothing was ever wired between the tiles.",
    },
  },
  {
    id: "b4",
    title: "Workspaces are camera positions",
    body: (
      <>
        The strip at the top of the panel switches whole layouts. Nothing is saved or loaded — the
        world is identical in all of them. Press <strong>+ workspace</strong>, build something
        different, then switch back: exactly as you left it.
      </>
    ),
    run: ({ dispatch }) => {
      dispatch(layoutActions.addSpace("scratch"));
    },
    done: (state) => state.layout.spaces.length > 1,
  },
  {
    id: "b5",
    title: "Closing a tile destroys nothing",
    manual: true,
    body: (
      <>
        Close a tile with <strong>✕</strong>. Its sibling absorbs the space. Now open a new tile and
        point it back at the same document: everything is still there — pipeline, encoding,
        geometry. Views are cheap. State is not in them.
      </>
    ),
  },
];
