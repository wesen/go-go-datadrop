import type { ReactNode } from "react";
import { Button } from "../../atoms";
import { Text } from "../../foundation";
import { clamp } from "../../../model/format";
import styles from "./TransportBar.module.css";

export interface TransportBarProps {
  /** How many entries there are. Zero disables every control. */
  length: number;
  /** The current position, 0-based. Clamped on the way out, not on the way in. */
  cursor: number;
  onCursor: (next: number) => void;
  /** A short description of the entry under the cursor. */
  currentLabel?: ReactNode;
  /**
   * The limitation, stated on screen.
   *
   * Not decoration. This transport selects and explains an entry; it does not
   * roll the workbench back to that moment. An interface that looks like time
   * travel and is not is worse than one that says plainly what it is, because
   * the reader's next action depends on which it is.
   */
  note?: ReactNode;
}

/**
 * A cursor into a history.
 *
 * The design system had no such control. The trace was a write-only log —
 * rendered top to bottom, with no way to ask about any single entry — and the
 * only thing missing to make it navigable was this.
 *
 * Bounds are enforced in one place, in the handler, rather than by four
 * disabled-button conditions that drift apart. The buttons still disable, but
 * from the same clamped arithmetic that would have corrected them anyway.
 */
export function TransportBar({ length, cursor, onCursor, currentLabel, note }: TransportBarProps) {
  const last = Math.max(0, length - 1);
  const at = clamp(cursor, 0, last);
  const go = (next: number) => onCursor(clamp(next, 0, last));
  const empty = length === 0;

  return (
    <div className={styles.transport}>
      <div className={styles.controls}>
        <Button
          variant="framed"
          size="tiny"
          onClick={() => go(0)}
          disabled={empty || at === 0}
          aria-label="first entry"
        >
          ⏮
        </Button>
        <Button
          variant="framed"
          size="tiny"
          onClick={() => go(at - 1)}
          disabled={empty || at === 0}
          aria-label="previous entry"
        >
          ◀
        </Button>
        <Button
          variant="framed"
          size="tiny"
          onClick={() => go(at + 1)}
          disabled={empty || at === last}
          aria-label="next entry"
        >
          ▶
        </Button>
        <Button
          variant="framed"
          size="tiny"
          onClick={() => go(last)}
          disabled={empty || at === last}
          aria-label="last entry"
        >
          ⏭
        </Button>

        <input
          className={styles.scrub}
          type="range"
          min={0}
          max={last}
          value={at}
          disabled={empty}
          onChange={(event) => go(Number(event.target.value))}
          aria-label="position in the trace"
        />

        <span className={styles.position}>{empty ? "—" : `${at + 1} / ${length}`}</span>
      </div>

      {currentLabel ? <div className={styles.current}>{currentLabel}</div> : null}

      {note ? (
        <Text size="tiny" tone="faint">
          {note}
        </Text>
      ) : null}
    </div>
  );
}
