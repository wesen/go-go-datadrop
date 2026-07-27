// The radar engine: a pure function from (axes, series, size) to drawable
// geometry. No SVG, no React, no DOM — the same contract as `buildPlot`, and
// deliberately a SIBLING of it rather than a branch inside it.
//
// Radar is not a fifth geom. A geom is a mark shape drawn *inside* a coordinate
// system: point, line, bar and area all consume the same px/py from the same
// cartesian scales. Radar replaces the coordinate system. There is no x, no y,
// no padL, no axis ticks — every cartesian assumption in `buildPlot` is wrong
// inside it, so putting it there would mean a branch that invalidates the code
// around it. Ported in spirit from pbui-basketball.jsx:495-540.

import { clamp } from "./format";

/**
 * How many series can be drawn before the picture stops working.
 *
 * The prototype caps at three (`.slice(-3)`). Four overlapping translucent
 * polygons cannot be told apart, and comparison is the whole job of a radar, so
 * a fourth series does not degrade the chart — it defeats it.
 */
export const MAX_SERIES = 3;

/** Fewer than three spokes is not a polygon. */
export const MIN_AXES = 3;

export interface RadarAxis {
  label: string;
  /**
   * The value that reaches the outer ring on THIS spoke.
   *
   * Per-axis, and that is a claim the chart must make out loud: the shape says
   * "relative to the maximum in each category", not "these values are
   * comparable to each other". A reader who assumes the second is being misled
   * by the picture, so `RadarPlot.normalisation` carries the sentence for the
   * caller to render.
   */
  max: number;
}

export interface RadarSeries {
  key: string;
  label: string;
  /** A CSS variable reference. */
  color: string;
  /** One value per axis, in the same order. */
  values: number[];
}

export interface RadarVertex {
  x: number;
  y: number;
  /** The value before normalisation, for a tooltip or a presentation. */
  value: number;
  axis: string;
}

export interface RadarPlot {
  /** Non-empty means nothing was drawn, and each entry says why. */
  problems: string[];
  /** Drawn, but part of the request could not be honoured. */
  notices: string[];
  cx: number;
  cy: number;
  r: number;
  /** Fractions of `r` for the concentric guide rings. */
  rings: number[];
  axes: Array<{ label: string; x: number; y: number; labelX: number; labelY: number }>;
  polygons: Array<{ key: string; label: string; color: string; points: RadarVertex[] }>;
  /** The sentence the caller must show. See `RadarAxis.max`. */
  normalisation: string;
}

function empty(problems: string[], size: number): RadarPlot {
  return {
    problems,
    notices: [],
    cx: size / 2,
    cy: size / 2,
    r: 0,
    rings: [],
    axes: [],
    polygons: [],
    normalisation: "",
  };
}

/**
 * Turn axes and series into radar geometry.
 *
 * Refuses rather than drawing something wrong, and every refusal names what to
 * change — the same house style as `buildPlot`.
 */
export function buildRadar(
  axes: RadarAxis[],
  series: RadarSeries[],
  size: number,
  options: { labelGap?: number } = {},
): RadarPlot {
  const problems: string[] = [];
  const notices: string[] = [];

  if (axes.length < MIN_AXES) {
    problems.push(`a radar needs at least ${MIN_AXES} axes — this one has ${axes.length}`);
  }
  for (const axis of axes) {
    if (!Number.isFinite(axis.max) || axis.max <= 0) {
      problems.push(
        `axis "${axis.label}" has no positive maximum, so nothing can be scaled against it`,
      );
    }
  }
  for (const s of series) {
    if (s.values.length !== axes.length) {
      problems.push(`series "${s.label}" has ${s.values.length} values for ${axes.length} axes`);
    }
  }
  if (problems.length > 0) return empty(problems, size);

  const drawn = series.slice(0, MAX_SERIES);
  if (series.length > MAX_SERIES) {
    notices.push(
      `${series.length - MAX_SERIES} more series not drawn — beyond ${MAX_SERIES} the polygons cannot be told apart`,
    );
  }

  // Leave room for the spoke labels outside the outer ring.
  const labelGap = options.labelGap ?? 0.16;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 / (1 + labelGap + 0.06);

  const n = axes.length;
  // -PI/2 puts the first spoke at the TOP. Without it the first axis sits at
  // three o'clock and every radar anyone has seen looks rotated.
  const angleAt = (i: number) => -Math.PI / 2 + (i / n) * 2 * Math.PI;
  const pointAt = (i: number, fraction: number): [number, number] => [
    cx + Math.cos(angleAt(i)) * r * fraction,
    cy + Math.sin(angleAt(i)) * r * fraction,
  ];

  const rings = [0.25, 0.5, 0.75, 1];

  const axisGeometry = axes.map((axis, i) => {
    const [x, y] = pointAt(i, 1);
    const [labelX, labelY] = pointAt(i, 1 + labelGap);
    return { label: axis.label, x, y, labelX, labelY };
  });

  const polygons = drawn.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    points: s.values.map((value, i) => {
      const axis = axes[i] as RadarAxis;
      // The 0.05 floor is load-bearing. A zero collapses that vertex onto the
      // centre, and a polygon with a vertex at the centre self-intersects into
      // a bowtie — which reads as a rendering fault rather than as a low value.
      const fraction = clamp(Number.isFinite(value) ? value / axis.max : 0, 0.05, 1);
      const [x, y] = pointAt(i, fraction);
      return { x, y, value, axis: axis.label };
    }),
  }));

  return {
    problems: [],
    notices,
    cx,
    cy,
    r,
    rings,
    axes: axisGeometry,
    polygons,
    normalisation:
      "each spoke is scaled to its own maximum — shapes compare rank within a category, not values across categories",
  };
}
