import { describe, expect, test } from "bun:test";
import { MAX_SERIES, buildRadar } from "../src/model/radar";
import type { RadarAxis, RadarSeries } from "../src/model/radar";

/**
 * Radar geometry, asserted as coordinates.
 *
 * The four-axes-at-maximum case is the reason this test can be exact: with four
 * spokes and every value at its axis maximum, the vertices land on the top,
 * right, bottom and left of the circle, and those four points can be written
 * down by hand. A test that only checked "four vertices were produced" would
 * pass for a radar rotated by any angle, including the one where the first
 * spoke is at three o'clock instead of twelve.
 */

const axis = (label: string, max: number): RadarAxis => ({ label, max });

const series = (key: string, values: number[]): RadarSeries => ({
  key,
  label: key,
  color: "var(--pbui-tone-field)",
  values,
});

const FOUR = [axis("N", 10), axis("E", 10), axis("S", 10), axis("W", 10)];

describe("radar geometry", () => {
  test("the first spoke is at the TOP, not at three o'clock", () => {
    const plot = buildRadar(FOUR, [series("a", [10, 10, 10, 10])], 300);
    expect(plot.problems).toEqual([]);

    const [north, east, south, west] = plot.polygons[0]!.points;

    // Directly above the centre: same x, smaller y.
    expect(north!.x).toBeCloseTo(plot.cx, 6);
    expect(north!.y).toBeCloseTo(plot.cy - plot.r, 6);

    // Then clockwise.
    expect(east!.x).toBeCloseTo(plot.cx + plot.r, 6);
    expect(east!.y).toBeCloseTo(plot.cy, 6);

    expect(south!.x).toBeCloseTo(plot.cx, 6);
    expect(south!.y).toBeCloseTo(plot.cy + plot.r, 6);

    expect(west!.x).toBeCloseTo(plot.cx - plot.r, 6);
    expect(west!.y).toBeCloseTo(plot.cy, 6);
  });

  test("a half-maximum value lands half way out along its own spoke", () => {
    const plot = buildRadar(FOUR, [series("a", [5, 10, 10, 10])], 300);
    const north = plot.polygons[0]!.points[0]!;
    expect(north.y).toBeCloseTo(plot.cy - plot.r * 0.5, 6);
  });

  test("each spoke normalises against ITS OWN maximum", () => {
    // Same raw value, different axis maxima: the two vertices must NOT be at
    // the same radius. This is the property the on-screen sentence warns about.
    const mixed = [axis("small", 10), axis("big", 100), axis("c", 10)];
    const plot = buildRadar(mixed, [series("a", [10, 10, 10])], 300);

    const [onSmall, onBig] = plot.polygons[0]!.points;
    const radiusOf = (p: { x: number; y: number }) => Math.hypot(p.x - plot.cx, p.y - plot.cy);

    expect(radiusOf(onSmall!)).toBeCloseTo(plot.r, 6); // 10/10 = full
    expect(radiusOf(onBig!)).toBeCloseTo(plot.r * 0.1, 6); // 10/100
  });

  test("the normalisation claim is carried in the plot, so a caller cannot omit it", () => {
    const plot = buildRadar(FOUR, [series("a", [1, 2, 3, 4])], 300);
    expect(plot.normalisation).toContain("its own maximum");
  });
});

describe("radar refuses rather than drawing something wrong", () => {
  test("fewer than three axes is not a polygon", () => {
    const plot = buildRadar([axis("a", 1), axis("b", 1)], [series("s", [1, 1])], 300);
    expect(plot.problems.join(" ")).toContain("at least 3 axes");
    expect(plot.polygons).toEqual([]);
  });

  test("an axis with no positive maximum is refused, not divided by", () => {
    const plot = buildRadar(
      [axis("a", 10), axis("b", 0), axis("c", 10)],
      [series("s", [1, 1, 1])],
      300,
    );
    expect(plot.problems.join(" ")).toContain("no positive maximum");
  });

  test("a series whose length does not match the axes is named", () => {
    const plot = buildRadar(FOUR, [series("short", [1, 2])], 300);
    expect(plot.problems.join(" ")).toContain('series "short" has 2 values for 4 axes');
  });
});

describe("the shape stays a shape", () => {
  test("a zero is floored so the polygon cannot self-intersect into a bowtie", () => {
    const plot = buildRadar(FOUR, [series("a", [0, 10, 10, 10])], 300);
    const north = plot.polygons[0]!.points[0]!;
    const radius = Math.hypot(north.x - plot.cx, north.y - plot.cy);

    // Not at the centre — a vertex at the centre makes the polygon cross itself.
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeCloseTo(plot.r * 0.05, 6);
    // The underlying value is still reported honestly.
    expect(north.value).toBe(0);
  });

  test("a value above its maximum is clamped to the outer ring, not drawn outside it", () => {
    const plot = buildRadar(FOUR, [series("a", [50, 10, 10, 10])], 300);
    const north = plot.polygons[0]!.points[0]!;
    expect(Math.hypot(north.x - plot.cx, north.y - plot.cy)).toBeCloseTo(plot.r, 6);
  });

  test("beyond MAX_SERIES the extra series are dropped AND reported", () => {
    const many = Array.from({ length: MAX_SERIES + 2 }, (_, i) => series(`s${i}`, [1, 1, 1, 1]));
    const plot = buildRadar(FOUR, many, 300);

    expect(plot.polygons.length).toBe(MAX_SERIES);
    expect(
      plot.notices.join(" "),
      "extra series vanished with no notice — the caller asked for them and was not told",
    ).toContain("not drawn");
  });

  test("the whole drawing fits inside the box, labels included", () => {
    const size = 300;
    const plot = buildRadar(FOUR, [series("a", [10, 10, 10, 10])], size);

    for (const a of plot.axes) {
      expect(a.labelX).toBeGreaterThanOrEqual(0);
      expect(a.labelX).toBeLessThanOrEqual(size);
      expect(a.labelY).toBeGreaterThanOrEqual(0);
      expect(a.labelY).toBeLessThanOrEqual(size);
    }
  });
});
