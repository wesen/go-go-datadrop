import { VisuallyHidden } from "../components/foundation/VisuallyHidden";
import { PARTS } from "./parts";
import { usePbui } from "./usePbui";
import styles from "./pbui.module.css";

/**
 * The mouse documentation line, straight out of Genera.
 *
 * A permanently visible strip describing whatever is under the pointer and
 * stating what each button will do to it. It is what makes the interface
 * self-explaining: nothing needs to be memorised and no tooltip needs hunting.
 *
 * The `aria-live` mirror is the single most valuable line of accessibility work
 * in the project — the thing that makes the interface self-documenting for a
 * sighted user becomes the thing that announces it to a screen reader. The
 * visible copy is aria-hidden so the text is not read twice.
 */
export function MouseDocLine({ ambient }: { ambient?: string }) {
  const pbui = usePbui();

  const mode = pbui.accepting ? "ACCEPT MODE" : "READY";
  const text =
    pbui.mouseDoc ??
    (pbui.accepting
      ? `${pbui.accepting.prompt}   (Esc aborts)`
      : "hover anything · L is the default verb · R opens its menu");

  return (
    <div data-part={PARTS.mouseDoc} className={styles.mouseDoc}>
      <span className={styles.mouseDocMode}>{mode}</span>
      <span className={styles.mouseDocText} aria-hidden="true">
        {text}
      </span>
      <VisuallyHidden live="polite">{text}</VisuallyHidden>
      {ambient && <span className={styles.mouseDocAmbient}>{ambient}</span>}
    </div>
  );
}
