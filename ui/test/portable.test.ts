import { describe, expect, test } from "bun:test";
import type { ChartSpec } from "../src/model/chart";
import {
  BUNDLE_VERSION,
  FORMAT,
  LIMITS,
  REASONS,
  describeBundle,
  measureBundle,
  parseBundle,
  unknownApps,
  type Bundle,
  type PortableNode,
  type StagePayload,
  type TilePayload,
  type WorkspacePayload,
} from "../src/model/portable";
import {
  applyStageBundle,
  applyTileBundle,
  applyWorkspaceBundle,
  bundleForStage,
  bundleForTile,
  bundleForWorkspace,
  idsNeeded,
  type BundleState,
} from "../src/store/bundles";
import { leaf, split, type LayoutState, type Node, type Workspace } from "../src/store/layout";
import { initialWorld, type Doc, type WorldState } from "../src/store/world";

/**
 * The portable format, and the two conversions either side of it.
 *
 * The most important file in the ticket, and the two assertions that carry the
 * most weight are the least obvious ones:
 *
 *  - **no id travels** (DR-64). `JSON.stringify(bundle)` must contain none of
 *    the exporting store's node ids or document ids. The obvious implementation
 *    — stringify the node — compiles, runs, produces a plausible bundle, and
 *    gives you two nodes with one id the moment anyone pastes a tile back into
 *    the workspace they copied it from.
 *  - **sharing survives**. A chart and a table on one document must import as
 *    two tiles on ONE document. Inline the document at each leaf instead and
 *    nothing throws, no other test fails, and changing a filter in the pipeline
 *    silently stops moving the chart.
 *
 * Everything is a pure function of plain data, so there is no store, no DOM and
 * no clock: `at` is a parameter and so are the ids to mint.
 */

const AT = "2026-07-26T18:04:11.512Z";

function spec(drop = "sensors", value = "20"): ChartSpec {
  return {
    source: { kind: "stream", drop, stream: "readings" },
    steps: [{ id: "s1", kind: "filter", on: true, field: "data.temp_c", op: ">", value }],
    geom: "point",
    mapping: { x: "time", y: "data.temp_c", color: "data.station", size: null, facet: null },
    yScale: "linear",
  };
}

function doc(id: string, name: string, chartSpec = spec()): Doc {
  return { id, name, limit: 2000, spec: chartSpec };
}

function worldWith(...docs: Doc[]): WorldState {
  return {
    ...initialWorld,
    docs: Object.fromEntries(docs.map((d) => [d.id, d])),
    docOrder: docs.map((d) => d.id),
    activeDocId: docs[0]?.id ?? null,
  };
}

function layoutWith(spaces: Workspace[], currentSpaceId = spaces[0]?.id ?? ""): LayoutState {
  return {
    stages: [
      {
        id: "stage-1",
        name: "work",
        apps: null,
        chrome: { masthead: true, workspaces: true, stageBar: true },
        currentSpaceId,
      },
    ],
    currentStageId: "stage-1",
    spaces,
    currentSpaceId,
  };
}

/** The §7.4 worked example: a source browser beside a chart above an inspector. */
function exploreState(): { state: BundleState; nodes: string[]; docId: string } {
  const alpha = doc("8f2c0f9e", "α");
  const sources = leaf("sources");
  const chart = leaf("chart", alpha.id);
  const inspector = leaf("inspector");
  const tree = split("row", sources, split("col", chart, inspector, 0.6), 0.34);
  const space: Workspace = { id: "ws-1", name: "explore", stageId: "stage-1", tree };
  return {
    state: { world: worldWith(alpha), layout: layoutWith([space]) },
    nodes: [sources.id, chart.id, inspector.id, tree.id],
    docId: alpha.id,
  };
}

/** A chart and a table on ONE document — the sharing case. */
function sharedState(): { state: BundleState; docId: string } {
  const alpha = doc("aaaa-1111", "α");
  const tree = split("row", leaf("chart", alpha.id), leaf("table", alpha.id), 0.5);
  const space: Workspace = { id: "ws-shared", name: "two views", stageId: "stage-1", tree };
  return { state: { world: worldWith(alpha), layout: layoutWith([space]) }, docId: alpha.id };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `new-${i}`);

/* -------------------------------------------------------- the envelope -- */

describe("the envelope", () => {
  test("a workspace bundle matches the worked example, field for field", () => {
    const { state } = exploreState();
    const bundle = bundleForWorkspace(state, "ws-1", AT);

    expect(bundle.format).toBe(FORMAT);
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.kind).toBe("workspace");
    expect(bundle.exportedAt).toBe(AT);
    expect(bundle.name).toBe("explore");

    expect(bundle.payload.tree).toEqual({
      split: {
        dir: "row",
        ratio: 0.34,
        a: { leaf: { app: "sources" } },
        b: {
          split: {
            dir: "col",
            ratio: 0.6,
            a: { leaf: { app: "chart", doc: 0 } },
            b: { leaf: { app: "inspector" } },
          },
        },
      },
    });
    // `sources` and `inspector` are not docBound, so no `doc` field is written
    // at all — a `doc` on them would be ignored on import and is therefore not
    // in the bundle a human reads.
    expect(bundle.payload.docs).toHaveLength(1);
    expect(bundle.payload.docs[0]).toEqual({ name: "α", limit: 2000, spec: spec() });
  });

  test("a step id survives, because it never leaves the spec it lives in", () => {
    const { state } = exploreState();
    const bundle = bundleForWorkspace(state, "ws-1", AT);
    expect(bundle.payload.docs[0]?.spec.steps[0]?.id).toBe("s1");
  });

  test("a ratio outside the drawable range is clamped, not refused", () => {
    const tree = split("row", leaf("chart"), leaf("table"), 0.001);
    const space: Workspace = { id: "ws", name: "x", stageId: "stage-1", tree };
    const state: BundleState = { world: worldWith(), layout: layoutWith([space]) };
    const bundle = bundleForWorkspace(state, "ws", AT);
    expect((bundle.payload.tree as { split: { ratio: number } }).split.ratio).toBe(0.05);
  });

  test("a tile bundle inlines its one document rather than using an array", () => {
    const { state, nodes } = exploreState();
    const chartNode = nodes[1] as string;
    const bundle = bundleForTile(state, chartNode, AT);
    expect(bundle.payload.doc?.name).toBe("α");
    expect(bundle.payload).not.toHaveProperty("docs");
  });

  test("a stage bundle hoists documents above its workspaces", () => {
    const alpha = doc("d-1", "α");
    const a: Workspace = {
      id: "ws-a",
      name: "a",
      stageId: "stage-1",
      tree: leaf("chart", alpha.id),
    };
    const b: Workspace = {
      id: "ws-b",
      name: "b",
      stageId: "stage-1",
      tree: leaf("table", alpha.id),
    };
    const state: BundleState = { world: worldWith(alpha), layout: layoutWith([a, b]) };
    const bundle = bundleForStage(state, "stage-1", AT);

    // One document at the stage, index 0 from BOTH workspaces: two workspaces
    // in one stage sharing a document is the same argument as DR-64 one level
    // up, and a per-workspace docs array would break it exactly the same way.
    expect(bundle.payload.docs).toHaveLength(1);
    expect(bundle.payload.spaces).toHaveLength(2);
    expect(bundle.payload.spaces[0]?.docs).toEqual([]);
    expect(bundle.payload.spaces[0]?.tree).toEqual({ leaf: { app: "chart", doc: 0 } });
    expect(bundle.payload.spaces[1]?.tree).toEqual({ leaf: { app: "table", doc: 0 } });
  });
});

/* ------------------------------------------------------ ids do not travel -- */

describe("ids do not travel (DR-64)", () => {
  test("a workspace bundle contains no node id and no document id", () => {
    const { state, nodes, docId } = exploreState();
    const text = JSON.stringify(bundleForWorkspace(state, "ws-1", AT));
    for (const id of nodes) expect(text).not.toContain(id);
    expect(text).not.toContain(docId);
    expect(text).not.toContain("ws-1");
  });

  test("a tile bundle contains no node id and no document id", () => {
    const { state, nodes, docId } = exploreState();
    const text = JSON.stringify(bundleForTile(state, nodes[1] as string, AT));
    for (const id of nodes) expect(text).not.toContain(id);
    expect(text).not.toContain(docId);
  });

  test("a stage bundle contains no stage id and no workspace id", () => {
    const { state } = exploreState();
    const text = JSON.stringify(bundleForStage(state, "stage-1", AT));
    expect(text).not.toContain("stage-1");
    expect(text).not.toContain("ws-1");
  });

  test("importing into the tree it came from produces entirely fresh ids", () => {
    // "Duplicate by copy and paste" is exactly this, and a portable node that
    // kept `id` would give the workspace two nodes with one id — so `findLeaf`
    // returns the first and dragging one moves the other.
    const { state, nodes } = exploreState();
    const bundle = bundleForWorkspace(state, "ws-1", AT);
    const imported = applyWorkspaceBundle(bundle, "stage-1", ids(idsNeeded(bundle)));

    const collect = (node: Node): string[] =>
      node.type === "leaf" ? [node.id] : [node.id, ...collect(node.a), ...collect(node.b)];
    const fresh = collect(imported.space.tree);
    for (const id of nodes) expect(fresh).not.toContain(id);
    expect(new Set(fresh).size).toBe(fresh.length);
  });
});

/* --------------------------------------------------------- sharing -- */

describe("sharing survives a round trip", () => {
  test("two leaves on one document import to two leaves on ONE document", () => {
    const { state } = sharedState();
    const bundle = bundleForWorkspace(state, "ws-shared", AT);
    expect(bundle.payload.docs).toHaveLength(1);

    const imported = applyWorkspaceBundle(bundle, "stage-1", ids(idsNeeded(bundle)));
    const tree = imported.space.tree as Extract<Node, { type: "split" }>;
    const a = tree.a as Extract<Node, { type: "leaf" }>;
    const b = tree.b as Extract<Node, { type: "leaf" }>;

    // Identity, not equality. Two leaves pointing at two structurally identical
    // documents is precisely the defect: nothing throws, and changing a filter
    // in the pipeline stops moving the chart.
    expect(a.docId).toBe(b.docId as string);
    expect(Object.keys(imported.docs)).toHaveLength(1);
  });

  test("two workspaces in one stage import to one document as well", () => {
    const alpha = doc("d-1", "α");
    const a: Workspace = { id: "a", name: "a", stageId: "stage-1", tree: leaf("chart", alpha.id) };
    const b: Workspace = { id: "b", name: "b", stageId: "stage-1", tree: leaf("table", alpha.id) };
    const state: BundleState = { world: worldWith(alpha), layout: layoutWith([a, b]) };
    const bundle = bundleForStage(state, "stage-1", AT);
    const imported = applyStageBundle(bundle, ids(idsNeeded(bundle)));

    expect(Object.keys(imported.docs)).toHaveLength(1);
    const first = imported.spaces[0]?.tree as Extract<Node, { type: "leaf" }>;
    const second = imported.spaces[1]?.tree as Extract<Node, { type: "leaf" }>;
    expect(first.docId).toBe(second.docId as string);
  });
});

/* ------------------------------------------------------------ round trip -- */

describe("the round trip preserves what was shared", () => {
  test("applications, ratios, labels, document names, specs and limits", () => {
    const alpha = doc("d-1", "α", spec("sensors", "37"));
    const chart = { ...leaf("chart", alpha.id), label: "the raw feed" } as Extract<
      Node,
      { type: "leaf" }
    >;
    const tree = split("col", chart, leaf("table", alpha.id), 0.62);
    const space: Workspace = {
      id: "ws",
      name: "review",
      stageId: "stage-1",
      tree,
      apps: ["chart", "table"],
    };
    const state: BundleState = { world: worldWith(alpha), layout: layoutWith([space]) };

    const bundle = bundleForWorkspace(state, "ws", AT);
    const back = applyWorkspaceBundle(bundle, "stage-9", ids(idsNeeded(bundle)));

    expect(back.space.name).toBe("review");
    expect(back.space.stageId).toBe("stage-9");
    expect(back.space.apps).toEqual(["chart", "table"]);

    const t = back.space.tree as Extract<Node, { type: "split" }>;
    expect(t.dir).toBe("col");
    expect(t.ratio).toBe(0.62);
    const a = t.a as Extract<Node, { type: "leaf" }>;
    expect(a.app).toBe("chart");
    expect(a.label).toBe("the raw feed");

    const minted = Object.values(back.docs)[0];
    expect(minted?.name).toBe("α");
    expect(minted?.limit).toBe(2000);
    expect(minted?.spec).toEqual(spec("sensors", "37"));
    // A deep copy, not an alias: editing the imported document must not reach
    // back into the exporting store's.
    expect(minted?.spec).not.toBe(alpha.spec);
  });

  test("an unlabelled tile comes back unlabelled rather than with an empty label", () => {
    const { state, nodes } = exploreState();
    const bundle = bundleForTile(state, nodes[0] as string, AT);
    expect(bundle.payload).not.toHaveProperty("label");
    const back = applyTileBundle(bundle, ids(idsNeeded(bundle)));
    expect(back.leaf.label).toBeUndefined();
  });

  test("a stage round trip keeps its allow-list and its chrome", () => {
    const space: Workspace = { id: "ws", name: "x", stageId: "stage-1", tree: leaf("about") };
    const state: BundleState = {
      world: worldWith(),
      layout: {
        ...layoutWith([space]),
        stages: [
          {
            id: "stage-1",
            name: "sign in",
            apps: ["signin", "about"],
            chrome: { masthead: true, workspaces: false, stageBar: false },
            currentSpaceId: "ws",
          },
        ],
      },
    };
    const bundle = bundleForStage(state, "stage-1", AT);
    const back = applyStageBundle(bundle, ids(idsNeeded(bundle)));
    expect(back.stage.name).toBe("sign in");
    expect(back.stage.apps).toEqual(["signin", "about"]);
    expect(back.stage.chrome).toEqual({ masthead: true, workspaces: false, stageBar: false });
    // An imported stage is the user's, never code-defined: a bundle claiming
    // `pinned` would create a stage that cannot be deleted and that no release
    // will ever re-create.
    expect(back.stage.pinned).toBeUndefined();
  });

  test("a doc index naming nothing becomes a tile with no document", () => {
    // The honest reading of a bundle someone edited by hand: `docId: null` is
    // the tile's "follow the active document" state, which is a real state
    // rather than an error.
    const bundle: Bundle<"workspace"> = {
      format: FORMAT,
      version: BUNDLE_VERSION,
      kind: "workspace",
      exportedAt: AT,
      name: "x",
      payload: { name: "x", tree: { leaf: { app: "chart", doc: 7 } }, docs: [] },
    };
    const back = applyWorkspaceBundle(bundle, "stage-1", ids(idsNeeded(bundle) + 4));
    expect((back.space.tree as Extract<Node, { type: "leaf" }>).docId).toBeNull();
  });
});

/* ---------------------------------------------------------- every reason -- */

describe("parseBundle refuses with the reason, and the reasons are the specification", () => {
  const good = () => {
    const { state } = exploreState();
    return JSON.stringify(bundleForWorkspace(state, "ws-1", AT));
  };

  test("it accepts a bundle it produced", () => {
    const result = parseBundle(good());
    expect(result.ok).toBe(true);
  });

  test("not JSON at all", () => {
    const result = parseBundle("site,mean_temp,n\nnorth,21.4,18\n");
    expect(result).toEqual({ ok: false, reason: REASONS.notALayout });
  });

  test("JSON, but not a layout", () => {
    expect(parseBundle('{"hello":"world"}')).toEqual({
      ok: false,
      reason: REASONS.notALayout,
    });
  });

  test("a newer version", () => {
    const bundle = JSON.parse(good());
    bundle.version = BUNDLE_VERSION + 1;
    expect(parseBundle(JSON.stringify(bundle))).toEqual({ ok: false, reason: REASONS.newer });
  });

  test("an older version", () => {
    const bundle = JSON.parse(good());
    bundle.version = BUNDLE_VERSION - 1;
    expect(parseBundle(JSON.stringify(bundle))).toEqual({ ok: false, reason: REASONS.older });
  });

  test("the wrong kind, when a kind was expected", () => {
    const result = parseBundle(good(), "tile");
    expect(result).toEqual({
      ok: false,
      reason: "that is a workspace; this tile can only take a tile",
    });
  });

  test("the right kind passes the same check", () => {
    expect(parseBundle(good(), "workspace").ok).toBe(true);
  });

  test("a damaged tree", () => {
    const bundle = JSON.parse(good());
    bundle.payload.tree = { split: { dir: "sideways", ratio: 0.5, a: {}, b: {} } };
    expect(parseBundle(JSON.stringify(bundle))).toEqual({ ok: false, reason: REASONS.damaged });
  });

  test("a damaged document", () => {
    const bundle = JSON.parse(good());
    bundle.payload.docs[0].spec.geom = "hexbin";
    expect(parseBundle(JSON.stringify(bundle))).toEqual({ ok: false, reason: REASONS.damaged });
  });

  test("a document with no source", () => {
    const bundle = JSON.parse(good());
    delete bundle.payload.docs[0].spec.source;
    expect(parseBundle(JSON.stringify(bundle))).toEqual({ ok: false, reason: REASONS.damaged });
  });

  test("more tiles than the cap", () => {
    // A BALANCED 65-leaf tree, built in the test rather than asserted against a
    // constant. Balanced matters: a right-leaning chain of 65 leaves is also 65
    // deep, so it would be refused for its depth and this test would pass while
    // proving nothing about the leaf cap.
    const balanced = (n: number): PortableNode =>
      n === 1
        ? { leaf: { app: "chart" } }
        : {
            split: {
              dir: "row",
              ratio: 0.5,
              a: balanced(Math.ceil(n / 2)),
              b: balanced(Math.floor(n / 2)),
            },
          };
    const bundle = JSON.parse(good());
    bundle.payload.tree = balanced(LIMITS.leaves + 1);
    const result = parseBundle(JSON.stringify(bundle));
    expect(result).toEqual({
      ok: false,
      reason: "that bundle names 65 tiles; the limit is 64",
    });
  });

  test("deeper than the cap", () => {
    let tree: PortableNode = { leaf: { app: "chart" } };
    for (let i = 0; i < LIMITS.depth + 2; i++) {
      tree = { split: { dir: "row", ratio: 0.5, a: { leaf: { app: "chart" } }, b: tree } };
    }
    const bundle = JSON.parse(good());
    bundle.payload.tree = tree;
    // The depth check lives inside `isPortableNode` so that it BOUNDS the
    // recursion rather than running after it — a validator that overflows the
    // stack before reporting its limit is not a validator. A tree too deep is
    // therefore reported as damaged, which is what it is.
    expect(parseBundle(JSON.stringify(bundle)).ok).toBe(false);
  });

  test("bigger than the cap", () => {
    const big = `{"format":"${FORMAT}",${"x".repeat(LIMITS.bytes + 1)}}`;
    const result = parseBundle(big);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("the limit is 512 kB");
  });

  test("more documents than the cap", () => {
    const bundle = JSON.parse(good());
    const one = bundle.payload.docs[0];
    bundle.payload.docs = Array.from({ length: LIMITS.docs + 1 }, () => structuredClone(one));
    expect(parseBundle(JSON.stringify(bundle))).toEqual({
      ok: false,
      reason: "that bundle names 65 documents; the limit is 64",
    });
  });

  test("more workspaces in a stage than the cap", () => {
    const space: Workspace = { id: "ws", name: "x", stageId: "stage-1", tree: leaf("about") };
    const state: BundleState = { world: worldWith(), layout: layoutWith([space]) };
    const bundle = JSON.parse(JSON.stringify(bundleForStage(state, "stage-1", AT)));
    bundle.payload.spaces = Array.from({ length: LIMITS.spaces + 1 }, () => ({
      name: "x",
      tree: { leaf: { app: "about" } },
      docs: [],
    }));
    expect(parseBundle(JSON.stringify(bundle))).toEqual({
      ok: false,
      reason: "that bundle names 33 workspaces; the limit is 32",
    });
  });
});

/* ------------------------------------------------------- the secret guard -- */

describe("the credential guard fires in both directions", () => {
  test("the exporter refuses to produce a bundle carrying a credential", () => {
    // There is no path today by which a token could reach a ChartSpec, and that
    // is not an accident: TokenRef has no secret field and pbui/types.ts says
    // the absence is load-bearing. This is the second net under that one.
    const poisoned = doc("d-1", "α", {
      ...spec(),
      // A hand-edited spec, or a future field nobody thought about.
      ...({ token: "dd_live_not_a_real_secret" } as unknown as Partial<ChartSpec>),
    });
    const space: Workspace = {
      id: "ws",
      name: "x",
      stageId: "stage-1",
      tree: leaf("chart", poisoned.id),
    };
    const state: BundleState = { world: worldWith(poisoned), layout: layoutWith([space]) };

    expect(() => bundleForWorkspace(state, "ws", AT)).toThrow(/credential-shaped/);
    expect(() => bundleForTile(state, (space.tree as Node).id, AT)).toThrow(/credential-shaped/);
    expect(() => bundleForStage(state, "stage-1", AT)).toThrow(/credential-shaped/);
  });

  test("the importer refuses a bundle carrying a credential", () => {
    const { state } = exploreState();
    const bundle = JSON.parse(JSON.stringify(bundleForWorkspace(state, "ws-1", AT)));
    bundle.payload.docs[0].spec.authorization = "Bearer nope";
    expect(parseBundle(JSON.stringify(bundle))).toEqual({
      ok: false,
      reason: REASONS.credential,
    });
  });

  test("every forbidden spelling is caught, anywhere in the payload", () => {
    const { state } = exploreState();
    const base = JSON.parse(JSON.stringify(bundleForWorkspace(state, "ws-1", AT)));
    for (const key of [
      "token",
      "Token",
      "authorization",
      "auth",
      "bearer",
      "secret",
      "password",
      "apikey",
      "api_key",
    ]) {
      const bundle = structuredClone(base);
      bundle.payload.docs[0].spec.mapping[key] = "x";
      expect(parseBundle(JSON.stringify(bundle)).ok).toBe(false);
    }
  });

  test("a bundle produced from real state carries no credential-shaped key", () => {
    // The positive form of the same claim: what the exporter actually writes is
    // a name, a limit and a ChartSpec — a SourceRef, steps, a geom, a mapping
    // and a scale — and none of those has anywhere to put one.
    const { state } = exploreState();
    const text = JSON.stringify(bundleForWorkspace(state, "ws-1", AT));
    for (const key of ["token", "authorization", "bearer", "secret", "password", "apikey"]) {
      expect(text.toLowerCase()).not.toContain(`"${key}"`);
    }
  });
});

/* -------------------------------------------------- unknown applications -- */

describe("an unknown application warns rather than refusing", () => {
  test("parseBundle accepts a bundle naming an application this build lacks", () => {
    const { state } = exploreState();
    const bundle = JSON.parse(JSON.stringify(bundleForWorkspace(state, "ws-1", AT)));
    bundle.payload.tree.split.a.leaf.app = "chartsy";
    const result = parseBundle(JSON.stringify(bundle));
    expect(result.ok).toBe(true);
  });

  test("unknownApps names them, sorted and deduplicated", () => {
    const { state } = exploreState();
    const bundle = JSON.parse(JSON.stringify(bundleForWorkspace(state, "ws-1", AT))) as Bundle;
    (bundle.payload as WorkspacePayload).tree = {
      split: {
        dir: "row",
        ratio: 0.5,
        a: { leaf: { app: "chartsy" } },
        b: {
          split: {
            dir: "col",
            ratio: 0.5,
            a: { leaf: { app: "chartsy" } },
            b: { leaf: { app: "abacus" } },
          },
        },
      },
    };
    expect(unknownApps(bundle, new Set(["chart", "table"]))).toEqual(["abacus", "chartsy"]);
  });

  test("a bundle naming only known applications reports none", () => {
    const { state } = exploreState();
    const bundle = bundleForWorkspace(state, "ws-1", AT);
    expect(unknownApps(bundle, new Set(["sources", "chart", "inspector"]))).toEqual([]);
  });

  test("the tile that named it still imports, and can be re-pointed", () => {
    const bundle: Bundle<"tile"> = {
      format: FORMAT,
      version: BUNDLE_VERSION,
      kind: "tile",
      exportedAt: AT,
      name: "x",
      payload: { app: "chartsy" },
    };
    const back = applyTileBundle(bundle, ids(idsNeeded(bundle)));
    expect(back.leaf.app).toBe("chartsy");
  });
});

/* ------------------------------------------------------- describe/measure -- */

describe("describeBundle and measureBundle", () => {
  test("a tile reads as a sentence naming its application, document and source", () => {
    const { state, nodes } = exploreState();
    const bundle = bundleForTile(state, nodes[1] as string, AT);
    expect(describeBundle(bundle)).toBe(
      "A tile: chart on a document called α, reading sensors / readings.",
    );
  });

  test("a tile with no document says so by omission, not by saying none", () => {
    const { state, nodes } = exploreState();
    const bundle = bundleForTile(state, nodes[0] as string, AT);
    expect(describeBundle(bundle)).toBe("A tile: sources.");
  });

  test("a workspace counts its tiles and documents, and singulars are singular", () => {
    const { state } = exploreState();
    const bundle = bundleForWorkspace(state, "ws-1", AT);
    expect(describeBundle(bundle)).toBe(
      "A workspace “explore”: 3 tiles, 1 document, reading sensors / readings.",
    );
  });

  test("a stage counts its workspaces too", () => {
    const space: Workspace = { id: "ws", name: "x", stageId: "stage-1", tree: leaf("about") };
    const state: BundleState = { world: worldWith(), layout: layoutWith([space]) };
    const bundle = bundleForStage(state, "stage-1", AT);
    expect(describeBundle(bundle)).toBe("A stage “work”: 1 workspace, 1 tile, 0 documents.");
  });

  test("measureBundle counts what the confirmation line reports", () => {
    const { state } = exploreState();
    const measured = measureBundle(bundleForWorkspace(state, "ws-1", AT));
    expect(measured.tiles).toBe(3);
    expect(measured.docs).toBe(1);
    expect(measured.spaces).toBe(1);
    expect(measured.bytes).toBeGreaterThan(100);
  });
});

/* ------------------------------------------------------------- id pool -- */

describe("ids are minted by the caller, never inside", () => {
  test("idsNeeded is exactly what applying the bundle consumes", () => {
    const { state } = exploreState();
    for (const bundle of [
      bundleForWorkspace(state, "ws-1", AT) as Bundle,
      bundleForStage(state, "stage-1", AT) as Bundle,
    ]) {
      const needed = idsNeeded(bundle);
      const apply = () =>
        bundle.kind === "workspace"
          ? applyWorkspaceBundle(bundle as Bundle<"workspace">, "s", ids(needed))
          : applyStageBundle(bundle as Bundle<"stage">, ids(needed));
      expect(apply).not.toThrow();
      // One fewer must fail loudly rather than minting a duplicate or an
      // undefined id, which would surface as a duplicate React key.
      const short = () =>
        bundle.kind === "workspace"
          ? applyWorkspaceBundle(bundle as Bundle<"workspace">, "s", ids(needed - 1))
          : applyStageBundle(bundle as Bundle<"stage">, ids(needed - 1));
      expect(short).toThrow(/not enough ids/);
    }
  });
});

/* ----------------------------------------------- the shapes are the types -- */

describe("the payload types are what the parser accepts", () => {
  test("a tile payload with a label and no document parses", () => {
    const payload: TilePayload = { app: "table", label: "raw feed" };
    const bundle: Bundle<"tile"> = {
      format: FORMAT,
      version: BUNDLE_VERSION,
      kind: "tile",
      exportedAt: AT,
      name: "raw feed",
      payload,
    };
    expect(parseBundle(JSON.stringify(bundle), "tile").ok).toBe(true);
  });

  test("a stage payload with no allow-list parses", () => {
    const payload: StagePayload = {
      name: "work",
      apps: null,
      chrome: { masthead: true, workspaces: true, stageBar: true },
      spaces: [{ name: "build", tree: { leaf: { app: "chart" } }, docs: [] }],
      docs: [],
    };
    const bundle: Bundle<"stage"> = {
      format: FORMAT,
      version: BUNDLE_VERSION,
      kind: "stage",
      exportedAt: AT,
      name: "work",
      payload,
    };
    expect(parseBundle(JSON.stringify(bundle), "stage").ok).toBe(true);
  });
});
