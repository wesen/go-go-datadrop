import type { ElementType, ReactNode } from "react";
import styles from "./Text.module.css";

/**
 * Typography, as a small closed set of roles.
 *
 * There is no CSS framework (DR-13), so the type scale is enforced here rather
 * than by utility classes: a component that wants 12.5px text has to say why in
 * a review, because there is no token for it.
 */

export type TextSize = "micro" | "tiny" | "small" | "base" | "title";
export type TextTone = "default" | "faint" | "danger" | "ok";

export interface TextProps {
  children: ReactNode;
  size?: TextSize;
  tone?: TextTone;
  strong?: boolean;
  /** Looser leading, for paragraphs rather than dense chrome. */
  prose?: boolean;
  /** One line, ellipsised. Pass `title` as well so the full value survives. */
  truncate?: boolean;
  /** The element to render. Defaults to <span>. */
  as?: ElementType;
  title?: string;
  className?: string;
  id?: string;
}

export function Text({
  children,
  size = "base",
  tone = "default",
  strong = false,
  prose = false,
  truncate = false,
  as: Tag = "span",
  title,
  className,
  id,
}: TextProps) {
  const classes = [
    styles.text,
    styles[size],
    styles[tone],
    strong ? styles.strong : "",
    prose ? styles.prose : "",
    truncate ? styles.truncate : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} title={title} id={id}>
      {children}
    </Tag>
  );
}

/**
 * The uppercase structural label: SOURCE, DOC, GEOM, OUT.
 *
 * Its own component rather than a Text variant because it is a *structural*
 * role — it names a region — and giving it a name stops uppercase-plus-tracking
 * being reached for as decoration elsewhere (§10.3 rule 6).
 */
export function SectionLabel({
  children,
  as: Tag = "span",
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag className={[styles.text, styles.label, className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}
