import type { ReactNode } from "react";
import styles from "./Toolbar.module.css";

/**
 * The strip at the top of a tile or a panel.
 *
 * `flex-shrink: 0` matters: a toolbar that shrinks when its tile gets short
 * collapses its buttons into each other, and the tile body — which is the part
 * that is supposed to scroll — keeps its height instead.
 */
export function Toolbar({
  children,
  bordered = false,
  tight = false,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  bordered?: boolean;
  tight?: boolean;
  as?: "div" | "header" | "nav";
  className?: string;
}) {
  return (
    <Tag
      className={[
        styles.toolbar,
        bordered ? styles.bordered : "",
        tight ? styles.tight : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
