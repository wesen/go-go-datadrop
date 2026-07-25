import { useEffect } from "react";
import { PARTS } from "./parts";
import { usePbui } from "./usePbui";
import styles from "./pbui.module.css";

/**
 * The banner shown while a command is waiting for an object.
 *
 * Unmissable on purpose. Accept mode changes what the left mouse button does to
 * every presentation on screen, and a mode change that is not advertised is a
 * trap.
 *
 * It also states that the mode reaches across tiles and workspaces, which is
 * the non-obvious and genuinely useful part: you can switch workspace mid-accept
 * and click a chip there.
 */
export function AcceptBanner() {
  const pbui = usePbui();
  const accepting = pbui.accepting;

  useEffect(() => {
    if (!accepting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        pbui.abortAccept();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accepting, pbui]);

  if (!accepting) return null;

  const wanted = Array.isArray(accepting.ptype) ? accepting.ptype.join(" | ") : accepting.ptype;

  return (
    <div
      data-part={PARTS.acceptBanner}
      className={styles.acceptBanner}
      role="status"
      aria-live="assertive"
    >
      <span>ACCEPTING &lt;{wanted}&gt;</span>
      <span>{accepting.prompt}</span>
      <span style={{ marginLeft: "auto" }}>works across tiles and workspaces · Esc aborts</span>
    </div>
  );
}
