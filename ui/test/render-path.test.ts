import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readings } from "../src/fixtures";
import { evaluate, schemaAfter } from "../src/model/pipeline";
import type { Step } from "../src/model/pipeline";
import type { Table } from "../src/model/table";

/**
 * The render path stays off the rows.
 *
 * `FieldChip` calls `resolveField` during render, and a table header draws one
 * chip per column of pipeline output — thirteen for the `readings` fixture,
 * unbounded in general. Before DATADROP-6 phase 1 that resolution went through
 * `tableFor`, which evaluates the whole pipeline, so every field chip on screen
 * evaluated it again on every frame.
 *
 * Two guards, because they fail for different reasons:
 *
 *  - a **cost** guard, which fails if the schema path starts touching rows;
 *  - a **structural** guard, which fails if anything under `components/`
 *    reaches for `tableFor` at all.
 *
 * The structural one is the stronger of the two. The cost guard only notices a
 * regression once it is slow enough to measure; the structural one fails on the
 * import.
 */

const SRC = resolve(import.meta.dir, "../src");

/** The fixture repeated to a row budget, as a live workbench would hold it. */
function grow(to: number): Table {
  const rows: Table["rows"] = [];
  while (rows.length < to) rows.push(...readings.rows);
  return { ...readings, rows: rows.slice(0, to), row_count: to };
}

const STEPS: Step[] = [
  { id: "f", kind: "filter", on: true, field: "data.temp_c", op: ">", value: "18" },
  { id: "s", kind: "sort", on: true, field: "data.temp_c", dir: "desc" },
];

/** One per column, which is what a table header costs. */
const CHIPS = readings.fields.length;

function timeSchema(rows: number): number {
  const table = grow(rows);
  // Warm up, so the figure is not measuring JIT compilation.
  for (let i = 0; i < 3; i++) schemaAfter(table, STEPS);
  const started = performance.now();
  for (let i = 0; i < CHIPS; i++) schemaAfter(table, STEPS);
  return performance.now() - started;
}

describe("the render path is independent of the row budget", () => {
  /*
   * An absolute bound rather than a ratio against `evaluate`.
   *
   * A ratio is the more informative number and the more flaky assertion: it
   * fails when the machine is loaded rather than when the code is wrong. 5 ms
   * for thirteen calls at the largest budget the workbench offers is roughly
   * two hundred times the measured cost, so this passes on a busy laptop and
   * fails immediately if the schema path acquires row work.
   */
  const BUDGET_MS = 5;

  test("13 schema resolutions at 50 000 rows cost almost nothing", () => {
    const ms = timeSchema(50_000);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test("the cost does not grow with rows", () => {
    const small = timeSchema(2_000);
    const large = timeSchema(50_000);
    // Twenty-five times the rows. Anything proportional would be ~25x; the
    // generous factor here is headroom for timer noise at sub-millisecond
    // durations, not for a linear scan.
    expect(large).toBeLessThan(Math.max(small * 5, BUDGET_MS));
  });

  test("evaluating the same thing really is orders of magnitude worse", () => {
    // Guards the premise rather than the fix: if `evaluate` ever became cheap,
    // this whole split would be unnecessary and this test should be deleted.
    const table = grow(50_000);
    for (let i = 0; i < 3; i++) evaluate(table, STEPS);
    const started = performance.now();
    for (let i = 0; i < CHIPS; i++) evaluate(table, STEPS);
    const evaluated = performance.now() - started;
    expect(evaluated).toBeGreaterThan(timeSchema(50_000) * 50);
  });
});

/* ------------------------------------------------------- the hard guard -- */

/**
 * Where `tableFor` is legitimate under `components/`, and why.
 *
 * One entry, and it is the place the lookup is *supposed* to enter: the shell
 * builds the environment and hands both resolvers to `environmentFor`. Every
 * other component receives an already-built environment and must reach for
 * `fieldsFor`.
 */
const ALLOWED: Array<{ prefix: string; because: string }> = [
  {
    prefix: "components/pages/Workbench/WorkbenchProviders.tsx",
    because:
      "builds the PbuiEnvironment and hands both resolvers to environmentFor — " +
      "this is where the table lookup is supposed to enter the component tree",
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    // Stories are exempt for the reason layers.test.ts states: a story is a
    // review surface, not shipped code, and it composes whatever demonstrates
    // the component.
    else if (/\.tsx?$/.test(path) && !path.endsWith(".stories.tsx")) out.push(path);
  }
  return out;
}

describe("nothing under components/ evaluates the pipeline", () => {
  test("tableFor is not referenced outside the allow-list", () => {
    const offenders: string[] = [];

    for (const path of sourceFiles(join(SRC, "components"))) {
      const rel = relative(SRC, path);
      if (ALLOWED.some((entry) => rel.startsWith(entry.prefix))) continue;

      const text = readFileSync(path, "utf8");
      text.split("\n").forEach((line, index) => {
        // Skip comments: the rule is about calls, and several docstrings name
        // the function precisely to explain why they must not call it.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/\btableFor\b/.test(code)) offenders.push(`${rel}:${index + 1}  ${line.trim()}`);
      });
    }

    expect(
      offenders,
      `these reach for tableFor, which evaluates the whole pipeline.\n` +
        `Use fieldsFor — it is O(steps) and safe in a render body (DR-40).\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
