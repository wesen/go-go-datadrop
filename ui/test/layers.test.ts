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
  // Components, in dependency order.
  foundation: [],
  layout: ["foundation"],
  atoms: ["foundation", "layout", "pbui", "model"],
  molecules: ["foundation", "layout", "atoms", "pbui", "model", "store"],
  // `organisms` may reach `apps` for the registry alone: Tile has to resolve an
  // app id to a component. The reverse is forbidden below, which is what keeps
  // the pair acyclic — an application importing Tile would close the loop.
  organisms: ["foundation", "layout", "atoms", "molecules", "pbui", "model", "store", "api", "apps"],
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
  ],
  // Note the absence of `organisms` and `pages`. Applications are organisms in
  // everything but directory, and they compose molecules; they must never reach
  // back up to the shell that hosts them.
  apps: ["foundation", "layout", "atoms", "molecules", "pbui", "model", "store", "api"],
};

const COMPONENT_LAYERS = new Set([
  "foundation",
  "layout",
  "atoms",
  "molecules",
  "organisms",
  "pages",
]);

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

  test("the organisms/apps pair stays acyclic", () => {
    // `organisms -> apps` is permitted for the registry, so the guard against a
    // cycle is that nothing under apps/ reaches back. Stated as its own test
    // because the graph walk above cannot express "this edge exists only in one
    // direction", and because a cycle here would be diagnosed as a confusing
    // module-initialisation error rather than as a layering mistake.
    const strays: string[] = [];
    for (const file of FILES.filter((f) => layerOf(f) === "apps")) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) continue;
        const to = layerOf(resolve(dirname(file), specifier));
        if (to === "organisms" || to === "pages") {
          strays.push(`${relative(SRC, file)} -> ${specifier} (${to})`);
        }
      }
    }
    expect(strays).toEqual([]);
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
