import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Every `var(--pbui-…)` names a token that exists.
 *
 * **A mistyped custom property fails silently and completely.** An undefined
 * variable makes the whole declaration invalid, so `border: var(--pbui-border-heavy)`
 * — the token is `--pbui-border-firm` — renders no border at all. TypeScript
 * cannot see inside a CSS module, the bundler does not resolve custom
 * properties, and nothing in the tree noticed. It is invisible everywhere
 * except in a browser, and then only if you happen to know what the element
 * was supposed to look like.
 *
 * This ticket produced three of them in six phases (`--pbui-border-heavy`,
 * `--pbui-selected-wash`, `--pbui-wash`), each caught by hand while
 * double-checking something else. Two were real typos and one was a token that
 * should exist and now does — which is the useful outcome: the failure names
 * the choice between "you meant an existing token" and "you have found a gap in
 * the palette", and both are worth a moment's thought.
 *
 * A fallback (`var(--x, 4px)`) is still checked. A fallback that silently
 * covers for a name nobody defined is the same defect with a nicer failure
 * mode, and the two-argument form should be reserved for genuinely optional
 * values.
 */

const SRC = resolve(import.meta.dir, "../src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".css")) out.push(path);
  }
  return out;
}

/** Every `--pbui-x:` declared anywhere under src/styles. */
function declared(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(join(SRC, "styles"))) {
    const source = readFileSync(file, "utf8");
    const pattern = /(--pbui-[\w-]+)\s*:/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) names.add(match[1] as string);
  }
  return names;
}

/** Every `var(--pbui-x…)` reference, with the file it is in. */
function references(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    const pattern = /var\(\s*(--pbui-[\w-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      out.push([match[1] as string, relative(SRC, file)]);
    }
  }
  return out;
}

const DECLARED = declared();
const REFERENCES = references();

describe("design tokens resolve", () => {
  test("there are tokens and references to check", () => {
    expect(DECLARED.size).toBeGreaterThan(30);
    expect(REFERENCES.length).toBeGreaterThan(100);
  });

  test("every var(--pbui-…) in a stylesheet names a declared token", () => {
    const unknown = [
      ...new Set(
        REFERENCES.filter(([name]) => !DECLARED.has(name)).map(
          ([name, file]) => `${file}: var(${name})`,
        ),
      ),
    ].sort();
    expect(unknown).toEqual([]);
  });

  test("no component invents a token of its own", () => {
    // A component may RE-POINT an existing token for its subtree — that is a
    // real technique and `Surface`'s `.inverted` depends on it, re-pointing
    // --pbui-ink, --pbui-faint and --pbui-line so nothing below has to know
    // which kind of surface it is sitting on.
    //
    // What it may not do is DECLARE a name the palette has never heard of.
    // That is how a palette grows a second opinion about --pbui-ok: the name
    // resolves, the component looks right, and the value is nowhere near the
    // one every other component uses. The first version of this test forbade
    // re-pointing too and immediately failed on the one place doing it
    // correctly, which is the useful kind of wrong.
    const invented: string[] = [];
    for (const file of walk(SRC)) {
      if (file.startsWith(join(SRC, "styles"))) continue;
      const source = readFileSync(file, "utf8");
      // A declaration is `--pbui-x: value`; a reference inside var() is not.
      const pattern = /^\s*(--pbui-[\w-]+)\s*:/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const name = match[1] as string;
        if (!DECLARED.has(name)) invented.push(`${relative(SRC, file)}: ${name}`);
      }
    }
    expect(invented).toEqual([]);
  });
});
