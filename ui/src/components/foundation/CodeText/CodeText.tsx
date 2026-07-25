import type { ReactNode } from "react";
import styles from "./CodeText.module.css";

/**
 * A machine value rendered as one: an id, a digest, a path, an issuer URL.
 *
 * The whole interface is already monospace, so this is not about the family.
 * It is about the *claim*: `kf83nd02mzq4x` is a token id, not a word, and
 * marking it says so to a reader and to a screen reader both. Nine sites wrote
 * `<code>` with a local `style` object to say the same thing.
 *
 * `wrapAnywhere` exists for the one-time token secret and for sha256 digests:
 * a 64-character hex string with no break opportunity will push a panel wider
 * than its tile rather than wrapping, because there is nothing in it a browser
 * considers a word boundary.
 */
export function CodeText({
  children,
  size = "small",
  wrapAnywhere = false,
  selectable = true,
  title,
}: {
  children: ReactNode;
  size?: "tiny" | "small" | "base";
  /** For digests and secrets, which contain no break opportunity. */
  wrapAnywhere?: boolean;
  /** False for values that are illustrative rather than copyable. */
  selectable?: boolean;
  title?: string;
}) {
  return (
    <code
      className={[
        styles.code,
        styles[size],
        wrapAnywhere ? styles.wrapAnywhere : "",
        selectable ? "" : styles.noselect,
      ]
        .filter(Boolean)
        .join(" ")}
      title={title}
    >
      {children}
    </code>
  );
}
