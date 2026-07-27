import styles from "./CodeLine.module.css";

export type LineOp = "add" | "remove" | "context";

export interface CodeLineProps {
  text: string;
  /**
   * Line number on the "before" side. `null` renders blank.
   *
   * Explicitly `number | null` rather than optional, because "this line does not
   * exist on that side" and "the caller forgot to pass a number" are different
   * facts and only the first should render an empty gutter.
   */
  before?: number | null;
  after?: number | null;
  op?: LineOp;
  /** Blame: a CSS variable reference drawn as a left edge. */
  ownerTone?: string;
  /** Hides the two number gutters — for a plain listing with no diff. */
  bare?: boolean;
}

/**
 * One line of source, with the two line-number gutters a diff needs.
 *
 * The blank-line case is the one that matters and the one that is easy to miss:
 * an empty string must still occupy a full row, so the text renders as a
 * non-breaking space when empty. Without it a diff containing blank lines
 * collapses those rows to zero height and the +/- alignment silently drifts —
 * the diff still looks like a diff, just a wrong one.
 */
export function CodeLine({
  text,
  before = null,
  after = null,
  op = "context",
  ownerTone,
  bare = false,
}: CodeLineProps) {
  return (
    <div
      className={styles.line}
      data-op={op}
      style={ownerTone ? { borderLeftColor: ownerTone } : undefined}
    >
      {bare ? null : (
        <>
          <span className={styles.gutter} aria-hidden="true">
            {before ?? ""}
          </span>
          <span className={styles.gutter} aria-hidden="true">
            {after ?? ""}
          </span>
        </>
      )}
      <span className={styles.sign} aria-hidden="true">
        {op === "add" ? "+" : op === "remove" ? "−" : " "}
      </span>
      <span className={styles.text}>{text === "" ? " " : text}</span>
    </div>
  );
}
