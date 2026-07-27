import styles from "./Sparkline.module.css";

export interface SparklineProps {
  /** The series, in order. Non-finite entries are treated as gaps. */
  points: number[];
  /** The accessible name. Required, for the same reason Meter's is. */
  label: string;
  /**
   * Draws a dashed reference line, e.g. a budget. Points at or above it take
   * the alert tone.
   */
  threshold?: number;
  /** A CSS variable reference for the stroke. */
  tone?: string;
  width?: number;
  height?: number;
}

/**
 * A series at a glance: no axes, no scales, no legend, no interaction.
 *
 * This is not a small chart. `ChartPanel` computes scales, ticks and marks
 * through the grammar-of-graphics pipeline, which is the right machinery for a
 * chart and roughly forty times the work for a shape drawn at 120×24. The two
 * exist for different questions: a chart answers "what are the values", a
 * sparkline answers "what is the shape".
 *
 * An empty series renders an empty box rather than `null`. A component that
 * disappears when its data is empty makes the surrounding layout jump, and a
 * jump reads as a defect.
 */
export function Sparkline({
  points,
  label,
  threshold,
  tone,
  width = 120,
  height = 24,
}: SparklineProps) {
  const finite = points.filter((p) => Number.isFinite(p));

  // The domain has to include the threshold, or a budget line above every
  // observed value is drawn off the top of the box and silently vanishes.
  const candidates = threshold !== undefined ? [...finite, threshold] : finite;
  const lo = candidates.length > 0 ? Math.min(...candidates) : 0;
  const hi = candidates.length > 0 ? Math.max(...candidates) : 1;
  // A flat series has zero range; dividing by it yields NaN for every point.
  const span = hi - lo || 1;

  const pad = 2;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const xAt = (i: number) => pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * usableW);
  const yAt = (v: number) => pad + usableH - ((v - lo) / span) * usableH;

  // Break the path at non-finite values instead of interpolating across them:
  // a gap in the data should look like a gap.
  const d = points
    .map((p, i) => {
      if (!Number.isFinite(p)) return null;
      const previousMissing = i === 0 || !Number.isFinite(points[i - 1] as number);
      return `${previousMissing ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(p).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const over = threshold !== undefined && finite.some((p) => p >= threshold);

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {threshold !== undefined ? (
        <line
          className={styles.threshold}
          x1={0}
          x2={width}
          y1={yAt(threshold)}
          y2={yAt(threshold)}
        />
      ) : null}
      {d ? (
        <path
          className={styles.line}
          d={d}
          data-over={over ? "true" : undefined}
          style={tone && !over ? { stroke: tone } : undefined}
        />
      ) : null}
    </svg>
  );
}
