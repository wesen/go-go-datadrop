import { defaultChart } from "../model/chart";
import type { ChartSpec } from "../model/chart";
import { evaluate } from "../model/pipeline";
import type { Aggregate, DeriveOp, FilterOp, Step } from "../model/pipeline";
import { buildPlot } from "../model/plot";
import type { Plot } from "../model/plot";
import type { Table } from "../model/table";
import { readings } from "./index";

/**
 * Chart specifications and plots, built by the real engine.
 *
 * A story that hand-writes a `Plot` literal is asserting what the engine
 * produces rather than showing it, and the two drift the moment a scale changes.
 * Everything here calls `buildPlot` and `evaluate` — the same functions the
 * application calls — so a story is the actual output of the actual code path,
 * and a mark in the wrong place is a defect in `model/plot.ts` that a unit test
 * can find without a browser.
 *
 * This lives in `fixtures/` rather than beside a story because four components
 * need it: the chart panel, the pipeline editor, the encoding editor and the
 * table. `fixtures` may import `model` and nothing else, which is exactly the
 * dependency this has.
 *
 * The field names are the awkward part and the reason this file exists. The
 * `readings` fixture is an *event stream*, so its payload columns are dotted —
 * `data.temp_c`, not `temp_c` — and a story that guesses wrong gets "Nothing to
 * draw yet: y ↦ temp_c is not in the pipeline output", which looks like a
 * broken component rather than a wrong argument. Naming them once, here, is
 * what stops that happening five more times.
 */

/** The columns of the `readings` fixture that a chart can be built from. */
export const READINGS = {
  time: "time",
  temp: "data.temp_c",
  humidity: "data.humidity",
  station: "data.station",
  ok: "data.ok",
  seq: "seq",
} as const;

let stepId = 0;
/** Stable ids, because a story that re-renders must not re-key its steps. */
const nextId = () => `step-${++stepId}`;

export const step = {
  filter: (field: string, op: FilterOp, value: string): Step => ({
    id: nextId(),
    kind: "filter",
    on: true,
    field,
    op,
    value,
  }),
  summarize: (by: string, fn: Aggregate, field: string): Step => ({
    id: nextId(),
    kind: "summarize",
    on: true,
    by,
    fn,
    field,
  }),
  sort: (field: string, dir: "asc" | "desc" = "asc"): Step => ({
    id: nextId(),
    kind: "sort",
    on: true,
    field,
    dir,
  }),
  limit: (n: number): Step => ({ id: nextId(), kind: "limit", on: true, n }),
  derive: (name: string, a: string, op: DeriveOp, b: string): Step => ({
    id: nextId(),
    kind: "derive",
    on: true,
    name,
    op,
    a,
    b,
  }),
};

/**
 * A specification over the `readings` fixture.
 *
 * Defaults to time against temperature, which is the chart the fixture exists
 * to make. Everything is overridable, and `steps` is the interesting one: it is
 * how a story shows a chart of *pipeline output* rather than of raw rows.
 */
export function chartSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    source: { kind: "stream", drop: "lab", stream: "temps" },
    steps: [],
    geom: "point",
    mapping: {
      x: READINGS.time,
      y: READINGS.temp,
      color: null,
      size: null,
      facet: null,
    },
    yScale: "linear",
    ...over,
  };
}

/** What the engine would choose for a table on its own. */
export function autoSpec(table: Table = readings): ChartSpec {
  return { ...chartSpec(), ...defaultChart(table) };
}

/**
 * A plot, at a size a tile actually gets.
 *
 * 560×300 is roughly a half-width tile in the default workspace, which is where
 * these charts are read. A story rendered at 1200px wide would hide the tick
 * culling and the label collision that the real size exercises.
 */
export function chartPlot(spec: ChartSpec = chartSpec(), table: Table = readings, width = 560, height = 300): Plot {
  return buildPlot(table, spec, width, height);
}

/**
 * The pipeline output for a specification, as the editors show it.
 *
 * Returns what `useDocPipeline` returns in the application, computed by the
 * same `evaluate` — so a story of the pipeline editor shows real row counts and
 * real dropped-row warnings rather than plausible numbers.
 */
export function pipelineOf(spec: ChartSpec = chartSpec(), table: Table = readings) {
  return evaluate(table, spec.steps, spec.typeOverrides);
}

/**
 * The pipeline output shaped back into a `Table`.
 *
 * This is what `useTableFor` hands the PBUI environment, and a story that
 * renders field chips over a transformed relation must supply the same thing —
 * otherwise the chips resolve against the *source*, and every produced column
 * (`mean_data.temp_c`, a derived name) renders as a stale field that is "not in
 * the pipeline output" when it is precisely that.
 *
 * That was a live defect until this follow-up, found by a story of a summarized
 * table. Pass this through `parameters.pbui.table` wherever a story shows a
 * transformed relation.
 */
export function tableAfter(spec: ChartSpec = chartSpec(), table: Table = readings): Table {
  const out = evaluate(table, spec.steps, spec.typeOverrides);
  return { ...table, fields: out.fields, rows: out.rows };
}
