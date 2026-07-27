import { describe, expect, test } from "bun:test";
import { chooseStep, formatInstant, timeTicks, toInstant } from "../src/model/time";
import { buildPlot } from "../src/model/plot";
import type { ChartSpec } from "../src/model/chart";
import type { Field, Table } from "../src/model/table";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("toInstant", () => {
  test("parses the canonical timestamp format", () => {
    expect(toInstant("2026-07-24T15:04:05.100Z")).toBe(Date.UTC(2026, 6, 24, 15, 4, 5, 100));
  });

  test("passes a number through and rejects anything else", () => {
    expect(toInstant(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(Number.isNaN(toInstant("not a time"))).toBe(true);
    expect(Number.isNaN(toInstant(null))).toBe(true);
  });
});

describe("chooseStep", () => {
  // The ladder is round units of time, not round numbers of milliseconds.
  test("picks the smallest ladder step that keeps the tick count down", () => {
    expect(chooseStep(10 * MINUTE, 5)).toBe(5 * MINUTE);
    expect(chooseStep(2 * HOUR, 4)).toBe(30 * MINUTE);
    expect(chooseStep(7 * DAY, 7)).toBe(DAY);
    expect(chooseStep(4 * SECOND, 4)).toBe(SECOND);
  });
});

describe("timeTicks", () => {
  test("lands on round units and labels at the right granularity", () => {
    const lo = Date.UTC(2026, 6, 24, 14, 3, 0);
    const hi = Date.UTC(2026, 6, 24, 15, 2, 0);
    const ticks = timeTicks(lo, hi, 5);

    expect(ticks.length).toBeGreaterThan(1);
    // A one-hour span with five ticks selects the 15-minute step, so every tick
    // is on a quarter hour.
    for (const tick of ticks) {
      expect(tick.at % (15 * MINUTE)).toBe(0);
      expect(tick.label).toMatch(/^\d{2}:\d{2}$/);
    }
    expect(ticks[0]!.at).toBeGreaterThanOrEqual(lo);
    expect(ticks[ticks.length - 1]!.at).toBeLessThanOrEqual(hi);
  });

  test("a degenerate domain yields one tick", () => {
    const at = Date.UTC(2026, 6, 24);
    expect(timeTicks(at, at, 5)).toHaveLength(1);
  });
});

describe("formatInstant", () => {
  const at = Date.UTC(2026, 6, 24, 15, 4, 5);

  test("drops what the step makes redundant", () => {
    expect(formatInstant(at, SECOND)).toBe("15:04:05");
    expect(formatInstant(at, MINUTE)).toBe("15:04");
    expect(formatInstant(at, DAY)).toBe("Jul 24");
    expect(formatInstant(at, 28 * DAY)).toBe("Jul 2026");
    expect(formatInstant(at, 365 * DAY)).toBe("2026");
  });
});

function timeseries(count: number): Table {
  const fields: Field[] = [
    { name: "time", type: "t", inferred_from: "envelope" },
    { name: "v", type: "q", inferred_from: "values" },
  ];
  const rows = Array.from({ length: count }, (_, i) => ({
    time: new Date(Date.UTC(2026, 6, 24, 14, 0, 0) + i * MINUTE).toISOString(),
    v: i,
  }));
  return {
    source: { kind: "stream", drop: "lab", stream: "temps" },
    fields,
    rows,
    row_count: count,
    truncated: false,
    strategy: "latest",
  };
}

const spec = (over: Partial<ChartSpec>): ChartSpec => ({
  source: { kind: "stream", drop: "lab" },
  steps: [],
  geom: "line",
  mapping: { x: "time", y: "v", color: null, size: null, facet: null },
  yScale: "linear",
  ...over,
});

describe("a temporal x is continuous, not banded", () => {
  test("120 timestamps produce a handful of ticks, not 120 slots", () => {
    const plot = buildPlot(timeseries(120), spec({}), 720, 380);
    expect(plot.problems).toHaveLength(0);
    expect(plot.xTicks.length).toBeLessThan(12);
    // Time labels, not ISO strings.
    for (const tick of plot.xTicks) {
      expect(tick.label).not.toContain("T");
      expect(tick.label).not.toContain("Z");
    }
  });

  test("uneven spacing is drawn unevenly", () => {
    // Three readings at 0, 1 and 60 minutes. A band scale would place them at
    // equal distances; a real time scale must not.
    const base = Date.UTC(2026, 6, 24, 14, 0, 0);
    const table = timeseries(0);
    table.rows = [0, 1, 60].map((m, i) => ({
      time: new Date(base + m * MINUTE).toISOString(),
      v: i,
    }));
    table.row_count = 3;

    const plot = buildPlot(table, spec({ geom: "point" }), 720, 380);
    const xs = (plot.panels[0]!.marks.filter((m) => m.kind === "circle") as { x: number }[])
      .map((m) => m.x)
      .sort((a, b) => a - b);

    const firstGap = xs[1]! - xs[0]!;
    const secondGap = xs[2]! - xs[1]!;
    // The second interval is 59 times the first; anything near 1 means a band.
    expect(secondGap / firstGap).toBeGreaterThan(50);
  });

  test("a bar keeps the band, because a bar needs a slot to have a width", () => {
    const plot = buildPlot(timeseries(4), spec({ geom: "bar" }), 720, 380);
    expect(plot.problems).toHaveLength(0);
    expect(plot.panels[0]!.marks.filter((m) => m.kind === "rect")).toHaveLength(4);
  });

  test("a banded time axis still sorts chronologically, not lexically", () => {
    // "2026-07-24T09:00" sorts after "2026-07-24T10:00" lexically only if the
    // hour is not zero-padded; use a year boundary, where lexical and
    // chronological genuinely differ once the strings are trimmed.
    const table = timeseries(0);
    table.rows = [
      { time: "2026-12-31T23:00:00.000Z", v: 1 },
      { time: "2026-01-01T00:00:00.000Z", v: 2 },
    ];
    table.row_count = 2;
    const plot = buildPlot(table, spec({ geom: "bar" }), 720, 380);
    const rects = plot.panels[0]!.marks.filter((m) => m.kind === "rect") as {
      x: number;
      row: Record<string, unknown>;
    }[];
    const january = rects.find((r) => String(r.row.time).startsWith("2026-01"))!;
    const december = rects.find((r) => String(r.row.time).startsWith("2026-12"))!;
    expect(january.x).toBeLessThan(december.x);
  });
});

describe("sub-second spans", () => {
  // A high-frequency stream produces windows shorter than a second, and the
  // ladder used to bottom out at SECOND — so any such window got exactly one
  // tick and an axis with a single label says nothing about its own extent.
  // Found by charting 120 events that a seeding loop pushed in 825 ms.
  test("a sub-second span gets several ticks, not one", () => {
    const ticks = timeTicks(0, 825, 6);
    expect(ticks.length).toBeGreaterThan(2);
  });

  test("sub-second labels carry milliseconds, so they differ from each other", () => {
    const labels = timeTicks(0, 900, 6).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toMatch(/^\d{2}:\d{2}\.\d{3}$/);
  });

  test("a second or more still labels without milliseconds", () => {
    // The extra precision must not leak upward: a five-minute axis reading
    // "09:00.000" would be worse than the problem it fixes.
    const labels = timeTicks(
      Date.parse("2026-07-24T09:00:00Z"),
      Date.parse("2026-07-24T12:00:00Z"),
      6,
    ).map((t) => t.label);
    for (const label of labels) expect(label).not.toContain(".");
  });
});
