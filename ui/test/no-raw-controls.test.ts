import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Hand-written form controls, forbidden outside the atoms that own them.
 *
 * DATADROP-6 removed 42 `<button>`, 9 `<select>` and 12 `<input>` elements, and
 * six copies of one style object that had already drifted — three call sites at
 * 9.5px and three at 10.5px, a divergence nobody chose (guide §7.2). This test
 * is what stops the forty-third.
 *
 * It is a change detector, and change detectors earn their keep only when the
 * thing they detect is a decision rather than a detail. Here it is a decision: a
 * raw `<button>` outside `atoms/` means either the author did not know `Button`
 * exists — which the failure fixes by naming it — or `Button` is missing a
 * variant, which is a design conversation this forces to happen rather than
 * letting a seventh private copy settle it.
 */

const SRC = resolve(import.meta.dir, "../src");

interface Rule {
  pattern: RegExp;
  use: string;
}

const RULES: Rule[] = [
  { pattern: /<button\b/, use: "Button or IconButton from components/atoms" },
  { pattern: /<select\b/, use: "SelectInput from components/atoms" },
  { pattern: /<input\b/, use: "TextInput or CheckboxRow from components/atoms" },
  {
    pattern: /const \w+: (React\.)?CSSProperties/,
    use: "a CSS module beside the component",
  },
];

/**
 * Where a raw element is legitimate, and why. Every entry is a sentence someone
 * had to write, which is the point: an escape hatch that costs a sentence is one
 * people use honestly.
 */
const ALLOWED: Array<{ prefix: string; because: string }> = [
  {
    prefix: "components/atoms/",
    because: "the atoms ARE the wrappers — this is where the raw elements live",
  },
  {
    prefix: "components/molecules/FileDropZone/",
    because:
      "holds the only <input type=file> in the tree; it is hidden and out of the " +
      "tab order, with the Button in front of it as the tab stop",
  },
  {
    prefix: "components/molecules/InlineRename/",
    because:
      "uncontrolled by design: the value is read once on Enter and never tracked, " +
      "so Escape means 'there was never an edit' rather than 'restore the old value'",
  },
  {
    prefix: "components/organisms/TransportBar/",
    because:
      "an <input type=range> scrubber. The design system has no range atom and " +
      "should not grow one for a single caller; the native element brings slider " +
      "semantics, arrow-key stepping and Home/End that a hand-rolled replacement " +
      "would have to reimplement and usually gets two of three right. If a second " +
      "transport appears, this becomes a RangeInput atom and this entry goes",
  },
  {
    prefix: "components/organisms/SplitView/",
    because:
      "a <button role=separator> resize handle carrying aria-orientation and " +
      "aria-valuenow — giving it Button's appearance would be actively wrong",
  },
  {
    prefix: "pbui/",
    because:
      "menu items are <button role=menuitem> with their own module, AND pbui may " +
      "not import atoms at all under the layer graph, so the atom is unavailable here",
  },
];

/**
 * Strip comments before matching.
 *
 * Without this the test fails on its own subject matter: `Tile.tsx` carries the
 * sentence "now a thin wrapper over IconButton rather than its own `<button>`",
 * which is exactly the kind of comment this ticket wants people to write. A
 * lint that punishes documentation gets deleted.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    // Stories may render raw markup to illustrate a point — the ScopeChip story
    // shows the "before" rendering on purpose.
    else if (/\.tsx?$/.test(path) && !path.endsWith(".stories.tsx")) out.push(path);
  }
  return out;
}

const FILES = walk(SRC);

function allowedFor(rel: string): boolean {
  return ALLOWED.some((entry) => rel.startsWith(entry.prefix));
}

describe("form controls come from the design system", () => {
  test("there are files to check", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  test("no hand-written controls outside the atoms that own them", () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const rel = relative(SRC, file);
      if (allowedFor(rel)) continue;

      const lines = code(readFileSync(file, "utf8")).split("\n");
      for (const rule of RULES) {
        const line = lines.findIndex((text) => rule.pattern.test(text));
        if (line === -1) continue;
        violations.push(`${rel}:${line + 1} — use ${rule.use}`);
      }
    }

    expect(violations).toEqual([]);
  });

  test("every allowlist entry still matches something", () => {
    // An allowlist that outlives its reason is how a rule quietly stops
    // applying. If a component is deleted or renamed, its exemption should fail
    // rather than sit there widening the rule for whatever moves in next.
    const stale = ALLOWED.filter(
      (entry) => !FILES.some((file) => relative(SRC, file).startsWith(entry.prefix)),
    ).map((entry) => entry.prefix);
    expect(stale).toEqual([]);
  });
});
