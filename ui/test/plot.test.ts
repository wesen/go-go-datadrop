import { describe, expect, test } from "bun:test";
import { defaultChart } from "../src/model/chart";
import type { ChartSpec } from "../src/model/chart";
import { buildPlot, lerpHex, niceTicks } from "../src/model/plot";
import type { Field, Table } from "../src/model/table";

function field(name: string, type: Field["type"]): Field {
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

describe("niceTicks", () => {
  // Golden values worked out by hand from the 1/2/5/10 rule, not copied from
  // the implementation's output.
  test("rounds the step to 1, 2, 5 or 10 times a power of ten", () => {
    expect(niceTicks(0, 97, 5)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6000000000, 0.8, 1]);
    expect(niceTicks(3, 7, 2)).toEqual([4, 6]);
  });

  test("a degenerate domain yields a single tick", () => {
    expect(niceTicks(5, 5, 5)).toEqual([5]);
    expect(niceTicks(9, 2, 5)).toEqual([9]);
  });
});

describe("lerpHex", () => {
  test("interpolates channel by channel", () => {
    expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    // 255 * 0.5 = 127.5, which rounds to 128 = 0x80.
    expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("refusals", () => {
  const t = tableOf(
    [field("category", "n"), field("value", "q")],
    [
      { category: "a", value: 1 },
      { category: "b", value: 2 },
    ],
  );

  test("an unmapped channel names what to do", () => {
    const plot = buildPlot(t, spec({}), 600, 300);
    expect(plot.problems).toContain("map x to a field");
    expect(plot.problems).toContain("map y to a field");
    expect(plot.panels).toHaveLength(0);
  });

  test("a bar on a quantitative x is refused with advice", () => {
    const plot = buildPlot(
      tableOf(
        [field("a", "q"), field("b", "q")],
        [
          { a: 1, b: 2 },
          { a: 2, b: 3 },
        ],
      ),
      spec({ geom: "bar", mapping: { x: "a", y: "b", color: null, size: null, facet: null } }),
      600,
      300,
    );
    expect(plot.problems.join(" ")).toContain("bar wants a nominal or temporal x");
  });

  test("a non-quantitative y is refused", () => {
    const plot = buildPlot(
      t,
      spec({ mapping: { x: "value", y: "category", color: null, size: null, facet: null } }),
      600,
      300,
    );
    expect(plot.problems.join(" ")).toContain("y must be quantitative");
  });

  test("an over-strict filter is named as the cause of an empty chart", () => {
    const plot = buildPlot(
      t,
      spec({
        mapping: { x: "category", y: "value", color: null, size: null, facet: null },
        steps: [{ id: "s", kind: "filter", on: true, field: "value", op: ">", value: "999" }],
      }),
      600,
      300,
    );
    expect(plot.problems.join(" ")).toContain("filter step is too strict");
  });
});

describe("geometry", () => {
  const t = tableOf(
    [field("x", "q"), field("y", "q"), field("g", "n")],
    [
      { x: 0, y: 0, g: "a" },
      { x: 10, y: 10, g: "a" },
      { x: 5, y: 5, g: "b" },
      { x: 15, y: 15, g: "b" },
    ],
  );

  test("point emits one circle per row", () => {
    const plot = buildPlot(
      t,
      spec({ mapping: { x: "x", y: "y", color: null, size: null, facet: null } }),
      600,
      300,
    );
    expect(plot.problems).toHaveLength(0);
    expect(plot.panels).toHaveLength(1);
    expect(plot.panels[0]!.marks.filter((m) => m.kind === "circle")).toHaveLength(4);
  });

  test("line groups by colour and sorts each group along x", () => {
    const unsorted = tableOf(
      [field("x", "q"), field("y", "q"), field("g", "n")],
      [
        { x: 10, y: 1, g: "a" },
        { x: 0, y: 2, g: "a" },
        { x: 5, y: 3, g: "a" },
      ],
    );
    const plot = buildPlot(
      unsorted,
      spec({ geom: "line", mapping: { x: "x", y: "y", color: "g", size: null, facet: null } }),
      600,
      300,
    );
    const paths = plot.panels[0]!.marks.filter((m) => m.kind === "path");
    expect(paths).toHaveLength(1);
    // Three vertices, and the first must be the lowest x — proving the sort
    // happened here rather than depending on the server's row order.
    const d = (paths[0] as { d: string }).d;
    const xs = [...d.matchAll(/[ML](-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test("a group of one point degrades to a circle rather than a path", () => {
    const single = tableOf(
      [field("x", "q"), field("y", "q"), field("g", "n")],
      [
        { x: 1, y: 1, g: "only" },
        { x: 2, y: 2, g: "pair" },
        { x: 3, y: 3, g: "pair" },
      ],
    );
    const plot = buildPlot(
      single,
      spec({ geom: "line", mapping: { x: "x", y: "y", color: "g", size: null, facet: null } }),
      600,
      300,
    );
    const paths = plot.panels[0]!.marks.filter((m) => m.kind === "path");
    expect(paths).toHaveLength(1); // "pair" only
  });

  test("bar measures from a zero baseline, so a negative value draws downward", () => {
    const signed = tableOf(
      [field("c", "n"), field("v", "q")],
      [
        { c: "up", v: 10 },
        { c: "down", v: -10 },
      ],
    );
    const plot = buildPlot(
      signed,
      spec({ geom: "bar", mapping: { x: "c", y: "v", color: null, size: null, facet: null } }),
      600,
      300,
    );
    const rects = plot.panels[0]!.marks.filter((m) => m.kind === "rect") as {
      y: number;
      h: number;
    }[];
    expect(rects).toHaveLength(2);
    // Both bars must share an edge: the baseline. One starts there and goes up,
    // the other starts there and goes down.
    const edges = rects.map((r) => [r.y, r.y + r.h]).flat();
    const shared = edges.filter((e, _, all) => all.filter((x) => Math.abs(x - e) < 1e-6).length > 1);
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("scales", () => {
  test("size is square-rooted, so area rather than radius tracks the value", () => {
    const t = tableOf(
      [field("x", "q"), field("y", "q"), field("s", "q")],
      [
        { x: 0, y: 0, s: 0 },
        { x: 1, y: 1, s: 1 },
      ],
    );
    const plot = buildPlot(
      t,
      spec({ mapping: { x: "x", y: "y", color: null, size: "s", facet: null } }),
      600,
      300,
    );
    const radii = (plot.panels[0]!.marks.filter((m) => m.kind === "circle") as { r: number }[]).map(
      (m) => m.r,
    );
    // base 3 at t = 0, and 3 + sqrt(1) * 8 = 11 at t = 1.
    expect(Math.min(...radii)).toBeCloseTo(3, 6);
    expect(Math.max(...radii)).toBeCloseTo(11, 6);
  });

  test("facets share one y domain", () => {
    const t = tableOf(
      [field("x", "q"), field("y", "q"), field("f", "n")],
      [
        { x: 1, y: 0, f: "left" },
        { x: 2, y: 1, f: "left" },
        { x: 1, y: 50, f: "right" },
        { x: 2, y: 100, f: "right" },
      ],
    );
    const plot = buildPlot(
      t,
      spec({ mapping: { x: "x", y: "y", color: null, size: null, facet: "f" } }),
      600,
      300,
    );
    expect(plot.panels).toHaveLength(2);
    // One tick list for both panels is the shared scale, made visible.
    expect(plot.yTicks.length).toBeGreaterThan(1);
    expect(plot.yTicks.some((tick) => Number(tick.label) >= 100)).toBe(true);
  });

  test("a log scale is ignored when the domain is not strictly positive", () => {
    const t = tableOf(
      [field("x", "q"), field("y", "q")],
      [
        { x: 1, y: 0 },
        { x: 2, y: 10 },
      ],
    );
    const linear = buildPlot(
      t,
      spec({ mapping: { x: "x", y: "y", color: null, size: null, facet: null } }),
      600,
      300,
    );
    const asLog = buildPlot(
      t,
      spec({ yScale: "log", mapping: { x: "x", y: "y", color: null, size: null, facet: null } }),
      600,
      300,
    );
    expect(asLog.yTicks).toEqual(linear.yTicks);
  });

  test("colour categories beyond the palette are pooled and counted", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ x: i, y: i, c: `cat-${i}` }));
    const plot = buildPlot(
      tableOf([field("x", "q"), field("y", "q"), field("c", "n")], rows),
      spec({ mapping: { x: "x", y: "y", color: "c", size: null, facet: null } }),
      600,
      300,
    );
    expect(plot.legend).toHaveLength(8);
    expect(plot.legendOverflow).toBe(4);
  });
});

describe("defaultChart", () => {
  test("prefers a temporal x and a line", () => {
    const t = tableOf(
      [field("time", "t"), field("v", "q"), { ...field("who", "n"), distinct: 2 }],
      [{ time: "2026-07-24T00:00:00Z", v: 1, who: "a" }],
    );
    const chart = defaultChart(t);
    expect(chart.mapping.x).toBe("time");
    expect(chart.mapping.y).toBe("v");
    expect(chart.mapping.color).toBe("who");
    expect(chart.geom).toBe("line");
  });

  test("prefers payload columns over envelope metadata", () => {
    const t = tableOf(
      [
        { name: "seq", type: "q", inferred_from: "envelope", distinct: 3 },
        { name: "id", type: "n", inferred_from: "envelope", distinct: 3 },
        { name: "time", type: "t", inferred_from: "envelope", distinct: 3 },
        { name: "data.temp_c", type: "q", inferred_from: "values", distinct: 3 },
        { name: "data.station", type: "n", inferred_from: "values", distinct: 2 },
      ],
      [{ seq: 1, id: "a", time: "2026-07-24T00:00:00Z", "data.temp_c": 21, "data.station": "n" }],
    );
    const chart = defaultChart(t);
    expect(chart.mapping.x).toBe("time");
    // Not "seq": a chart of the row number against time says nothing.
    expect(chart.mapping.y).toBe("data.temp_c");
    // Not "id": three distinct values here, but in a real stream it is one per
    // row, and the rule that rejects it is the same rule either way.
    expect(chart.mapping.color).toBe("data.station");
  });

  test("colours by a real dimension rather than a boolean flag", () => {
    // The rule used to prefer the FEWEST distinct values, which reads as
    // "keep the legend short" and turns out to mean "chart the flag": a
    // two-valued data.ok beat a four-station data.station, producing a chart
    // about a boolean instead of a chart about the sensors.
    const t = tableOf(
      [
        { name: "time", type: "t", inferred_from: "envelope", distinct: 4 },
        { name: "data.temp_c", type: "q", inferred_from: "values", distinct: 4 },
        { name: "data.ok", type: "n", inferred_from: "values", distinct: 2 },
        { name: "data.station", type: "n", inferred_from: "values", distinct: 4 },
      ],
      [{ time: "2026-07-24T00:00:00Z", "data.temp_c": 21, "data.ok": true, "data.station": "n" }],
    );
    expect(defaultChart(t).mapping.color).toBe("data.station");
  });

  test("never colours by an envelope column, however few its levels", () => {
    // Ranking payload first does not survive sorting by distinct count: the
    // sort reorders across the payload/envelope boundary. Here `stream` has
    // fewer levels than `data.station`, so a rank-only rule would pick the
    // delivery metadata. It has to be an exclusion, not a preference.
    const t = tableOf(
      [
        { name: "stream", type: "n", inferred_from: "envelope", distinct: 2 },
        { name: "time", type: "t", inferred_from: "envelope", distinct: 4 },
        { name: "data.temp_c", type: "q", inferred_from: "values", distinct: 4 },
        { name: "data.station", type: "n", inferred_from: "values", distinct: 4 },
      ],
      [{ stream: "temps", time: "2026-07-24T00:00:00Z", "data.temp_c": 21, "data.station": "n" }],
    );
    expect(defaultChart(t).mapping.color).toBe("data.station");
  });

  test("skips a colour field with too many categories to encode", () => {
    const t = tableOf(
      [
        { name: "data.v", type: "q", inferred_from: "values" },
        { name: "data.w", type: "q", inferred_from: "values" },
        { name: "data.uid", type: "n", inferred_from: "values", distinct: 400 },
      ],
      [{ "data.v": 1, "data.w": 2, "data.uid": "x" }],
    );
    expect(defaultChart(t).mapping.color).toBeNull();
  });

  test("falls back to two quantitative fields and a scatter", () => {
    const t = tableOf([field("a", "q"), field("b", "q")], [{ a: 1, b: 2 }]);
    const chart = defaultChart(t);
    expect(chart.mapping.x).toBe("a");
    expect(chart.mapping.y).toBe("b");
    expect(chart.geom).toBe("point");
  });
});
