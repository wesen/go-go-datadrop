import type { ReactNode } from "react";
import styles from "./Surface.module.css";

/**
 * A bordered region: a tile, a menu, a card, an inset strip.
 *
 * Every visual container in the workbench is one of these, which is how §10.3's
 * first three rules — no radius, borders are 1 or 2px solid ink, shadows are
 * offset and never blurred — end up being true by construction rather than by
 * review.
 */
export function Surface({
  children,
  tone = "pane",
  border = "hair",
  elevation = "flat",
  padding = 0,
  as: Tag = "div",
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: "pane" | "alt" | "selected" | "inverted";
  border?: "none" | "hair" | "firm";
  elevation?: "flat" | "raised" | "floating";
  padding?: 0 | 2 | 3 | 4;
  as?: "div" | "section" | "aside" | "nav";
  className?: string;
  role?: string;
  "aria-label"?: string;
}) {
  const classes = [
    styles.surface,
    tone === "pane" ? "" : styles[tone],
    styles[border],
    elevation === "flat" ? "" : styles[elevation],
    styles[`pad-${padding}`],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
