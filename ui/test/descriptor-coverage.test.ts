import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { descriptorFor } from "../src/pbui/registry";
import type { PresentationType } from "../src/pbui/types";

const SRC = join(import.meta.dir, "..", "src");

/**
 * Two guards over the presentation vocabulary, both written because the
 * DATADROP-11 break sweep showed nothing covered them.
 *
 * ## Why this exists
 *
 * DATADROP-4 declared `tile` and `workspace` as presentation types, wrapped
 * real objects in `<Presentation ptype="tile">`, and shipped no descriptors for
 * either. Right-clicking a tile said "no verbs for this object yet" for two
 * tickets, and the workspace strip advertised a duplicate/delete feature that
 * did not exist. DATADROP-8 repaired it.
 *
 * Nothing prevented a recurrence. Deleting a descriptor from the registry
 * changed no test result at all — verified by doing it — so the same defect
 * could be reintroduced by a one-line edit and reach review looking clean.
 *
 * The second guard closes a hole in `tokens-used.test.ts`. That test scans
 * stylesheets for `var(--pbui-…)`, which is where almost every token reference
 * lives — but a descriptor's `tone` is a token reference written in TypeScript,
 * and deleting the token it names failed nothing.
 */

/** Every type in the `PresentationType` union, read from the source. */
function declaredTypes(): string[] {
  const source = readFileSync(join(SRC, "pbui", "types.ts"), "utf8");
  const start = source.indexOf("export type PresentationType =");
  expect(start, "the PresentationType union moved — this test cannot find it").toBeGreaterThan(-1);
  const end = source.indexOf(";", start);
  const body = source.slice(start, end);
  return [...body.matchAll(/\|\s*"([a-zA-Z]+)"/g)].map((m) => m[1] as string);
}

/** Every `--pbui-x:` declared anywhere under src/styles. */
function declaredTokens(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...walk(path));
      else if (path.endsWith(".css")) out.push(path);
    }
    return out;
  };
  for (const file of walk(join(SRC, "styles"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(--pbui-[\w-]+)\s*:/g)) names.add(match[1] as string);
  }
  return names;
}

/**
 * Types that are legitimately declared without a descriptor, and why.
 *
 * Every entry costs a sentence. That is the point: an author who cannot write
 * the sentence has discovered they do not have a reason.
 */
const WITHOUT_DESCRIPTOR: Array<{ ptype: string; because: string }> = [
  {
    ptype: "channel",
    because:
      "a channel is addressed through the field mapped into it — ChannelRow presents " +
      "the <field>, never the channel itself, so no menu ever asks for these verbs",
  },
  {
    ptype: "chart",
    because:
      "the chart AS an object is the document that owns it; <doc> carries every verb " +
      "a chart has, and a second type would duplicate that menu",
  },
];

const TYPES = declaredTypes();
const TOKENS = declaredTokens();

describe("the presentation vocabulary is not a wish list", () => {
  test("there are types to check", () => {
    expect(TYPES.length).toBeGreaterThan(10);
  });

  test("every declared presentation type has a descriptor, or a written reason", () => {
    const exempt = new Set(WITHOUT_DESCRIPTOR.map((e) => e.ptype));
    const orphans = TYPES.filter(
      (ptype) => !exempt.has(ptype) && descriptorFor(ptype as PresentationType) === null,
    );

    expect(
      orphans,
      "these are declared in the PresentationType union with no descriptor behind them.\n" +
        'Right-clicking one produces "no verbs for this object yet" — the defect DATADROP-4\n' +
        "left and DATADROP-8 repaired. Add a descriptor under src/pbui/descriptors/, or add\n" +
        "an entry to WITHOUT_DESCRIPTOR in this file stating why the type needs none.\n" +
        orphans.join(", "),
    ).toEqual([]);
  });

  test("every exemption still names a real type", () => {
    const unknown = WITHOUT_DESCRIPTOR.filter((e) => !TYPES.includes(e.ptype)).map((e) => e.ptype);

    expect(
      unknown,
      "these exemptions name types that no longer exist — delete them:\n" + unknown.join(", "),
    ).toEqual([]);
  });

  test("every exemption is still exempt — a type that grew a descriptor loses its entry", () => {
    const redundant = WITHOUT_DESCRIPTOR.filter(
      (e) => TYPES.includes(e.ptype) && descriptorFor(e.ptype as PresentationType) !== null,
    ).map((e) => e.ptype);

    expect(
      redundant,
      "these have descriptors now, so their exemptions are stale — delete them:\n" +
        redundant.join(", "),
    ).toEqual([]);
  });

  test("every descriptor's tone names a declared token", () => {
    // The hole this closes: tokens-used.test.ts scans stylesheets, and a tone is
    // a token reference written in TypeScript. Deleting --pbui-tone-traceEntry
    // failed nothing before this test existed.
    const offenders: string[] = [];
    for (const ptype of TYPES) {
      const descriptor = descriptorFor(ptype as PresentationType);
      if (!descriptor) continue;
      for (const match of String(descriptor.tone).matchAll(/var\((--pbui-[\w-]+)\)/g)) {
        const name = match[1] as string;
        if (!TOKENS.has(name))
          offenders.push(`${ptype}: tone names ${name}, which is not declared`);
      }
    }

    expect(
      offenders,
      "a descriptor's tone names a token that src/styles does not declare, so the\n" +
        "presentation renders with no colour and nothing says so:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
