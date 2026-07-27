import type { ElementType, ReactNode } from "react";
import styles from "./Stack.module.css";

/**
 * One-direction flex with a token gap.
 *
 * `min-width: 0` and `min-height: 0` are on the base class deliberately. A flex
 * child defaults to `min-width: auto`, which refuses to shrink below its content
 * — so a long dotted field path inside a tile pushes the tile wider than its
 * split allows, and the whole layout drifts. It is the single most common
 * flexbox bug and it is cheaper to prevent everywhere than to diagnose once.
 */
export interface StackProps {
  children: ReactNode;
  direction?: "row" | "column";
  gap?: 0 | 1 | 2 | 3 | 4 | 5;
  align?: "start" | "center" | "baseline" | "stretch";
  justify?: "start" | "between" | "end";
  wrap?: boolean;
  /** Take the remaining space in a parent Stack. */
  grow?: boolean;
  as?: ElementType;
  className?: string;
}

export function Stack({
  children,
  direction = "column",
  gap = 2,
  align,
  justify,
  wrap = false,
  grow = false,
  as: Tag = "div",
  className,
}: StackProps) {
  const classes = [
    styles.stack,
    direction === "row" ? styles.row : styles.column,
    styles[`gap-${gap}`],
    align ? styles[`align-${align}`] : "",
    justify ? styles[`justify-${justify}`] : "",
    wrap ? styles.wrap : "",
    grow ? styles.grow : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}
