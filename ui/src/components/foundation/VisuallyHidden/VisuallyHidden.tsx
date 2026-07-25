import type { ReactNode } from "react";
import styles from "./VisuallyHidden.module.css";

/**
 * Present to assistive technology, absent from the screen.
 *
 * The workbench needs this more than most interfaces: the mouse documentation
 * line is what makes a presentation-based UI self-explaining, and it is
 * useless to a screen reader unless it is also announced (§15). This is the
 * component that carries it.
 *
 * `clip-path` plus a 1px box rather than `display: none` or `visibility:
 * hidden`, both of which remove the element from the accessibility tree — which
 * is the exact opposite of what is wanted.
 */
export function VisuallyHidden({
  children,
  live,
  id,
}: {
  children: ReactNode;
  /** Announce changes to this region as they happen. */
  live?: "polite" | "assertive";
  id?: string;
}) {
  return (
    <span className={styles.hidden} aria-live={live} id={id}>
      {children}
    </span>
  );
}
