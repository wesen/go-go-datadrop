import { describe, expect, test } from "bun:test";
import { parseBundle } from "../src/model/portable";
import { actionsForVerb } from "../src/store/applyVerb";
import type { ClipboardPort } from "../src/store/clipboard";
import { makeStore, type AppThunk } from "../src/store";
import { layoutActions, leaf, split, type LayoutState, type Node } from "../src/store/layout";
import { save } from "../src/store/persist";
import { singleStageLayout } from "../src/store/stages";
import type { PbuiEnvironment } from "../src/pbui/types";

/**
 * The widened verb seam, end to end, with no DOM and no browser.
 *
 * This is what DR-66 buys. The clipboard is a parameter on the store's thunk
 * extra argument, so a test hands `makeStore` a fake that records what it was
 * given, dispatches the thunk `actionsForVerb` returned, and asserts on the
 * JSON. Nothing mocks `navigator`; there is no `navigator` here at all.
 *
 * It is also the test that shows "returns a thunk" is not a loophole in the
 * purity claim: `actionsForVerb` is called for its return value, and nothing
 * happens until the test dispatches it.
 */

const env = {
  fieldsFor: () => [],
  tableFor: () => null,
  activeDocId: null,
  nameOf: () => "α",
  overridesFor: () => undefined,
} satisfies PbuiEnvironment;

/** A clipboard that records, so a test can read what would have been copied. */
function fakeClipboard(readValue: string | null = null): ClipboardPort & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    async write(text) {
      written.push(text);
    },
    async read() {
      return readValue;
    },
  };
}

/** A workspace with one chart tile on one document. */
function oneChartTile(): { layout: LayoutState; nodeId: string } {
  const tile = leaf("chart");
  const layout = singleStageLayout("build", split("row", tile, leaf("table"), 0.5));
  return { layout, nodeId: tile.id };
}

function perform(store: ReturnType<typeof makeStore>, verb: Parameters<typeof actionsForVerb>[0]) {
  const { world, layout } = store.getState();
  return actionsForVerb(verb, { world, layout }, env);
}

describe("exporting is testable with no DOM", () => {
  test("exporting a tile writes a bundle to the clipboard and nothing else", async () => {
    const { layout, nodeId } = oneChartTile();
    const clipboard = fakeClipboard();
    const store = makeStore({ preloaded: { layout }, clipboard, seed: false });

    const [effect] = perform(store, { kind: "exportTile", nodeId });
    // Nothing has happened yet: actionsForVerb RETURNED a thunk, it did not run
    // one. That is the whole of the purity claim in one assertion.
    expect(clipboard.written).toEqual([]);

    const outcome = await store.dispatch(effect as AppThunk<Promise<{ ok: boolean }>>);
    expect(outcome.ok).toBe(true);

    const text = clipboard.written[0] as string;
    const parsed = parseBundle(text, "tile");
    expect(parsed.ok).toBe(true);
    expect(JSON.parse(text).payload.app).toBe("chart");
    // DR-64, asserted at the seam rather than only in portable.test.ts.
    expect(text).not.toContain(nodeId);
  });

  test("exporting a workspace names it and carries its tiles", async () => {
    const { layout } = oneChartTile();
    const clipboard = fakeClipboard();
    const store = makeStore({ preloaded: { layout }, clipboard, seed: false });

    const [effect] = perform(store, {
      kind: "exportWorkspace",
      spaceId: layout.currentSpaceId,
    });
    await store.dispatch(effect as AppThunk<Promise<unknown>>);

    const bundle = JSON.parse(clipboard.written[0] as string);
    expect(bundle.kind).toBe("workspace");
    expect(bundle.name).toBe("build");
  });

  test("a clipboard that refuses produces a reason, not a silent success", async () => {
    // The failure the design cares about: `navigator.clipboard?.writeText(x)`
    // with an optional chain reports nothing at all, so a user is told the copy
    // worked and pastes an empty clipboard into a chat message.
    const { layout, nodeId } = oneChartTile();
    const store = makeStore({
      preloaded: { layout },
      seed: false,
      clipboard: {
        async write() {
          throw new Error("denied by the platform");
        },
        async read() {
          return null;
        },
      },
    });

    const [effect] = perform(store, { kind: "exportTile", nodeId });
    const outcome = (await store.dispatch(
      effect as AppThunk<Promise<{ ok: boolean; reason?: string }>>,
    )) as { ok: boolean; reason?: string };
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("the copy did not happen");
  });

  test("the trace records the kind and the name, never the payload", () => {
    // A bundle names the sources these tiles read and the filters the user set.
    // The trace is a teaching surface people screenshot, so it says what was
    // shared and not what was in it.
    const { layout, nodeId } = oneChartTile();
    const clipboard = fakeClipboard();
    const store = makeStore({ preloaded: { layout }, clipboard, seed: false });
    const [effect] = perform(store, { kind: "exportTile", nodeId });
    return store.dispatch(effect as AppThunk<Promise<unknown>>).then(() => {
      const entry = store.getState().world.trace.at(-1);
      expect(entry?.type).toBe("exported");
      expect(entry?.detail).toContain("tile");
      expect(JSON.stringify(store.getState().world.trace)).not.toContain("datadrop.layout");
    });
  });
});

describe("importing never depends on reading the clipboard", () => {
  test("a clipboard that cannot be read opens the dialog empty", async () => {
    // Firefox does not implement readText for web content at all. This is the
    // path, not a degraded version of one.
    const { layout, nodeId } = oneChartTile();
    const store = makeStore({ preloaded: { layout }, clipboard: fakeClipboard(null), seed: false });

    const [effect] = perform(store, { kind: "importIntoTile", nodeId });
    await store.dispatch(effect as AppThunk<Promise<void>>);

    const pending = store.getState().layout.pendingImport;
    expect(pending?.target).toEqual({ kind: "tile", nodeId });
    expect(pending?.prefill).toBe("");
    expect(pending?.from).toBeNull();
  });

  test("a clipboard holding prose opens the dialog empty, not prefilled with prose", () => {
    const { layout, nodeId } = oneChartTile();
    const store = makeStore({
      preloaded: { layout },
      clipboard: fakeClipboard("Hi — could you take a look at the sensor numbers?"),
      seed: false,
    });
    const [effect] = perform(store, { kind: "importIntoTile", nodeId });
    return store.dispatch(effect as AppThunk<Promise<void>>).then(() => {
      expect(store.getState().layout.pendingImport?.prefill).toBe("");
    });
  });

  test("a clipboard holding a bundle of the WRONG kind does not prefill either", async () => {
    // A relevance check, not only a validity one.
    const { layout, nodeId } = oneChartTile();
    const written = fakeClipboard();
    const store0 = makeStore({ preloaded: { layout }, clipboard: written, seed: false });
    const [exportEffect] = perform(store0, {
      kind: "exportWorkspace",
      spaceId: layout.currentSpaceId,
    });
    await store0.dispatch(exportEffect as AppThunk<Promise<unknown>>);
    const workspaceBundle = written.written[0] as string;

    const store = makeStore({
      preloaded: { layout },
      clipboard: fakeClipboard(workspaceBundle),
      seed: false,
    });
    const [effect] = perform(store, { kind: "importIntoTile", nodeId });
    await store.dispatch(effect as AppThunk<Promise<void>>);
    expect(store.getState().layout.pendingImport?.prefill).toBe("");
  });

  test("a clipboard holding a tile bundle prefills, and says where it came from", async () => {
    const { layout, nodeId } = oneChartTile();
    const clipboard = fakeClipboard();
    const store0 = makeStore({ preloaded: { layout }, clipboard, seed: false });
    const [exportEffect] = perform(store0, { kind: "exportTile", nodeId });
    await store0.dispatch(exportEffect as AppThunk<Promise<unknown>>);
    const tileBundle = clipboard.written[0] as string;

    const store = makeStore({
      preloaded: { layout },
      clipboard: fakeClipboard(tileBundle),
      seed: false,
    });
    const [effect] = perform(store, { kind: "importIntoTile", nodeId });
    await store.dispatch(effect as AppThunk<Promise<void>>);

    expect(store.getState().layout.pendingImport?.prefill).toBe(tileBundle);
    expect(store.getState().layout.pendingImport?.from).toBe("clipboard");
  });

  test("committing an import replaces the tile and mints its document", async () => {
    const { layout, nodeId } = oneChartTile();
    const clipboard = fakeClipboard();
    // Export a tile out of a store that HAS a document, so the bundle carries
    // one and the import has something to mint.
    const source = makeStore({ preloaded: { layout }, clipboard });
    const doc = source.getState().world.docOrder[0] as string;
    source.dispatch(layoutActions.setLeafDoc({ nodeId, docId: doc }));
    const [exportEffect] = perform(source, { kind: "exportTile", nodeId });
    await source.dispatch(exportEffect as AppThunk<Promise<unknown>>);
    const text = clipboard.written[0] as string;

    const target = makeStore({ preloaded: { layout: oneChartTile().layout }, seed: false });
    const targetTree = (target.getState().layout.spaces[0] as { tree: Node }).tree;
    const targetNode = (targetTree as Extract<Node, { type: "split" }>).a.id;
    target.dispatch(
      layoutActions.openImport({
        target: { kind: "tile", nodeId: targetNode },
        prefill: text,
        from: "clipboard",
      }),
    );

    const [commit] = perform(target, { kind: "importIntoTile", nodeId: targetNode });
    void commit; // the verb opens the dialog; the dialog commits, below.
    const result = target.dispatch(
      (await import("../src/store/effects")).commitImport(text) as AppThunk<{ ok: boolean }>,
    );
    expect(result.ok).toBe(true);

    const tree = target.getState().layout.spaces[0]?.tree as Extract<Node, { type: "split" }>;
    const replaced = tree.a as Extract<Node, { type: "leaf" }>;
    // The TARGET's node id is kept: the tile is being re-pointed, not replaced.
    expect(replaced.id).toBe(targetNode);
    expect(replaced.app).toBe("chart");
    expect(replaced.docId).not.toBeNull();
    // A fresh document, not the exporting store's id.
    expect(replaced.docId).not.toBe(doc);
    expect(Object.keys(target.getState().world.docs)).toContain(replaced.docId as string);
    // And the dialog is closed.
    expect(target.getState().layout.pendingImport).toBeNull();
  });

  test("committing text that does not parse reports the reason and changes nothing", async () => {
    const { layout, nodeId } = oneChartTile();
    const store = makeStore({ preloaded: { layout }, seed: false });
    store.dispatch(
      layoutActions.openImport({ target: { kind: "tile", nodeId }, prefill: "", from: null }),
    );
    const { commitImport } = await import("../src/store/effects");
    const result = store.dispatch(
      commitImport("site,mean_temp\nnorth,21.4") as AppThunk<{
        ok: boolean;
        reason?: string;
      }>,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("that is not a DATALAB layout");
    // The dialog stays open, because the user has to be able to fix the text.
    expect(store.getState().layout.pendingImport).not.toBeNull();
  });
});

describe("a dialog is never persisted (DR-69)", () => {
  /** A localStorage stand-in, because bun has no DOM. */
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      map,
      install() {
        (globalThis as { localStorage?: unknown }).localStorage = {
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => void map.set(k, v),
          removeItem: (k: string) => void map.delete(k),
        };
      },
    };
  }

  test("save() writes no pendingImport and no renamingId, however open they are", () => {
    const storage = fakeStorage();
    storage.install();

    const { layout, nodeId } = oneChartTile();
    const store = makeStore({ preloaded: { layout }, seed: false });
    store.dispatch(
      layoutActions.openImport({
        target: { kind: "tile", nodeId },
        prefill: '{"format":"datadrop.layout"}',
        from: "clipboard",
      }),
    );
    store.dispatch(layoutActions.beginRename(nodeId));

    const { world, layout: after } = store.getState();
    expect(after.pendingImport).not.toBeNull();
    expect(after.renamingId).toBe(nodeId);

    save("k", world, after);
    const written = storage.map.get("k") as string;
    // Enumerated rather than spread, so the next transient field added to the
    // slice has to make a decision here rather than relying on someone
    // remembering. Without it the 500 ms debounce persists an open dialog and a
    // reload reopens it over a tile that may be gone.
    expect(written).not.toContain("pendingImport");
    expect(written).not.toContain("renamingId");
    expect(written).not.toContain("datadrop.layout");
    // And the durable fields ARE there.
    expect(JSON.parse(written).layout.spaces).toHaveLength(1);
    expect(JSON.parse(written).layout.stages).toHaveLength(1);
  });
});
