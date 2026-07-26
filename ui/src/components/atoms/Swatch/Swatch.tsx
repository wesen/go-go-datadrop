import styles from "./Swatch.module.css";

/**
 * The colour of a mark, beside the thing it means.
 *
 * A legend entry has to carry the *exact* colour the plot drew, which is why
 * `color` is a resolved value rather than a token name: `buildPlot` is a pure
 * function with no DOM access, so it puts a concrete colour on every mark, and
 * the legend has to agree with it. A legend that disagrees with its marks is a
 * bug that survives review, because both halves look right in isolation.
 *
 * `label` is required and is announced. A colour alone conveys nothing to a
 * screen reader, and nothing on a monochrome display — the legend text beside
 * it is what carries the meaning, so the swatch itself is marked
 * `aria-hidden` and the label rides along in `title`.
 */
export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span
      className={styles.swatch}
      style={{ background: color }}
      title={label}
      aria-hidden="true"
    />
  );
}
