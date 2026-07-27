import type { ReactNode } from "react";
import { Text } from "../../foundation";
import styles from "./SegmentedBar.module.css";

export interface Segment {
  id: string;
  /**
   * Determines width. Not a percentage — the component normalises against the
   * sum, or against `total` when one is given.
   */
  weight: number;
  /** A CSS variable reference. */
  tone: string;
  /** Used for the title attribute and by the caller's presentation wrapper. */
  label: string;
  /** Drawn with an inset outline: protected from whatever prunes this list. */
  pinned?: boolean;
  /** Drawn at reduced opacity: present but diminished. */
  dimmed?: boolean;
}

export interface SegmentedBarProps {
  segments: Segment[];
  /**
   * The full extent of the bar. When it exceeds the sum of the weights, the
   * remainder is drawn as hatched headroom.
   *
   * Omit it and the segments fill the bar completely, which is right for a
   * composition ("what is this made of") and wrong for a budget ("how much is
   * left"). The two questions want different pictures and this is the switch.
   */
  total?: number;
  /**
   * Wraps each segment's body. Return the wrapped element; the bar keeps the
   * geometry.
   *
   * This is the seam that keeps the molecule provider-free, the same one
   * `Legend` uses for `renderEntry` (DR-38). A caller that wants each segment to
   * be a live presentation wraps it here. If this component ever imports
   * `Presentation` itself, policy has moved into a layout primitive.
   */
  renderSegment?: (segment: Segment, body: ReactNode) => ReactNode;
  /** The accessible name for the bar. */
  label: string;
  /** Rendered above the bar on the right, e.g. "18.2k / 24k · 76%". */
  summary?: ReactNode;
}

/**
 * One bar divided into proportional segments, each independently addressable.
 *
 * Nothing else in the design system composes objects spatially like this. A
 * `Legend` lists them, a `Meter` measures one thing, a chart draws marks in a
 * coordinate space — this lays a set of objects side by side *in proportion*,
 * so that relative size is the primary reading and identity is still available
 * on each piece.
 *
 * Widths are flex weights rather than percentages. Percentages accumulate
 * rounding error across many segments and leave a visible gap at the right
 * edge; `flex: <weight> 0 0` distributes the remainder for us.
 */
export function SegmentedBar({
  segments,
  total,
  renderSegment,
  label,
  summary,
}: SegmentedBarProps) {
  const sum = segments.reduce((acc, s) => acc + Math.max(0, s.weight), 0);
  // Headroom only when a total was given AND it is not already exceeded. An
  // over-full bar shows no headroom rather than a negative-width element.
  const headroom = total !== undefined ? Math.max(0, total - sum) : 0;
  // Overflow is signalled, not drawn. Flex distributes the available width in
  // proportion to the weights and cannot represent "wider than the container",
  // so an over-budget bar has the SAME segment geometry as an exactly-full one
  // and the border plus the OVER badge carry the whole signal. A caller that
  // needs overflow legible as size wants a different widget.
  const over = total !== undefined && sum > total;

  return (
    <div className={styles.wrap}>
      {summary ? <div className={styles.summary}>{summary}</div> : null}
      <div
        className={styles.bar}
        role="img"
        aria-label={label}
        data-over={over ? "true" : undefined}
      >
        {segments.map((segment) => {
          const body = (
            <span
              className={styles.segment}
              data-pinned={segment.pinned ? "true" : undefined}
              data-dimmed={segment.dimmed ? "true" : undefined}
              style={{ background: segment.tone }}
              title={segment.label}
            />
          );
          return (
            <span
              key={segment.id}
              className={styles.slot}
              style={{ flex: `${Math.max(0, segment.weight)} 0 0` }}
            >
              {renderSegment ? renderSegment(segment, body) : body}
            </span>
          );
        })}
        {headroom > 0 ? (
          <span className={styles.headroom} style={{ flex: `${headroom} 0 0` }} title="headroom" />
        ) : null}
        {over ? <span className={styles.overflow}>OVER</span> : null}
      </div>
      {segments.length === 0 ? (
        <Text size="tiny" tone="faint">
          nothing in this bar yet
        </Text>
      ) : null}
    </div>
  );
}
