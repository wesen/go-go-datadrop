import { describe, expect, test } from "bun:test";
import { readings } from "../src/fixtures";
import {
  cloneTree,
  countLeaves,
  findLeaf,
  layoutSlice,
  leaf,
  removeLeaf,
  snapRatio,
  split,
  updateNode,
  type LayoutState,
  type Node,
} from "../src/store/layout";
import { TRACE_CAP, worldActions, worldSlice, type WorldState } from "../src/store/world";
import { actionsForVerb, environmentFor } from "../src/store/applyVerb";
import { findSecrets, validate } from "../src/store/persist";
import {
  ACCOUNT_SPACE_ID,
  ACCOUNT_STAGE_ID,
  SIGNIN_SPACE_ID,
  WORK_STAGE_ID,
} from "../src/store/stages";

/**
 * The shell reducers: pure functions, tested without a DOM.
 *
 * The list is the guide's §16.2, which was written around the failures that are
 * easy to produce and invisible until a tile disappears or a snapshot quietly
 * follows the document it was copied from.
 */

const world = worldSlice.reducer;
const layout = layoutSlice.reducer;

function withDoc(): { state: WorldState; docId: string } {
  const state = world(undefined, worldActions.newDoc(readings.source));
  return { state, docId: state.docOrder[0] as string };
}

/* ---------------------------------------------------------------- layout -- */

describe("the split tree", () => {
  const tree = () => split("row", leaf("chart"), split("col", leaf("table"), leaf("pipeline")));

  test("updateNode returns the IDENTICAL object when nothing changed", () => {
    // Not a micro-optimisation: it is what lets React.memo skip an untouched
    // subtree when one tile changes, which with fifteen tiles is the difference
    // between a responsive divider drag and a slideshow.
    const t = tree();
    expect(updateNode(t, "absent", (n) => n)).toBe(t);
  });

  test("updateNode shares every untouched subtree", () => {
    const t = tree() as Extract<Node, { type: "split" }>;
    const next = updateNode(t, t.a.id, (n) => ({ ...n, app: "encode" }) as Node) as Extract<
      Node,
      { type: "split" }
    >;
    expect(next).not.toBe(t);
    expect(next.b).toBe(t.b);
  });

  test("removeLeaf promotes the sibling", () => {
    const t = tree() as Extract<Node, { type: "split" }>;
    const next = removeLeaf(t, t.a.id);
    expect(next).toBe(t.b);
    expect(countLeaves(next)).toBe(2);
  });

  test("removing an absent leaf is a no-op, not a corruption", () => {
    const t = tree();
    expect(removeLeaf(t, "absent")).toBe(t);
  });

  test("cloneTree shares no node objects and reuses no ids", () => {
    // A clone that reused ids would give React duplicate keys AND make the
    // hit-test return the wrong tile — the bug DR-12 exists to prevent.
    const t = tree();
    const copy = cloneTree(t);

    const ids = (node: Node): string[] =>
      node.type === "leaf" ? [node.id] : [node.id, ...ids(node.a), ...ids(node.b)];
    const objects = (node: Node): Node[] =>
      node.type === "leaf" ? [node] : [node, ...objects(node.a), ...objects(node.b)];

    expect(new Set([...ids(t), ...ids(copy)]).size).toBe(ids(t).length * 2);
    for (const object of objects(copy)) expect(objects(t)).not.toContain(object);
  });

  test("dividers snap only within tolerance", () => {
    expect(snapRatio(0.51)).toEqual({ ratio: 0.5, snapped: true });
    expect(snapRatio(0.6)).toEqual({ ratio: 0.6, snapped: false });
  });
});

describe("the layout slice", () => {
  const start = (): LayoutState => layout(undefined, { type: "@@init" });

  test("the last tile cannot be closed", () => {
    const state = start();
    const only = (state.spaces[0] as { tree: Node }).tree;
    const next = layout(state, layoutSlice.actions.closeLeaf(only.id));
    expect(countLeaves((next.spaces[0] as { tree: Node }).tree)).toBe(1);
  });

  test("splitting then closing returns to one tile", () => {
    let state = start();
    const first = (state.spaces[0] as { tree: Node }).tree.id;
    state = layout(state, layoutSlice.actions.splitLeaf({ nodeId: first, dir: "row" }));
    expect(countLeaves((state.spaces[0] as { tree: Node }).tree)).toBe(2);

    const tree = (state.spaces[0] as { tree: Node }).tree as Extract<Node, { type: "split" }>;
    state = layout(state, layoutSlice.actions.closeLeaf(tree.b.id));
    expect(countLeaves((state.spaces[0] as { tree: Node }).tree)).toBe(1);
  });

  test("swapping two tiles exchanges only app and doc", () => {
    let state = start();
    const first = (state.spaces[0] as { tree: Node }).tree.id;
    state = layout(state, layoutSlice.actions.splitLeaf({ nodeId: first, dir: "row" }));
    const tree = (state.spaces[0] as { tree: Node }).tree as Extract<Node, { type: "split" }>;
    state = layout(state, layoutSlice.actions.setLeafApp({ nodeId: tree.a.id, app: "chart" }));
    state = layout(state, layoutSlice.actions.setLeafApp({ nodeId: tree.b.id, app: "table" }));

    state = layout(state, layoutSlice.actions.swapTiles({ a: tree.a.id, b: tree.b.id }));
    const after = (state.spaces[0] as { tree: Node }).tree as Extract<Node, { type: "split" }>;
    // The ids stay put; the applications move. That is DR-11 in one assertion:
    // a tile holds no application state, so a swap is a two-field exchange.
    expect(after.a.id).toBe(tree.a.id);
    expect((after.a as { app: string }).app).toBe("table");
    expect((after.b as { app: string }).app).toBe("chart");
  });

  test("docking never leaves the same leaf in two places", () => {
    let state = start();
    const first = (state.spaces[0] as { tree: Node }).tree.id;
    state = layout(state, layoutSlice.actions.splitLeaf({ nodeId: first, dir: "row" }));
    const tree = (state.spaces[0] as { tree: Node }).tree as Extract<Node, { type: "split" }>;

    state = layout(
      state,
      layoutSlice.actions.dockTile({ from: tree.a.id, to: tree.b.id, zone: "bottom" }),
    );
    const after = (state.spaces[0] as { tree: Node }).tree;
    expect(countLeaves(after)).toBe(2);
    expect(findLeaf(after, tree.a.id)).not.toBeNull();
  });
});

/* ----------------------------------------------------------------- world -- */

describe("documents", () => {
  test("a new document becomes active and is named in sequence", () => {
    const { state, docId } = withDoc();
    expect(state.activeDocId).toBe(docId);
    expect(state.docs[docId]?.name).toBe("α");

    const next = world(state, worldActions.newDoc(readings.source));
    expect(next.docs[next.activeDocId as string]?.name).toBe("β");
  });

  test("the last document cannot be deleted", () => {
    const { state, docId } = withDoc();
    expect(world(state, worldActions.deleteDoc(docId)).docOrder.length).toBe(1);
  });

  test("deleting the active document reassigns activeDocId", () => {
    // Leaving it dangling makes every ambient verb a silent no-op — the worst
    // possible failure for an interface built on ambient verbs.
    let state = withDoc().state;
    state = world(state, worldActions.newDoc(readings.source));
    const active = state.activeDocId as string;

    const next = world(state, worldActions.deleteDoc(active));
    expect(next.activeDocId).not.toBe(active);
    expect(next.docs[next.activeDocId as string]).toBeDefined();
  });

  test("duplicating a document does not alias its spec", () => {
    let { state, docId } = withDoc();
    state = world(state, worldActions.setMapping({ docId, channel: "y", field: "data.temp_c" }));
    state = world(state, worldActions.duplicateDoc({ docId, id: "copy" }));

    state = world(state, worldActions.setMapping({ docId, channel: "y", field: "data.humidity" }));
    // A spread would have aliased `mapping`, so editing one would edit both.
    expect(state.docs.copy?.spec.mapping.y).toBe("data.temp_c");
  });

  test("changing source resets the pipeline and the encoding", () => {
    let { state, docId } = withDoc();
    state = world(state, worldActions.setMapping({ docId, channel: "y", field: "data.temp_c" }));
    state = world(
      state,
      worldActions.setDocSource({ docId, source: { kind: "stream", drop: "other" } }),
    );
    // Keeping them would name columns the new source may not have, producing a
    // chart that refuses to draw with no obvious cause.
    expect(state.docs[docId]?.spec.mapping.y).toBeNull();
    expect(state.docs[docId]?.spec.steps).toEqual([]);
  });
});

describe("snapshots", () => {
  test("a snapshot does not follow the document it came from", () => {
    // The single line the whole feature depends on: structuredClone, not a
    // spread. If this fails, every snapshot silently tracks its document.
    let { state, docId } = withDoc();
    state = world(state, worldActions.setMapping({ docId, channel: "y", field: "data.temp_c" }));
    state = world(state, worldActions.snapshot(docId, "2026-07-25T00:00:00Z"));
    const snapshotId = state.snapshotOrder[0] as string;

    state = world(state, worldActions.setMapping({ docId, channel: "y", field: "data.humidity" }));
    expect(state.snapshots[snapshotId]?.spec.mapping.y).toBe("data.temp_c");
  });

  test("restoring does not alias the snapshot's steps", () => {
    let { state, docId } = withDoc();
    state = world(state, worldActions.snapshot(docId, "2026-07-25T00:00:00Z"));
    const snapshotId = state.snapshotOrder[0] as string;
    state = world(state, worldActions.restoreSnapshot({ snapshotId, docId }));

    state = world(state, worldActions.setMapping({ docId, channel: "x", field: "time" }));
    expect(state.snapshots[snapshotId]?.spec.mapping.x).toBeNull();
  });

  test("deleting a pinned snapshot clears the pin", () => {
    let { state, docId } = withDoc();
    state = world(state, worldActions.snapshot(docId, "2026-07-25T00:00:00Z"));
    const snapshotId = state.snapshotOrder[0] as string;
    state = world(state, worldActions.pinSnapshot({ slot: 0, snapshotId }));
    state = world(state, worldActions.deleteSnapshot(snapshotId));
    // A pin naming a snapshot that is gone renders an empty compare slot with
    // no way to tell why.
    expect(state.pins[0]).toBeNull();
  });
});

describe("steps and overrides", () => {
  test("toggling disables without deleting", () => {
    let { state, docId } = withDoc();
    state = world(
      state,
      worldActions.addStep({
        docId,
        step: { id: "s1", kind: "limit", on: true, n: 10 },
      }),
    );
    state = world(state, worldActions.toggleStep({ docId, stepId: "s1" }));
    expect(state.docs[docId]?.spec.steps).toHaveLength(1);
    expect(state.docs[docId]?.spec.steps[0]?.on).toBe(false);
  });

  test("moving a step past either end is a no-op", () => {
    let { state, docId } = withDoc();
    state = world(
      state,
      worldActions.addStep({ docId, step: { id: "s1", kind: "limit", on: true, n: 10 } }),
    );
    state = world(state, worldActions.moveStep({ docId, stepId: "s1", by: -1 }));
    expect(state.docs[docId]?.spec.steps[0]?.id).toBe("s1");
  });

  test("clearing the last override leaves undefined, not an empty object", () => {
    // Permalinks and snapshot equality compare the serialised form, so a spec
    // with no overrides must serialise identically however it got there.
    let { state, docId } = withDoc();
    state = world(state, worldActions.setTypeOverride({ docId, field: "seq", type: "n" }));
    state = world(state, worldActions.setTypeOverride({ docId, field: "seq", type: null }));
    expect(state.docs[docId]?.spec.typeOverrides).toBeUndefined();
    expect(JSON.stringify(state.docs[docId]?.spec)).not.toContain("typeOverrides");
  });
});

describe("the trace ring", () => {
  test("drops from the front at the cap", () => {
    let { state, docId } = withDoc();
    for (let i = 0; i < TRACE_CAP + 25; i++) {
      state = world(state, worldActions.setGeom({ docId, geom: i % 2 ? "line" : "point" }));
    }
    expect(state.trace).toHaveLength(TRACE_CAP);
    // Newest kept, oldest dropped — the opposite would make the tail useless.
    expect(state.trace[state.trace.length - 1]?.seq).toBeGreaterThan(TRACE_CAP);
  });
});

/* ------------------------------------------------------------- verb seam -- */

describe("verbs become actions", () => {
  // Both lookups over the same fixture, so schema and rows agree (DR-40).
  const env = (state: WorldState) =>
    environmentFor(
      state,
      () => readings,
      () => readings.fields,
    );

  test("a verb naming a document targets that document", () => {
    const { state, docId } = withDoc();
    const [action] = actionsForVerb(
      { kind: "setMapping", docId, channel: "y", field: "data.temp_c" },
      state,
      env(state),
    );
    const next = world(state, action!);
    expect(next.docs[docId]?.spec.mapping.y).toBe("data.temp_c");
  });

  test("an ambient verb resolves at application time, not at menu-build time", () => {
    // The active document can change while a menu is open, so a null docId is
    // resolved by the reducer rather than baked into the verb.
    let { state } = withDoc();
    state = world(state, worldActions.newDoc(readings.source));
    const second = state.activeDocId as string;

    const [action] = actionsForVerb(
      { kind: "setMapping", docId: null, channel: "y", field: "data.temp_c" },
      state,
      env(state),
    );
    const next = world(state, action!);
    expect(next.docs[second]?.spec.mapping.y).toBe("data.temp_c");
  });

  test("addFilter mints a step against the schema as of the pipeline's end", () => {
    const { state, docId } = withDoc();
    const [action] = actionsForVerb(
      { kind: "addFilter", docId, field: "data.station", op: "=", value: "north" },
      state,
      env(state),
    );
    const next = world(state, action!);
    const step = next.docs[docId]?.spec.steps[0];
    expect(step).toMatchObject({ kind: "filter", field: "data.station", op: "=", value: "north" });
  });
});

/* ----------------------------------------------------------- persistence -- */

describe("persistence is defensive", () => {
  /** A version-2 payload holding one user workspace in the work stage. */
  const v2 = (
    spaces: unknown[],
    currentSpaceId: string,
    stages: unknown[] = [],
    currentStageId = WORK_STAGE_ID,
  ) => ({
    version: 2,
    world: { docs: {}, docOrder: [] },
    layout: { stages, currentStageId, spaces, currentSpaceId },
  });

  test("a payload from another version is refused", () => {
    expect(
      validate({ version: 99, world: {}, layout: { spaces: [], currentSpaceId: "" } }),
    ).toBeNull();
  });

  test("a malformed tree is refused rather than rendered", () => {
    expect(
      validate(
        v2([{ id: "s", name: "x", stageId: WORK_STAGE_ID, tree: { id: "n", type: "split" } }], "s"),
      ),
    ).toBeNull();
  });

  test("a ratio outside the sane range is refused", () => {
    const tree = {
      id: "n",
      type: "split",
      dir: "row",
      ratio: 12,
      a: { id: "a", type: "leaf", app: "chart" },
      b: { id: "b", type: "leaf", app: "table" },
    };
    expect(validate(v2([{ id: "s", name: "x", stageId: WORK_STAGE_ID, tree }], "s"))).toBeNull();
  });

  test("a currentSpaceId naming a missing space falls back to the stage's", () => {
    const tree = { id: "n", type: "leaf", app: "chart" };
    const valid = validate(v2([{ id: "s", name: "x", stageId: WORK_STAGE_ID, tree }], "gone"));
    // The stage's own pointer has already been repaired by mergeStages, so the
    // layout mirror follows it (DR-60). The property under test is the fallback,
    // not the identity of the space it falls back to.
    expect(valid?.layout.currentSpaceId).toBe("s");
    expect(valid?.layout.spaces.map((space) => space.id)).toContain("s");
  });

  test("the hardwired workspaces are restored from code, not from storage", () => {
    // DR-29. A user who deleted the account workspace in a previous release
    // must get it back, and a stored tree under a pinned id must not win.
    const valid = validate(
      v2(
        [
          {
            id: ACCOUNT_SPACE_ID,
            name: "renamed by a user",
            stageId: ACCOUNT_STAGE_ID,
            tree: { id: "n", type: "leaf", app: "chart" },
          },
        ],
        ACCOUNT_SPACE_ID,
        [],
        ACCOUNT_STAGE_ID,
      ),
    );

    const ids = valid?.layout.spaces.map((space) => space.id) ?? [];
    expect(ids).toContain(SIGNIN_SPACE_ID);
    expect(ids).toContain(ACCOUNT_SPACE_ID);
    // Exactly once: merging must not duplicate a pinned space that was stored.
    expect(ids.filter((id) => id === ACCOUNT_SPACE_ID)).toHaveLength(1);

    const account = valid?.layout.spaces.find((space) => space.id === ACCOUNT_SPACE_ID);
    expect(account?.name).toBe("profile");
    expect(account?.pinned).toBe(true);
  });

  test("user-created spaces survive the merge", () => {
    const valid = validate(
      v2(
        [
          {
            id: "mine",
            name: "mine",
            stageId: WORK_STAGE_ID,
            tree: { id: "n", type: "leaf", app: "chart" },
          },
        ],
        "mine",
      ),
    );
    expect(valid?.layout.spaces.find((space) => space.id === "mine")?.name).toBe("mine");
    expect(valid?.layout.currentSpaceId).toBe("mine");
  });

  test("credential-shaped keys are detected anywhere in the payload", () => {
    // A snapshot is designed to be shared. One carrying a bearer token is a
    // credential-exfiltration feature, so `save` refuses rather than truncates.
    expect(findSecrets({ a: { b: { token: "x" } } })).toEqual(["a.b.token"]);
    expect(findSecrets({ spec: { source: { drop: "lab" } } })).toEqual([]);
  });

  test("findSecrets survives a cycle", () => {
    const cyclic: Record<string, unknown> = { name: "x" };
    cyclic.self = cyclic;
    expect(findSecrets(cyclic)).toEqual([]);
  });
});
