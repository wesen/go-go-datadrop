import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * `duplicable` and `singleton` follow `docBound` unless a reason is written down.
 *
 * DR-63 makes them two required fields rather than one enum with a default, and
 * the assignment across the twenty-five applications is very nearly a
 * derivation: `duplicable === docBound` and `singleton === !docBound`, with
 * `launcher` the one exception in each column. That is not a coincidence — it
 * is the same distinction `docBound` names, between a view *of one composition*
 * and a view of the whole world — and it is close enough to a derivation that a
 * hand-kept list will drift from it.
 *
 * So: a new application that disagrees with the rule fails here, and the fix is
 * either to change the descriptor or to write a sentence into `EXCEPTIONS`. An
 * escape hatch that costs a sentence is one people use honestly — the same
 * pattern `test/no-raw-controls.test.ts` uses for raw elements.
 *
 * ## Parsed, not imported
 *
 * Same reason `tour.test.ts` gives: importing `apps/all` pulls in React, every
 * component beneath it and their CSS modules, turning a 20 ms test into a
 * bundling exercise. `registerApp({ … })` is a literal object in every file we
 * write, and this test says so, which is what makes relying on it fair.
 */

const SRC = resolve(import.meta.dir, "../src");

const EXCEPTIONS: Record<string, string> = {
  launcher:
    "the empty tile: every split creates one, so a workspace may hold many and " +
    "it is not a singleton — but duplicating an empty tile produces a second " +
    "empty tile, which is exactly what the split button already does",
};

interface Descriptor {
  file: string;
  id: string;
  docBound: boolean;
  duplicable: boolean | null;
  singleton: boolean | null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".stories.tsx")) out.push(path);
  }
  return out;
}

function boolField(block: string, name: string): boolean | null {
  const match = new RegExp(`\\b${name}:\\s*(true|false)`).exec(block);
  return match ? match[1] === "true" : null;
}

function descriptors(): Descriptor[] {
  const found: Descriptor[] = [];
  for (const file of walk(join(SRC, "apps"))) {
    const source = readFileSync(file, "utf8");
    const pattern = /registerApp\(\{([\s\S]*?)\n\}\);/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const block = match[1] as string;
      const id = /\bid:\s*["']([^"']+)["']/.exec(block)?.[1];
      if (!id) continue;
      found.push({
        file: relative(SRC, file),
        id,
        docBound: boolField(block, "docBound") === true,
        duplicable: boolField(block, "duplicable"),
        singleton: boolField(block, "singleton"),
      });
    }
  }
  return found;
}

const APPS = descriptors();

describe("application descriptors", () => {
  test("there are applications to check", () => {
    // A refactor that moves apps/ elsewhere, or a change to the registerApp
    // call shape, would otherwise make this suite pass by checking nothing.
    expect(APPS.length).toBeGreaterThan(20);
  });

  test("every descriptor states duplicable and singleton", () => {
    // Required, not optional-with-a-default: a default that is right for
    // twenty-four applications and wrong for one is the kind of thing nobody
    // finds. TypeScript enforces this for a literal; this catches a descriptor
    // built some other way, and names the file.
    const missing = APPS.filter((app) => app.duplicable === null || app.singleton === null).map(
      (app) => `${app.file}: ${app.id} states neither duplicable nor singleton`,
    );
    expect(missing).toEqual([]);
  });

  test("duplicable and singleton follow docBound unless a reason is written down", () => {
    const wrong: string[] = [];
    for (const app of APPS) {
      if (EXCEPTIONS[app.id]) continue;
      if (app.duplicable !== app.docBound) {
        wrong.push(
          `${app.file}: ${app.id}.duplicable is ${app.duplicable} but docBound is ${app.docBound} ` +
            `— change it, or add ${app.id} to EXCEPTIONS with a sentence saying why`,
        );
      }
      if (app.singleton !== !app.docBound) {
        wrong.push(
          `${app.file}: ${app.id}.singleton is ${app.singleton} but docBound is ${app.docBound} ` +
            `— change it, or add ${app.id} to EXCEPTIONS with a sentence saying why`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  test("every exception still names an application that exists", () => {
    // An exception that outlives its application is how a rule quietly stops
    // applying to whatever moves in under the same id.
    const ids = new Set(APPS.map((app) => app.id));
    expect(Object.keys(EXCEPTIONS).filter((id) => !ids.has(id))).toEqual([]);
  });

  test("the four document-bound applications are exactly the duplicable ones", () => {
    // Stated separately from the rule above because it is the sentence a
    // reviewer can check against the product: chart, table, pipeline and
    // encoding are views OF one composition, and a second view of a second
    // document is the entire point.
    expect(
      APPS.filter((app) => app.duplicable)
        .map((app) => app.id)
        .sort(),
    ).toEqual(["chart", "encode", "pipeline", "table"]);
  });
});
