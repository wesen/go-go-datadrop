import { useEffect, useRef, type ReactNode } from "react";
import type { PresentationType } from "../../../pbui/types";
import { Chip } from "../../atoms";
import { Text } from "../../foundation";
import styles from "./ResultLog.module.css";

export type ResultSegment =
  | { kind: "text"; text: string }
  | {
      kind: "object";
      ptype: PresentationType;
      value: unknown;
      /**
       * What to draw. Required, and the caller supplies it.
       *
       * The alternative is for this component to call `labelFor`, which needs a
       * `PbuiEnvironment` it has no business holding — and holding one would
       * make the molecule unstoryable without a provider, which is the exact
       * cost phase 6 paid when `TracePanel` grew a presentation.
       */
      label: string;
      tone?: string;
    };

export interface ResultLine {
  id: string;
  segments: ResultSegment[];
  /** The echoed command rather than its result: dimmed and prefixed. */
  echo?: boolean;
}

export interface ResultLogProps {
  lines: ResultLine[];
  /**
   * Wraps an object segment so the caller can make it live.
   *
   * The same seam `Legend` uses for `renderEntry` and `SegmentedBar` for
   * `renderSegment` (DR-38). Without a wrapper the objects still render — as
   * chips — they simply do nothing when clicked, which is what makes this
   * component storyable with no provider.
   */
  renderObject?: (
    segment: Extract<ResultSegment, { kind: "object" }>,
    body: ReactNode,
  ) => ReactNode;
  /** Scroll to the newest line as lines arrive. */
  follow?: boolean;
  /** The accessible name for the log. */
  label: string;
  /** Shown when there are no lines. */
  empty?: ReactNode;
}

/**
 * An output history whose entries are objects rather than strings.
 *
 * This is the idea from the shell prototype's `ListenerApp`
 * (`pbui-shell(1).jsx:376-441`), and it is the half of a CLIM listener that
 * matters. The reading and the evaluating are ordinary; the *printing* is not:
 *
 * ```js
 * w.print([{ text: "3 + 4 = " }, { ptype: "number", value: 7 }]);
 * ```
 *
 * The result is a live presentation, so the output history becomes a source of
 * input for the next command — sum two numbers, then point at the answer as an
 * argument to the next sum. The prototype's own prompt says so: *"click a
 * NUMBER — numbers app, notes, prior results all work."*
 *
 * We already had the hard half. The accept protocol is real in `pbui/`. What was
 * missing was anywhere that output is objects: `TracePanel` prints
 * `entry.detail` as text, and that is the whole trace.
 */
export function ResultLog({ lines, renderObject, follow = true, label, empty }: ResultLogProps) {
  const end = useRef<HTMLDivElement>(null);

  // Keyed on length, not on `lines`: editing an existing line must not yank the
  // viewport away from whatever the reader was looking at. Same reasoning as
  // TracePanel's scroll effect, and the same reason `block: "nearest"` — it
  // scrolls only when the anchor is actually out of view, so a reader who has
  // scrolled up to read history is not fighting the component.
  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, follow]);

  if (lines.length === 0) {
    return (
      <div className={styles.log} role="log" aria-label={label}>
        <Text size="small" tone="faint">
          {empty ?? "Nothing yet."}
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.log} role="log" aria-label={label}>
      {/* Segment keys are indices. Segments have no identity of their own, a
          line is rewritten wholesale rather than reordered in place, and the
          line itself is keyed by id — so the usual index-key hazard (React
          reusing state across a reorder) cannot arise. */}
      {lines.map((line) => (
        <div key={line.id} className={styles.line} data-echo={line.echo ? "true" : undefined}>
          {line.echo ? (
            <span className={styles.prompt} aria-hidden="true">
              ›{" "}
            </span>
          ) : null}
          {line.segments.map((segment, i) =>
            segment.kind === "text" ? (
              <span key={i} className={styles.text}>
                {segment.text}
              </span>
            ) : (
              <span key={i} className={styles.object}>
                {renderObject ? (
                  renderObject(segment, <Chip label={segment.label} tone={segment.tone} />)
                ) : (
                  <Chip label={segment.label} tone={segment.tone} />
                )}
              </span>
            ),
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
