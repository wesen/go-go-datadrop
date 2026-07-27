import { describe, expect, test } from "bun:test";
import type { ChartSpec } from "../src/model/chart";
import { buildPlot } from "../src/model/plot";
import type { Mark } from "../src/model/plot";
import type { Field, Table } from "../src/model/table";

/**
 * Reference lines, asserted as coordinates.
 *
 * A chart with wrong scales looks like a chart, so "a rule was produced" is not
 * a test — it passes for every wrong answer that produces a rule. These assert
 * where the line actually lands, against positions worked out from the domain
 * by hand.
 *
 * The two behaviours worth the most care are both about *not hiding* things:
 * a reference outside the data's range must still be visible (a target above
 * every observation is the most interesting case there is), and one that cannot
 * be drawn at all must be reported rather than dropped.
 */

function field(name: string, type: "q" | "n" | "t"): Field {
  return { name, type, inferred_from: "values" };
}

function tableOf(fields: Field[], rows: Record<string, unknown>[]): Table {
  return {
    source: { kind: "dataset", drop: "lab" },
    fields,
    rows,
    row_count: rows.length,
    truncated: false,
    strategy: "head",
  };
}

const spec = (over: Partial<ChartSpec>): ChartSpec => ({
  source: { kind: "dataset", drop: "lab" },
  steps: [],
  geom: "point",
  mapping: { x: null, y: null, color: null, size: null, facet: null },
  yScale: "linear",
  ...over,
});

/** y from 0 to 100, x from 0 to 10 — round numbers so positions are checkable. */
const TABLE = tableOf(
  [field("x", "q"), field("y", "q")],
  [
    { x: 0, y: 0 },
    { x: 5, y: 50 },
    { x: 10, y: 100 },
  ],
);

const rules = (marks: Mark[]) =>
  marks.filter((m): m is Extract<Mark, { kind: "rule" }> => m.kind === "rule");

describe("reference lines land where the constant is", () => {
  test("a y reference at the midpoint sits at the same y as the midpoint row", () => {
    const plot = buildPlot(
      TABLE,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: null },
        references: [{ on: "y", value: 50 }],
      }),
      600,
      400,
    );

    const panel = plot.panels[0];
    expect(panel, "the plot refused to draw: " + plot.problems.join("; ")).toBeDefined();

    const rule = rules(panel!.marks)[0];
    expect(rule).toBeDefined();

    // The row at y = 50 is the middle of a 0..100 domain, so both land together.
    const midRow = panel!.marks.find((m) => m.kind === "circle" && m.row.y === 50);
    expect(midRow).toBeDefined();
    expect(rule!.y1).toBeCloseTo((midRow as { y: number }).y, 6);
    expect(rule!.y1).toBeCloseTo(rule!.y2, 6); // horizontal
  });

  test('on: "x" draws a VERTICAL line — it is a constant in x, perpendicular to the x axis', () => {
    const plot = buildPlot(
      TABLE,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: null },
        references: [{ on: "x", value: 5 }],
      }),
      600,
      400,
    );

    const rule = rules(plot.panels[0]!.marks)[0];
    expect(rule).toBeDefined();
    expect(rule!.x1).toBeCloseTo(rule!.x2, 6); // vertical, not horizontal
    expect(rule!.y1).not.toBeCloseTo(rule!.y2, 6);
  });

  test("the rule is emitted before the data marks, so points draw on top of it", () => {
    const plot = buildPlot(
      TABLE,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: null },
        references: [{ on: "y", value: 50 }],
      }),
      600,
      400,
    );

    const marks = plot.panels[0]!.marks;
    const firstCircle = marks.findIndex((m) => m.kind === "circle");
    const firstRule = marks.findIndex((m) => m.kind === "rule");
    expect(firstRule).toBeLessThan(firstCircle);
  });
});

describe("a reference outside the data is kept, not hidden", () => {
  test("the y domain stretches to include a target above every observation", () => {
    const without = buildPlot(
      TABLE,
      spec({ mapping: { x: "x", y: "y", color: null, size: null, facet: null } }),
      600,
      400,
    );
    const withRef = buildPlot(
      TABLE,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: null },
        references: [{ on: "y", value: 200, intent: "target" }],
      }),
      600,
      400,
    );

    // With the domain stretched to 200, the row at y = 100 must sit LOWER in
    // the panel (a larger y in screen coordinates) than it did before.
    const rowY = (p: typeof without) =>
      (p.panels[0]!.marks.find((m) => m.kind === "circle" && m.row.y === 100) as { y: number }).y;

    expect(rowY(withRef)).toBeGreaterThan(rowY(without));
  });

  test("a target inside the stretched domain is not marked clipped", () => {
    const plot = buildPlot(
      TABLE,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: null },
        references: [{ on: "y", value: 200, intent: "target" }],
      }),
      600,
      400,
    );
    expect(rules(plot.panels[0]!.marks)[0]!.clipped).toBe(false);
  });

  test("a reference the axis cannot place is REPORTED, never silently dropped", () => {
    // A banded (nominal) x axis has no numeric position for a constant.
    const banded = tableOf(
      [field("station", "n"), field("y", "q")],
      [
        { station: "north", y: 10 },
        { station: "south", y: 20 },
      ],
    );

    const plot = buildPlot(
      banded,
      spec({
        geom: "bar",
        mapping: { x: "station", y: "y", color: null, size: null, facet: null },
        references: [{ on: "x", value: 5 }],
      }),
      600,
      400,
    );

    // A notice, NOT a problem: problems mean "nothing was drawn" and would make
    // ChartPanel hide the chart that did draw.
    expect(plot.problems).toEqual([]);
    expect(
      plot.notices.some((n) => n.includes("reference line on x")),
      "an undrawable reference produced no notice — the caller asked for a line, did not get one, and was not told",
    ).toBe(true);
  });
});

describe("references survive the things a pixel constant would not", () => {
  test("the same constant tracks the panel through a resize", () => {
    const at = (w: number, h: number) => {
      const plot = buildPlot(
        TABLE,
        spec({
          mapping: { x: "x", y: "y", color: null, size: null, facet: null },
          references: [{ on: "y", value: 50 }],
        }),
        w,
        h,
      );
      const panel = plot.panels[0]!;
      const rule = rules(panel.marks)[0]!;
      // Position as a FRACTION of panel height: the constant is the same fact
      // at both sizes, so this must not move.
      return rule.y1 / panel.h;
    };

    expect(at(600, 400)).toBeCloseTo(at(1200, 800), 6);
  });

  test("every facet gets its own copy of the rule", () => {
    const faceted = tableOf(
      [field("x", "q"), field("y", "q"), field("g", "n")],
      [
        { x: 0, y: 0, g: "a" },
        { x: 10, y: 100, g: "a" },
        { x: 0, y: 0, g: "b" },
        { x: 10, y: 100, g: "b" },
      ],
    );

    const plot = buildPlot(
      faceted,
      spec({
        mapping: { x: "x", y: "y", color: null, size: null, facet: "g" },
        references: [{ on: "y", value: 50 }],
      }),
      800,
      400,
    );

    expect(plot.panels.length).toBe(2);
    for (const panel of plot.panels) {
      expect(rules(panel.marks).length, "a facet is missing its reference line").toBe(1);
    }
  });
});
