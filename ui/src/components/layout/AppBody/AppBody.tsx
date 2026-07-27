import type { ReactNode } from "react";
import styles from "./AppBody.module.css";

/** The scrolling body of a tile application. See the CSS for the flex pairing. */
export function AppBody({
  children,
  flush = false,
  className,
}: {
  children: ReactNode;
  /** No padding — for a table that draws to its own edges. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[styles.body, flush ? styles.flush : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
