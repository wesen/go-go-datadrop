import type { ReactNode } from "react";
import { Button, Tick, type TickState } from "../../atoms";
import { Text } from "../../foundation";
import styles from "./LessonStep.module.css";

/**
 * One disclosure row in a lesson rail: a tick, a title, and a body that opens.
 *
 * Presentational, and knows nothing about what a lesson means — no predicate,
 * no dispatch, no store. It is handed a state and two callbacks. That is what
 * lets it be storyable in every state at once, which the rail itself cannot do:
 * a rail can only show the states its reader has actually reached.
 *
 * The WATCHED label beside a watched tick is text rather than colour, and it is
 * doing real work. `Tick` renders that state in line-grey rather than green,
 * but grey-versus-green is a distinction a colour-blind reader may not make and
 * a printed page will not carry at all (WCAG 1.4.1). The word is the signal;
 * the grey is reinforcement.
 */
export function LessonStep({
  n,
  title,
  state,
  open,
  onToggle,
  children,
  actions,
}: {
  n: number;
  title: string;
  state: TickState;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  /** The ▶ / ✓ got it row. Absent once the step is complete. */
  actions?: ReactNode;
}) {
  const bodyId = `lesson-body-${n}`;
  return (
    <div className={[styles.step, open ? styles.open : ""].filter(Boolean).join(" ")}>
      <Button
        variant="bare"
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <Tick state={state} n={n} />
        <span className={[styles.title, open ? styles.strong : ""].filter(Boolean).join(" ")}>
          {title}
        </span>
        {state === "watched" && (
          <Text size="tiny" tone="faint">
            <span className={styles.watched}>WATCHED</span>
          </Text>
        )}
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </Button>

      {open && (
        <div className={styles.body} id={bodyId}>
          <Text size="small" prose>
            {children}
          </Text>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </div>
  );
}
