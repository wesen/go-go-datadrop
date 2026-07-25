import { describe, expect, test } from "bun:test";
import { batches, census, readings } from "../src/fixtures";
import { defaultChart } from "../src/model/chart";
import { buildPlot } from "../src/model/plot";
import { evaluate } from "../src/model/pipeline";
import type { Table } from "../src/model/table";

/**
 * The fixtures have to be realistic, not merely plausible.
 *
 * A fixture that the real engine cannot chart is a fixture that makes every
 * story built on it a fiction — the component renders, the story passes, and
 * the same component fed a real table behaves differently. So each fixture is
 * put through the actual `defaultChart` → `evaluate` → `buildPlot` path here.
 */

const ALL: [string, Table][] = [
  ["readings", readings],
  ["census", census],
  ["batches", batches],
];

describe("every fixture is a well-formed Table", () => {
  test.each(ALL)("%s has consistent fields and rows", (_name, table) => {
    expect(table.rows.length).toBe(table.row_count);
    expect(table.fields.length).toBeGreaterThan(0);

    const named = new Set(table.fields.map((f) => f.name));
    for (const row of table.rows) {
      for (const key of Object.keys(row)) {
        // A column present in the data but absent from `fields` would be
        // invisible to every dropdown in the interface.
        expect(named.has(key)).toBe(true);
      }
    }
  });

  test.each(ALL)("%s reports distinct counts that match the data", (_name, table) => {
    for (const field of table.fields) {
      const actual = new Set(table.rows.map((r) => JSON.stringify(r[field.name]))).size;
      expect(field.distinct).toBe(actual);
    }
  });
});

describe("every fixture charts through the real engine", () => {
  test.each(ALL)("%s produces a drawable default chart", (_name, table) => {
    const spec = defaultChart(table);
    const plot = buildPlot(table, spec, 640, 360);
    // Not "does not throw" — buildPlot never throws, it reports. An empty
    // problems list is the only evidence that it drew anything.
    expect(plot.problems).toEqual([]);
    expect(plot.panels.length).toBeGreaterThan(0);
    expect(plot.panels[0]!.marks.length).toBeGreaterThan(0);
  });
});

describe("the fixtures cover the states that matter", () => {
  test("readings picks a payload column, not the row number", () => {
    // The defect that shipped in DATADROP-3: first-quantitative on a stream
    // table is `seq`, and a chart of sequence against time is a straight line
    // that says nothing. This fixture is the regression guard for that rule.
    const spec = defaultChart(readings);
    expect(spec.mapping.y).not.toBe("seq");
    expect(spec.mapping.y?.startsWith("data.")).toBe(true);
    expect(spec.mapping.x).toBe("time");
    // Four stations: few enough to colour by, which is why the colour rule
    // requires 2-8 distinct values.
    expect(spec.mapping.color).toBe("data.station");
  });

  test("readings has a temporal x, so the continuous time axis is exercised", () => {
    const spec = defaultChart(readings);
    const plot = buildPlot(readings, spec, 640, 360);
    // A banded time axis would emit one tick per distinct timestamp — 90 of
    // them. A continuous one emits a handful on round units.
    expect(plot.xTicks.length).toBeLessThan(12);
    expect(plot.xTicks.length).toBeGreaterThan(1);
  });

  test("census keeps the zero-padded identifier a string", () => {
    // The whole argument for server-side typing in one assertion: a sniffer
    // calls this column numeric and "001" becomes 1 before any schema can
    // object.
    expect(census.rows[0]!.station_id).toBe("001");
    const stationId = census.fields.find((f) => f.name === "station_id");
    expect(stationId?.type).toBe("n");
    expect(stationId?.inferred_from).toBe("schema");
  });

  test("batches is truncated, so the notice has something to describe", () => {
    expect(batches.truncated).toBe(true);
    expect(batches.strategy).toBe("head");
  });

  test("a summarize step reshapes a fixture the way the editors claim", () => {
    // Also pins the documented surprise: summarize keeps the key and the
    // aggregate and drops everything else.
    const { rows, fields } = evaluate(batches, [
      { id: "s1", kind: "summarize", on: true, by: "line", fn: "mean", field: "yield_pct" },
    ]);
    expect(fields.map((f) => f.name)).toEqual(["line", "mean_yield_pct"]);
    expect(rows.length).toBe(4);
  });
});
