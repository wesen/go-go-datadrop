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
  // The presentation protocol knows the store and the engine, never a component.
  pbui: ["model", "store", "api"],
  store: ["model", "api"],
  styles: [],
  fixtures: ["model"],
  // Components, in dependency order.
  foundation: [],
  layout: ["foundation"],
  atoms: ["foundation", "layout", "pbui", "model"],
  molecules: ["foundation", "layout", "atoms", "pbui", "model", "store"],
  organisms: ["foundation", "layout", "atoms", "molecules", "pbui", "model", "store", "api"],
  pages: ["foundation", "layout", "atoms", "molecules", "organisms", "pbui", "model", "store", "api"],
  apps: ["foundation", "layout", "atoms", "molecules", "organisms", "pbui", "model", "store", "api"],
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
