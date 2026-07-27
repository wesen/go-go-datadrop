import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The tour describes every application, and describes only real ones.
 *
 * A new application that ships without a module card is an application nobody
 * has a model of — the rack is the only place in the tree that says what each
 * tile is *for*, what it emits, what it accepts and which other tile people
 * confuse it with. Nothing else would notice the omission, because a missing
 * card is a card that is simply not rendered.
 *
 * The reverse direction matters too: a card naming an application that no
 * longer exists renders as nothing at all, so the rack silently shrinks. The
 * organism drops unknown ids defensively; this is what makes that defence
 * unnecessary.
 *
 * ## Parsed, not imported
 *
 * Both sides are read out of source with a regex rather than by importing the
 * modules, and the reason is the same one `stories.test.ts` gives: importing
 * `apps/all` pulls in React, every component beneath it and their CSS modules,
 * turning a 20 ms test into a bundling exercise. `registerApp({ id: "…" })` and
 * the `id:` field of a module entry are both literals in every file we write,
 * and this test says so, which is what makes relying on it fair.
 */

const SRC = resolve(import.meta.dir, "../src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** Every id passed to `registerApp`. */
function registeredIds(): string[] {
  const ids: string[] = [];
  for (const file of walk(join(SRC, "apps"))) {
    const source = readFileSync(file, "utf8");
    const pattern = /registerApp\(\{\s*id:\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) ids.push(match[1] as string);
  }
  return ids;
}

/** Every id in the module rack's content. */
function documentedIds(): string[] {
  const source = readFileSync(join(SRC, "tour", "modules.tsx"), "utf8");
  const ids: string[] = [];
  const pattern = /^\s*id:\s*["']([^"']+)["'],/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) ids.push(match[1] as string);
  return ids;
}

const REGISTERED = registeredIds();
const DOCUMENTED = documentedIds();

describe("the module rack covers the registry", () => {
  test("there are applications to check", () => {
    // A refactor that moves apps/ elsewhere would otherwise make this suite
    // pass by comparing two empty sets.
    expect(REGISTERED.length).toBeGreaterThan(15);
  });

  test("every registered application has a module card", () => {
    const documented = new Set(DOCUMENTED);
    const missing = REGISTERED.filter((id) => !documented.has(id)).sort();
    expect(missing).toEqual([]);
  });

  test("every module card names a registered application", () => {
    const registered = new Set(REGISTERED);
    const ghosts = DOCUMENTED.filter((id) => !registered.has(id)).sort();
    expect(ghosts).toEqual([]);
  });

  test("no application is documented twice", () => {
    const seen = new Set<string>();
    const duplicates = DOCUMENTED.filter((id) => !seen.add(id)).sort();
    expect(duplicates).toEqual([]);
  });
});

describe("the tour layer stays testable without a DOM", () => {
  test("nothing under tour/ imports a component", () => {
    // DR-54, stated separately from the layer graph because it is the
    // restriction the whole placement exists for: a lesson predicate has to be
    // unit-testable against a literal state object, and a `tour` module that
    // reaches into `components/` drags React and the CSS modules in with it.
    const strays: string[] = [];
    for (const file of walk(join(SRC, "tour"))) {
      const source = readFileSync(file, "utf8");
      const pattern = /from\s+["']([^"']*components\/[^"']*)["']/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        strays.push(`${file} -> ${match[1]}`);
      }
    }
    expect(strays).toEqual([]);
  });
});
