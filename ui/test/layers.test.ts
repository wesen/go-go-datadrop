import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The layer boundary, enforced.
 *
 * §10.2 defines a one-way dependency graph. A convention that is only written
 * down is a convention that has already been broken somewhere nobody has
 * looked, so this walks every import in src/ and fails on a violation.
 *
 * Deliberately a bun test rather than the eslint-plugin-import rule the guide
 * suggested. The project has no eslint configuration at all, and adding one —
 * plus a parser, plus a resolver, plus the plugin — to enforce a graph that
 * fits in the table below is a poor trade. This runs inside `bun test`, which
 * is already in CI, and it reports the offending import rather than a rule id.
 */

const SRC = resolve(import.meta.dir, "../src");

/** Which layers a file in each layer may import from. */
const ALLOWED: Record<string, string[]> = {
  // The engine is pure and answers to nobody. This is the rule that matters
  // most: it is what keeps `bun test` able to exercise the whole grammar of
  // graphics with no DOM and no server.
  model: [],
  // The data layer knows the wire types and nothing else.
  api: ["model"],
  export: ["model"],
  // The presentation protocol knows the engine and `foundation`, and NOT the
  // store. The guide declared `pbui -> store`, which is backwards and would
  // have been a cycle: `store` consumes the verb and presentation vocabulary
  // that `pbui` defines, never the reverse. Nothing in pbui/ ever imported the
  // store, so the declaration was speculative — and this test is what turned a
  // speculative dependency into a corrected one rather than a latent cycle.
  //
  // `foundation` is an exception granted deliberately. It is the bottom of the
  // component stack — tokens made usable in React, importing nothing itself —
  // so depending on it cannot create a cycle, and the alternative is pbui
  // re-implementing VisuallyHidden and the type scale.
  //
  // What pbui may NOT import is atoms and above: descriptors hold no components
  // (registry.ts explains why), so the chip that draws a presentation lives in
  // atoms and the type-to-chip mapping lives there with it.
  pbui: ["model", "foundation"],
  // The store speaks the presentation vocabulary: WatchEntry carries a
  // PresentationType, and applyVerb maps a Verb onto reducers.
  store: ["model", "api", "pbui"],
  styles: [],
  fixtures: ["model"],
  /*
   * The application contract, and nothing else: an AppDescriptor interface, a
   * Map, and three functions over it. It is NOT an application.
   *
   * Its own layer because of what it unblocks (DATADROP-6 DR-33). While it sat
   * in apps/, `organisms/Tile` importing `appFor` was the one and only reason
   * this table carried an `organisms -> apps` edge — and that edge is why
   * `apps -> organisms` had to be forbidden, to keep the pair acyclic.
   *
   * The forbidden edge made the presentational-organism pattern illegal:
   * panels in `organisms` with the applications as thin containers above them.
   * Moving 49 lines removes the edge, so the pattern becomes available and no
   * cycle can form — `organisms` no longer names `apps` at all.
   */
  appkit: ["model", "pbui", "store"],
  /*
   * Lesson content: the four tracks, the module cards, the cheat sheets.
   *
   * A layer rather than a directory under `components/` because of what it may
   * and may not see (DATADROP-7 DR-54). It MAY import `store`, because a lesson
   * predicate takes a `RootState` and a ▶ runner returns actions; it MAY import
   * `model`, because a predicate may ask whether the engine can draw a spec;
   * and it MAY import `appkit`, which is where the `Lesson` contract lives.
   *
   * It also imports `fixtures` and `api`, both added after this test caught
   * them. `fixtures` is where the committed tables live and the tour's data IS
   * those tables — a second copy for the tour would be a second thing to keep
   * true. `api` supplies `FixtureData` and `fixturesFrom`, because "answer
   * these sources from memory" is a transport concern and the type belongs
   * beside the base query that reads it. Neither can cycle: nothing in `api`
   * or `fixtures` names `tour`.
   *
   * It may NOT import `components`. That restriction is the load-bearing one:
   * it is what keeps a lesson testable with no DOM, and it is why the `Lesson`
   * type sits in `appkit` rather than beside the rail that renders it.
   * `test/tour.test.ts` states it separately, because a permission table can
   * express what is allowed but not which prohibition is the point.
   */
  tour: ["model", "pbui", "store", "appkit", "api", "fixtures"],
  // Components, in dependency order.
  foundation: [],
  layout: ["foundation"],
  atoms: ["foundation", "layout", "pbui", "model"],
  molecules: ["foundation", "layout", "atoms", "pbui", "model", "store"],
  // `appkit`, not `apps`: Tile resolves an app id to a component through the
  // contract, never through the applications themselves (DR-33). With that edge
  // gone, `apps -> organisms` below is safe.
  organisms: [
    "foundation",
    "layout",
    "atoms",
    "molecules",
    "pbui",
    "model",
    "store",
    "api",
    "appkit",
  ],
  pages: [
    "foundation",
    "layout",
    "atoms",
    "molecules",
    "organisms",
    "pbui",
    "model",
    "store",
    "api",
    "apps",
    "appkit",
    // The landing page names the four lesson tracks and the module cards.
    // One-way: nothing in `tour` imports `components`, so no cycle can form.
    "tour",
  ],
  // Applications are containers: they hold the hooks and the fetches and hand
  // DTOs to presentational organisms. `pages` is still absent — an application
  // must never reach back up to the shell that hosts it.
  apps: [
    "foundation",
    "layout",
    "atoms",
    "molecules",
    "organisms",
    "pbui",
    "model",
    "store",
    "api",
    "appkit",
  ],
};

const COMPONENT_LAYERS = new Set([
  "foundation",
  "layout",
  "atoms",
  "molecules",
  "organisms",
  "pages",
]);

/**
 * Every source file except the stories.
 *
 * **Stories are deliberately exempt from the graph**, and the exemption is
 * worth stating because it is load-bearing rather than incidental. A story is a
 * review surface, not shipped code — nothing under `.storybook/` reaches the
 * bundle `pkg/webui` embeds — and its job is to compose whatever demonstrates
 * the component, which routinely means reaching across layers. `pbui`'s own
 * playground story imports a molecule so that the channel row it demonstrates
 * is the *real* one rather than a second copy, which is exactly the outcome
 * DATADROP-6 wanted and which the graph would otherwise forbid.
 *
 * The cost is that a story can hide a dependency someone later copies into
 * production code. That copy would then be checked, and would fail here, which
 * is the property that makes the exemption safe.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".stories.tsx")) out.push(path);
  }
  return out;
}

/** The layer a path belongs to, or null for files outside the scheme. */
function layerOf(path: string): string | null {
  const rel = relative(SRC, path).split("/");
  if (rel[0] === "components") return rel[1] ?? null;
  return rel[0] ?? null;
}

/** Every relative or bare import specifier in a file. */
function importsOf(source: string): string[] {
  const out: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push(match[1] as string);
  return out;
}

const FILES = walk(SRC);

describe("the layer graph is one-way", () => {
  test("there are files to check", () => {
    // A refactor that moves src/ elsewhere would otherwise make this whole
    // suite pass by checking nothing.
    expect(FILES.length).toBeGreaterThan(10);
  });

  test("no file imports from a layer above it", () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const from = layerOf(file);
      if (!from || !(from in ALLOWED)) continue;

      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) continue; // a package, not our code
        const target = resolve(dirname(file), specifier);
        if (!target.startsWith(SRC)) continue;

        const to = layerOf(target);
        if (!to || to === from) continue;
        if (!(to in ALLOWED)) continue;

        if (!(ALLOWED[from] as string[]).includes(to)) {
          violations.push(
            `${relative(SRC, file)} (${from}) imports ${specifier} (${to}) — ` +
              `${from} may import: ${(ALLOWED[from] as string[]).join(", ") || "nothing"}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("the engine imports nothing but itself", () => {
    // Stated separately from the graph walk because it is the invariant the
    // whole test file exists to protect, and a failure here should say so
    // rather than being one line in a list.
    const strays: string[] = [];
    for (const file of FILES.filter((f) => layerOf(f) === "model")) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".")) {
          const to = layerOf(resolve(dirname(file), specifier));
          if (to !== "model") strays.push(`${relative(SRC, file)} -> ${specifier}`);
        } else if (specifier !== "react" && !specifier.startsWith("node:")) {
          strays.push(`${relative(SRC, file)} -> package ${specifier}`);
        } else if (specifier === "react") {
          strays.push(`${relative(SRC, file)} imports React — the engine must stay DOM-free`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  test("nothing under organisms reaches into apps", () => {
    // The edge DR-33 deleted, guarded by name so it cannot come back quietly.
    //
    // The graph walk above already forbids it. This states the invariant
    // separately because `apps -> organisms` is now *permitted*, so a single
    // re-added import of an application from an organism closes a real cycle —
    // and a cycle here surfaces as a confusing module-initialisation error
    // rather than as a layering mistake.
    const strays: string[] = [];
    for (const file of FILES.filter((f) => layerOf(f) === "organisms")) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) continue;
        if (layerOf(resolve(dirname(file), specifier)) === "apps") {
          strays.push(`${relative(SRC, file)} -> ${specifier} (apps)`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  test("every source directory sits in the graph", () => {
    // The hole DR-33 fell into on its way in: `src/appkit/` was created, the
    // graph did not mention it, and BOTH the walk above and the edge into it
    // were silently skipped — `if (!(from in ALLOWED)) continue` and
    // `if (!(to in ALLOWED)) continue`. The suite went green while the new
    // layer was entirely unconstrained.
    //
    // The equivalent check for components/ existed already. This is the same
    // check one level up, and it is the one that would have caught it.
    const known = new Set([...Object.keys(ALLOWED), "components", "main.tsx", "vite-env.d.ts"]);
    const unknown = readdirSync(SRC).filter((entry) => !known.has(entry));
    expect(unknown).toEqual([]);
  });

  test("every component directory sits in a known layer", () => {
    // Catches a new directory added under components/ that nobody wired into
    // the graph — which would otherwise be silently unconstrained.
    const unknown = readdirSync(join(SRC, "components")).filter(
      (entry) =>
        statSync(join(SRC, "components", entry)).isDirectory() && !COMPONENT_LAYERS.has(entry),
    );
    expect(unknown).toEqual([]);
  });
});
