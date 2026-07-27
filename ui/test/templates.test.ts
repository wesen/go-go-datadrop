import { beforeEach, describe, expect, test } from "bun:test";
import { BUNDLE_VERSION, FORMAT, type Bundle } from "../src/model/portable";
import {
  clearTemplates,
  deleteTemplate,
  listTemplates,
  measureLibrary,
  renameTemplate,
  saveTemplate,
  TEMPLATE_LIMITS,
  TEMPLATES_KEY,
  type TemplateRecord,
} from "../src/store/templates";

/**
 * The template library, against a fake `localStorage`.
 *
 * Everything in `store/templates.ts` takes and returns plain data and touches
 * storage directly, exactly as `persist.ts` does — no store, no React — which
 * is what makes this file possible at all.
 *
 * The interesting tests are the refusals. A cap that fails silently at the
 * fiftieth save is worse than no cap: the user has no idea why nothing
 * happened, and the library is the one place in this ticket where the data is
 * not reconstructible.
 */

/** A localStorage stand-in that can be made to fail. */
function fakeStorage(options: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (options.failWrites) {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
  return map;
}

function bundle(name = "explore", app = "chart"): Bundle {
  return {
    format: FORMAT,
    version: BUNDLE_VERSION,
    kind: "workspace",
    exportedAt: "2026-07-26T18:04:11.512Z",
    name,
    payload: { name, tree: { leaf: { app } }, docs: [] },
  } as Bundle;
}

function record(id: string, name = "explore"): TemplateRecord {
  return { id, name, kind: "workspace", savedAt: "2026-07-26T18:04:11.512Z", bundle: bundle(name) };
}

let storage: Map<string, string>;
beforeEach(() => {
  storage = fakeStorage();
});

describe("storing and reading", () => {
  test("an empty library reads as an empty array, not as an error", () => {
    expect(listTemplates()).toEqual([]);
  });

  test("what goes in comes out, newest first", () => {
    expect(saveTemplate(record("a", "first"))).toEqual({ ok: true });
    expect(saveTemplate(record("b", "second"))).toEqual({ ok: true });
    // Newest first, so the library reads as a history rather than an archive.
    expect(listTemplates().map((t) => t.name)).toEqual(["second", "first"]);
  });

  test("one key holds the array (DR-70), not a key per template", () => {
    saveTemplate(record("a"));
    saveTemplate(record("b"));
    expect([...storage.keys()]).toEqual([TEMPLATES_KEY]);
  });

  test("renaming keeps everything else", () => {
    saveTemplate(record("a", "before"));
    expect(renameTemplate("a", "  after  ")).toEqual({ ok: true });
    const stored = listTemplates()[0];
    expect(stored?.name).toBe("after");
    expect(stored?.savedAt).toBe("2026-07-26T18:04:11.512Z");
  });

  test("a blank rename is refused rather than producing an unclickable row", () => {
    saveTemplate(record("a", "before"));
    expect(renameTemplate("a", "   ")).toEqual({ ok: false, reason: "a template needs a name" });
    expect(listTemplates()[0]?.name).toBe("before");
  });

  test("renaming something that is gone says so", () => {
    expect(renameTemplate("nope", "x")).toEqual({ ok: false, reason: "that template is gone" });
  });

  test("deleting removes exactly one", () => {
    saveTemplate(record("a", "keep"));
    saveTemplate(record("b", "go"));
    deleteTemplate("b");
    expect(listTemplates().map((t) => t.name)).toEqual(["keep"]);
  });

  test("clearing empties the library", () => {
    saveTemplate(record("a"));
    clearTemplates();
    expect(listTemplates()).toEqual([]);
  });
});

describe("the three caps refuse with a reason (DR-70)", () => {
  test("the count cap", () => {
    for (let i = 0; i < TEMPLATE_LIMITS.count; i++) {
      expect(saveTemplate(record(`t${i}`)).ok).toBe(true);
    }
    expect(saveTemplate(record("one-too-many"))).toEqual({
      ok: false,
      reason: "50 templates is the limit — delete one first",
    });
    expect(listTemplates()).toHaveLength(TEMPLATE_LIMITS.count);
  });

  test("the per-template cap", () => {
    const huge = record("huge");
    // A name long enough to blow the per-item cap on its own, which is a
    // cheaper fixture than a genuinely enormous tree and exercises the same
    // measurement.
    huge.name = "x".repeat(TEMPLATE_LIMITS.bytesEach + 1);
    const result = saveTemplate(huge);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("the limit is 512 kB");
    expect(listTemplates()).toEqual([]);
  });

  test("the total cap, reached by many templates that each fit", () => {
    // Each is well under `bytesEach`; together they exceed `bytesTotal`.
    const big = (id: string) => {
      const r = record(id);
      r.name = "y".repeat(100_000);
      return r;
    };
    let refused: { ok: boolean; reason?: string } = { ok: true };
    for (let i = 0; i < TEMPLATE_LIMITS.count; i++) {
      refused = saveTemplate(big(`t${i}`));
      if (!refused.ok) break;
    }
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain("delete something first");
  });
});

describe("the library is defensive", () => {
  test("a corrupt blob reads as empty, with a warning, rather than throwing", () => {
    storage.set(TEMPLATES_KEY, "{not json at all");
    expect(listTemplates()).toEqual([]);
  });

  test("a payload from another version is ignored rather than half-read", () => {
    storage.set(TEMPLATES_KEY, JSON.stringify({ version: 99, templates: [record("a")] }));
    expect(listTemplates()).toEqual([]);
  });

  test("a record whose bundle no longer parses is dropped, not surfaced", () => {
    // Hand-edited in devtools, or written by a newer build. It must be refused
    // here rather than at the moment someone loads it into their layout.
    const damaged = record("a");
    (damaged.bundle as { payload: unknown }).payload = { name: "x", tree: { leaf: {} }, docs: [] };
    storage.set(TEMPLATES_KEY, JSON.stringify({ version: 1, templates: [damaged, record("b")] }));
    expect(listTemplates().map((t) => t.id)).toEqual(["b"]);
  });

  test("a record with the wrong shape is dropped", () => {
    storage.set(TEMPLATES_KEY, JSON.stringify({ version: 1, templates: [{ id: 7 }, record("b")] }));
    expect(listTemplates().map((t) => t.id)).toEqual(["b"]);
  });

  test("a QuotaExceededError produces {ok:false}, not an exception", () => {
    fakeStorage({ failWrites: true });
    const result = saveTemplate(record("a"));
    expect(result).toEqual({ ok: false, reason: "this browser's storage is full" });
  });

  test("a bundle carrying a credential is refused at the third door too", () => {
    // It cannot get here from this build — `bundleFor*` already refused — so
    // reaching this means the record came from somewhere else. The guard is the
    // same `findSecrets` that audits localStorage and both directions of a
    // bundle, which is why it cannot drift.
    const poisoned = record("a");
    (poisoned.bundle.payload as { token?: string }).token = "dd_live_not_a_real_secret";
    expect(saveTemplate(poisoned)).toEqual({
      ok: false,
      reason: "that bundle contains something credential-shaped and was refused",
    });
    expect(listTemplates()).toEqual([]);
  });
});

describe("measureLibrary", () => {
  test("counts what the line above the table reports", () => {
    saveTemplate(record("a"));
    saveTemplate(record("b"));
    const measured = measureLibrary(listTemplates());
    expect(measured.count).toBe(2);
    expect(measured.bytes).toBeGreaterThan(100);
  });

  test("an empty library measures as empty", () => {
    expect(measureLibrary([]).count).toBe(0);
  });
});
