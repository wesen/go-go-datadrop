import type { ReactNode } from "react";
import styles from "./Kbd.module.css";

/**
 * A key cap, for the mouse-doc line and the tutorials.
 *
 * A presentation-based interface documents itself continuously, and a good deal
 * of that documentation names keys: Esc aborts an accept, Enter runs the
 * highlighted verb. Those need to read as keys rather than as prose.
 */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
