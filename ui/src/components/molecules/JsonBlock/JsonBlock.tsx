import styles from "./JsonBlock.module.css";

export interface JsonBlockProps {
  value: unknown;
  /**
   * Rendered height in px before the block scrolls, or "none" to flow at full
   * height inside a container that scrolls for it.
   *
   * "none" rather than a large number, because a panel whose AppBody already
   * scrolls must not nest a second scroller — a <pre> with its own scrollbar
   * inside a tile that has one is the shape of scrolling nobody can use.
   */
  maxHeight?: number | "none";
}

/**
 * A JSON value, pretty-printed.
 *
 * Extracted from `InspectorPanel.tsx`, which inlined the `<pre>`. One component
 * rather than a copied element for two reasons: it is where folding will go if
 * we ever want it, and it is where the stringify guard belongs.
 *
 * That guard is not hypothetical. A descriptor's `describe()` is *supposed* to
 * return JSON-serialisable data, and `pbui/types.ts` says so — but "supposed to"
 * is not "does", and `JSON.stringify` throws on a circular reference and on a
 * BigInt. An inspector that throws takes the whole tile down with it, and the
 * tile it takes down is the one you opened to find out what was wrong.
 */
export function JsonBlock({ value, maxHeight = 220 }: JsonBlockProps) {
  let text: string;
  let failed = false;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch (error) {
    failed = true;
    text = `⚠ this value cannot be shown as JSON — ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  return (
    <pre
      className={styles.block}
      data-failed={failed ? "true" : undefined}
      style={maxHeight === "none" ? undefined : { maxHeight }}
    >
      {text}
    </pre>
  );
}
