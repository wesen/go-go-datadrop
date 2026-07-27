import { clamp } from "../../../model/format";
import styles from "./Meter.module.css";

export interface MeterProps {
  /**
   * How full the bar is, 0..1. Values outside are clamped rather than rejected.
   *
   * Every current caller computes this by division, and at least one divides by
   * a budget that is zero before the first event arrives. A NaN reaching CSS
   * `width` silently collapses the fill to nothing, which reads as "empty" and
   * is indistinguishable from a real zero — so NaN is clamped to 0 here and the
   * caller's `value` string is what tells the truth.
   */
  fraction: number;
  /**
   * The accessible name. Required.
   *
   * A `role="progressbar"` with no accessible name is announced as "progress
   * bar" and nothing else, which is worse than not shipping it.
   */
  label: string;
  /** A CSS variable reference for the fill, e.g. "var(--pbui-tone-step)". */
  tone?: string;
  /** Rendered beside the bar, e.g. "18.2k / 24k". Callers format it. */
  value?: string;
  /**
   * `inline` is a 46px bar for use inside a table cell or a chip row.
   * `row` fills its container and is what a panel wants.
   */
  size?: "inline" | "row";
  /**
   * Turns the fill amber past 0.75 and red past 0.9.
   *
   * Off by default: a meter showing disk usage wants it, a meter showing "12 of
   * 30 lessons done" emphatically does not, and defaulting to alarm would make
   * ordinary progress look like a problem.
   */
  alarm?: boolean;
}

/**
 * A proportional bar. One value against one maximum.
 *
 * The design system had no bar of any kind before DATADROP-11 — `grep` for
 * `progressbar`, `Meter` or `ProgressBar` across `ui/src` returned nothing —
 * which is why several panels resorted to printing "18.2k / 24k" as text and
 * leaving the reader to do the division.
 *
 * Deliberately dumb, per the Chip convention: no context, no click handling, no
 * knowledge of what it measures. Wrap it in `<Presentation>` if the thing it
 * measures is an object.
 */
export function Meter({ fraction, label, tone, value, size = "row", alarm = false }: MeterProps) {
  const safe = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0;
  const level = !alarm ? "ok" : safe > 0.9 ? "high" : safe > 0.75 ? "warn" : "ok";

  return (
    <span className={[styles.meter, styles[size]].join(" ")}>
      <span
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(safe * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className={styles.fill}
          data-level={level}
          style={{
            width: `${safe * 100}%`,
            ...(tone && level === "ok" ? { background: tone } : {}),
          }}
        />
      </span>
      {value ? <span className={styles.value}>{value}</span> : null}
    </span>
  );
}
