// The plot engine: a pure function from (table, spec, size) to drawable
// geometry. No SVG, no React, no DOM.
//
// Splitting geometry from rendering is what makes this testable: a test can
// assert that the mark for row 3 lands at x = 214.5 without a browser and
// without a snapshot file. Ported from pbui-gog.jsx:924-1117.

import type { ChartSpec } from "./chart";
import { CHANNELS } from "./chart";
import { evaluate } from "./pipeline";
import type { FieldType, Row, Table } from "./table";
import { asNumber, asText, fmt } from "./table";
import { timeTicks, toInstant } from "./time";

export const PALETTE = [
  "#3b6fb6", "#c0504d", "#d6a419", "#7a9a6b",
  "#8f7bb0", "#c07a94", "#5fa9a0", "#8892a8",
];
export const RAMP_LOW = "#3b6fb6";
export const RAMP_HIGH = "#c0504d";
export const NEUTRAL = "#8892a8";

/** How many colour categories get their own entry before the rest are pooled. */
export const MAX_CATEGORIES = 8;
/** How many facet panels are drawn before the rest are dropped. */
export const MAX_FACETS = 6;

export type Mark =
  | { kind: "circle"; x: number; y: number; r: number; fill: string; row: Row }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; row: Row }
  | {
      kind: "path";
      d: string;
      stroke?: string;
      fill?: string;
      fillOpacity?: number;
    };

export interface Panel {
  x0: number;
  y0: number;
  w: number;
  h: number;
  title: string | null;
  marks: Mark[];
}

export interface Tick {
  pos: number;
  label: string;
}

export interface LegendEntry {
  label: string;
  color: string;
  value?: string;
}

export interface Plot {
  /** Non-empty means nothing was drawn, and each entry says why. */
  problems: string[];
  panels: Panel[];
  legend: LegendEntry[];
  legendTitle: string | null;
  /** Colour categories beyond MAX_CATEGORIES, pooled into "+ N more". */
  legendOverflow: number;
  /** Facet values beyond MAX_FACETS, which are not drawn at all. */
  facetOverflow: number;
  xTicks: Tick[];
  yTicks: Tick[];
  padL: number;
  padB: number;
  legendW: number;
  width: number;
  height: number;
  rowsOut: number;
}

export interface PlotOptions {
  /** A miniature is drawn with tighter padding and smaller marks. */
  mini?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Axis ticks at 1, 2, 5 or 10 times a power of ten.
 *
 * niceTicks(0, 97, 5) must give [0, 20, 40, 60, 80] — not [0, 19.4, 38.8, …].
 */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step =
    (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * magnitude;

  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** Interpolate between two "#rrggbb" colours. */
export function lerpHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const from = parse(a);
  const to = parse(b);
  return (
    "#" +
    from
      .map((v, i) => Math.round(v + ((to[i] as number) - v) * t).toString(16).padStart(2, "0"))
      .join("")
  );
}

function emptyPlot(problems: string[], width: number, height: number, rowsOut: number): Plot {
  return {
    problems,
    panels: [],
    legend: [],
    legendTitle: null,
    legendOverflow: 0,
    facetOverflow: 0,
    xTicks: [],
    yTicks: [],
    padL: 0,
    padB: 0,
    legendW: 0,
    width,
    height,
    rowsOut,
  };
}

/**
 * Turn a spec into geometry.
 *
 * Refuses to draw rather than drawing something wrong, and every refusal names
 * what to change. An empty chart with a sentence explaining why is a usable
 * product; an empty chart with a silent NaN in the transform is not.
 */
export function buildPlot(
  table: Table,
  spec: ChartSpec,
  width: number,
  height: number,
  options: PlotOptions = {},
): Plot {
  const mini = options.mini ?? false;
  const { rows, fields, err } = evaluate(table, spec.steps, spec.typeOverrides);

  const typeOf: Record<string, FieldType> = {};
  for (const field of fields) typeOf[field.name] = field.type;

  const mapping = spec.mapping;
  const problems: string[] = [];
  if (err) problems.push(err);

  for (const channel of CHANNELS) {
    const name = mapping[channel];
    if (name && !typeOf[name]) {
      problems.push(`${channel} ↦ ${name} is not in the pipeline output`);
    }
  }
  if (!mapping.x || !typeOf[mapping.x]) problems.push("map x to a field");
  if (!mapping.y || !typeOf[mapping.y]) problems.push("map y to a field");
  if (rows.length === 0) {
    problems.push("the pipeline output is empty — a filter step is too strict");
  }
  if (problems.length > 0) return emptyPlot(problems, width, height, rows.length);

  const xName = mapping.x as string;
  const yName = mapping.y as string;
  const xType = typeOf[xName] as FieldType;
  const yType = typeOf[yName] as FieldType;

  if (spec.geom === "bar" && xType === "q") {
    problems.push("bar wants a nominal or temporal x — add a summarize step, or map x to a category");
  }
  if (yType !== "q") {
    problems.push(`y must be quantitative for geom ${spec.geom}`);
  }
  if (problems.length > 0) return emptyPlot(problems, width, height, rows.length);

  // ---- facets -----------------------------------------------------------
  // Panels share one set of scales. Independent axes cannot be compared, which
  // is the only reason to put panels side by side.
  const facetName = mapping.facet;
  let facetValues: (string | null)[] = [null];
  let facetOverflow = 0;
  if (facetName && typeOf[facetName] !== "q") {
    const all = [...new Set(rows.map((row) => asText(row[facetName])))].sort();
    facetOverflow = Math.max(0, all.length - MAX_FACETS);
    facetValues = all.slice(0, MAX_FACETS);
  }
  const facetCount = facetValues.length;
  const columns = facetCount <= 1 ? 1 : facetCount === 2 ? 2 : facetCount <= 4 ? 2 : 3;
  const panelRows = Math.ceil(facetCount / columns);

  // ---- colour -----------------------------------------------------------
  const colorName = mapping.color;
  let colorMode: "q" | "n" | null = null;
  let categories: string[] = [];
  let categoryOverflow = 0;
  let ramp: { lo: number; hi: number } | null = null;

  if (colorName) {
    if (typeOf[colorName] === "q") {
      const values = rows.map((row) => asNumber(row[colorName])).filter(Number.isFinite);
      colorMode = "q";
      ramp = { lo: Math.min(...values), hi: Math.max(...values) };
    } else {
      colorMode = "n";
      const all = [...new Set(rows.map((row) => asText(row[colorName])))].sort();
      categoryOverflow = Math.max(0, all.length - MAX_CATEGORIES);
      categories = all.slice(0, MAX_CATEGORIES);
    }
  }

  const colorOf = (row: Row): string => {
    if (!colorMode || !colorName) return PALETTE[0] as string;
    if (colorMode === "q" && ramp) {
      const t =
        ramp.hi > ramp.lo ? (asNumber(row[colorName]) - ramp.lo) / (ramp.hi - ramp.lo) : 0.5;
      return lerpHex(RAMP_LOW, RAMP_HIGH, clamp(t, 0, 1));
    }
    const index = categories.indexOf(asText(row[colorName]));
    return index < 0 ? NEUTRAL : (PALETTE[index % PALETTE.length] as string);
  };

  // ---- x domain (shared across panels) ----------------------------------
  //
  // A temporal x is continuous, not a band. One slot per distinct timestamp
  // would draw uneven intervals evenly and label the axis with full ISO
  // strings — which is exactly what a timeseries workbench must not do.
  //
  // The exception is a bar chart: a bar needs a discrete slot to have a width,
  // and a bar chart of a raw timestamp column is almost always a missing
  // summarize step rather than a deliberate choice.
  const continuousX = xType === "q" || (xType === "t" && spec.geom !== "bar");
  const xValue = (row: Row): number =>
    xType === "t" ? toInstant(row[xName]) : asNumber(row[xName]);

  let xCategories: string[] | null = null;
  let xLo = 0;
  let xHi = 1;
  if (continuousX) {
    const values = rows.map(xValue).filter(Number.isFinite);
    xLo = Math.min(...values);
    xHi = Math.max(...values);
    // A degenerate domain would make the scale divide by zero.
    if (xLo === xHi) {
      xLo -= 1;
      xHi += 1;
    }
    const pad = (xHi - xLo) * 0.05;
    xLo -= pad;
    xHi += pad;
  } else if (xType === "t") {
    // A banded time axis (bar only) still sorts chronologically rather than
    // lexically, so 2026-07-24T09:00 precedes 2026-07-24T10:00 correctly.
    xCategories = [...new Set(rows.map((row) => asText(row[xName])))].sort(
      (a, b) => toInstant(a) - toInstant(b),
    );
  } else {
    xCategories = [...new Set(rows.map((row) => asText(row[xName])))].sort();
  }

  // ---- y domain ---------------------------------------------------------
  const yValues = rows.map((row) => asNumber(row[yName])).filter(Number.isFinite);
  let yLo = Math.min(...yValues);
  let yHi = Math.max(...yValues);
  // A log scale needs a strictly positive domain. Falling back silently would
  // be a lie, so the editor also disables the toggle — this is the second line
  // of defence, not the first.
  const log = spec.yScale === "log" && yLo > 0;

  // A bar or an area whose baseline is not zero misrepresents magnitude.
  if ((spec.geom === "bar" || spec.geom === "area") && !log) {
    yLo = Math.min(0, yLo);
    yHi = Math.max(0, yHi);
  }
  if (yLo === yHi) {
    yLo -= 1;
    yHi += 1;
  }
  if (!log) {
    const pad = (yHi - yLo) * 0.06;
    yHi += pad;
    if (spec.geom !== "bar" && spec.geom !== "area") yLo -= pad;
  }

  // ---- size -------------------------------------------------------------
  const sizeName = mapping.size;
  let sizeLo = 0;
  let sizeHi = 1;
  if (sizeName && typeOf[sizeName] === "q") {
    const values = rows.map((row) => asNumber(row[sizeName])).filter(Number.isFinite);
    sizeLo = Math.min(...values);
    sizeHi = Math.max(...values);
  }
  const radiusOf = (row: Row): number => {
    if (!sizeName || typeOf[sizeName] !== "q") return mini ? 2.4 : 4;
    const t = sizeHi > sizeLo ? (asNumber(row[sizeName]) - sizeLo) / (sizeHi - sizeLo) : 0.5;
    // Square root, so that AREA is proportional to the value. A linear radius
    // exaggerates large values by the square, which is the single most common
    // quantitative-encoding error in charts.
    return (mini ? 1.6 : 3) + Math.sqrt(clamp(t, 0, 1)) * (mini ? 4 : 8);
  };

  // ---- layout -----------------------------------------------------------
  const legendW = colorMode && !mini ? 110 : 0;
  const padL = mini ? 26 : 46;
  const padB = mini ? 14 : 26;
  const padT = facetCount > 1 ? (mini ? 12 : 18) : mini ? 4 : 10;
  const padR = mini ? 4 : 10;
  const gapX = mini ? 6 : 14;
  const gapY = mini ? 6 : 16;

  const plotW = width - legendW;
  const panelW = (plotW - padL - padR - gapX * (columns - 1)) / columns;
  const panelH =
    (height - padT * panelRows - padB - gapY * (panelRows - 1)) / panelRows;

  const scaleX = (value: unknown): number => {
    if (continuousX) {
      const v = xType === "t" ? toInstant(value) : asNumber(value);
      return ((v - xLo) / (xHi - xLo)) * panelW;
    }
    const index = (xCategories as string[]).indexOf(asText(value));
    return ((index + 0.5) / (xCategories as string[]).length) * panelW;
  };
  const scaleY = (value: unknown): number => {
    const v = asNumber(value);
    if (log) {
      return (1 - (Math.log10(v) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo))) * panelH;
    }
    return (1 - (v - yLo) / (yHi - yLo)) * panelH;
  };

  const yTicks: Tick[] = log
    ? niceTicks(Math.log10(yLo), Math.log10(yHi), 4).map((exponent) => {
        const v = Math.pow(10, exponent);
        return { pos: scaleY(v), label: fmt(v) };
      })
    : niceTicks(yLo, yHi, mini ? 3 : 5).map((v) => ({ pos: scaleY(v), label: fmt(v) }));

  const xTicks: Tick[] =
    xType === "t" && continuousX
      ? timeTicks(xLo, xHi, mini ? 3 : 6).map((tick) => ({
          pos: ((tick.at - xLo) / (xHi - xLo)) * panelW,
          label: tick.label,
        }))
      : continuousX
        ? niceTicks(xLo, xHi, mini ? 3 : 5).map((v) => ({ pos: scaleX(v), label: fmt(v) }))
        : (xCategories as string[])
          .map((c, i) => ({ pos: scaleX(c), label: c, i }))
          .filter(({ i }) => {
            // Stride the labels so they never overlap.
            const max = mini ? 4 : Math.max(3, Math.floor(panelW / 44));
            const stride = Math.ceil((xCategories as string[]).length / max);
            return i % stride === 0;
          })
          .map(({ pos, label }) => ({ pos, label }));

  // ---- marks ------------------------------------------------------------
  const panels: Panel[] = facetValues.map((facetValue, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x0 = padL + column * (panelW + gapX);
    const y0 = padT + row * (panelH + gapY + (facetCount > 1 ? padT : 0));

    const panelRowsData =
      facetValue === null || !facetName
        ? rows
        : rows.filter((r) => asText(r[facetName]) === facetValue);

    const marks: Mark[] = [];
    const baseline = log ? panelH : scaleY(clamp(0, yLo, yHi));

    if (spec.geom === "point") {
      for (const r of panelRowsData) {
        if (!Number.isFinite(asNumber(r[yName]))) continue;
        marks.push({
          kind: "circle",
          x: scaleX(r[xName]),
          y: scaleY(r[yName]),
          r: radiusOf(r),
          fill: colorOf(r),
          row: r,
        });
      }
    } else if (spec.geom === "line" || spec.geom === "area") {
      const groups = new Map<string, Row[]>();
      for (const r of panelRowsData) {
        const key = colorMode === "n" && colorName ? asText(r[colorName]) : "·";
        const bucket = groups.get(key);
        if (bucket) bucket.push(r);
        else groups.set(key, [r]);
      }

      for (const [key, group] of groups) {
        // Sort along x here. The server deliberately does not reorder rows;
        // sorting in both places is how a chart ends up correct for only one of
        // the two query orderings.
        const sorted = [...group].sort((a, b) =>
          continuousX
            ? xValue(a) - xValue(b)
            : (xCategories as string[]).indexOf(asText(a[xName])) -
              (xCategories as string[]).indexOf(asText(b[xName])),
        );
        const points = sorted
          .filter((r) => Number.isFinite(asNumber(r[yName])))
          .map((r) => ({ x: scaleX(r[xName]), y: scaleY(r[yName]), row: r }));

        if (points.length < 2) {
          // A path through one vertex draws nothing; show the point instead.
          for (const p of points) {
            marks.push({
              kind: "circle",
              x: p.x,
              y: p.y,
              r: radiusOf(p.row),
              fill: colorOf(p.row),
              row: p.row,
            });
          }
          continue;
        }

        const tone =
          colorMode === "n"
            ? (PALETTE[Math.max(0, categories.indexOf(key)) % PALETTE.length] as string)
            : colorMode === "q"
              ? NEUTRAL
              : (PALETTE[0] as string);
        const d = points
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");

        if (spec.geom === "area") {
          const last = points[points.length - 1];
          const first = points[0];
          if (last && first) {
            marks.push({
              kind: "path",
              d: `${d} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`,
              fill: tone,
              fillOpacity: 0.25,
            });
          }
        }
        marks.push({ kind: "path", d, stroke: tone });
        for (const p of points) {
          marks.push({
            kind: "circle",
            x: p.x,
            y: p.y,
            r: mini ? 1.8 : 3.2,
            fill: colorOf(p.row),
            row: p.row,
          });
        }
      }
    } else if (spec.geom === "bar") {
      const byX = new Map<string, Row[]>();
      for (const r of panelRowsData) {
        const key = asText(r[xName]);
        const bucket = byX.get(key);
        if (bucket) bucket.push(r);
        else byX.set(key, [r]);
      }

      const band = panelW / (xCategories as string[]).length;
      for (const [key, group] of byX) {
        const centre = scaleX(key);
        const barWidth = (band * 0.72) / group.length;
        group.forEach((r, i) => {
          const value = asNumber(r[yName]);
          if (!Number.isFinite(value)) return;
          const y = scaleY(value);
          marks.push({
            kind: "rect",
            x: centre - (band * 0.72) / 2 + i * barWidth,
            // Measured from the baseline, so a negative value draws downward.
            y: Math.min(y, baseline),
            w: Math.max(1, barWidth - 1),
            h: Math.max(0.5, Math.abs(baseline - y)),
            fill: colorOf(r),
            row: r,
          });
        });
      }
    }

    return { x0, y0, w: panelW, h: panelH, title: facetValue, marks };
  });

  const legend: LegendEntry[] =
    colorMode === "n"
      ? categories.map((c, i) => ({
          label: c,
          value: c,
          color: PALETTE[i % PALETTE.length] as string,
        }))
      : colorMode === "q" && ramp
        ? [
            { label: fmt(ramp.lo), color: RAMP_LOW },
            { label: fmt(ramp.hi), color: RAMP_HIGH },
          ]
        : [];

  return {
    problems: [],
    panels,
    legend,
    legendTitle: colorName ?? null,
    legendOverflow: categoryOverflow,
    facetOverflow,
    xTicks,
    yTicks,
    padL,
    padB,
    legendW,
    width,
    height,
    rowsOut: rows.length,
  };
}
