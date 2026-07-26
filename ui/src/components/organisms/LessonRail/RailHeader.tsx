import { Button } from "../../atoms";
import { Text } from "../../foundation";
import styles from "./LessonRail.module.css";

/**
 * The bar across the top of a rail or a brief: a name, a count, and ↺.
 *
 * Shared by `LessonRail` and `BriefChecklist` because they are the same bar,
 * and a second copy is how two of them end up different (DATADROP-6 §7.2 found
 * six copies of one style object split 9.5px/10.5px, a divergence nobody
 * chose).
 *
 * ↺ resets by *remount*: the section changes the instance's `key` and React
 * throws the subtree away, taking the store with it. There is no `reset()` and
 * there should not be — a reset that walks state back is a reset that can leave
 * a fragment behind, and the fragment is always in the thing you did not think
 * to walk back.
 */
export function RailHeader({
  title,
  completed,
  total,
  onReset,
}: {
  title: string;
  completed: number;
  total: number;
  onReset?: () => void;
}) {
  const finished = completed === total && total > 0;
  return (
    <div className={styles.header}>
      <Text size="tiny" strong>
        <span className={styles.headerTitle}>{title}</span>
      </Text>
      <span className={styles.spacer} />
      <Text size="tiny" strong>
        {/*
          The count is announced as prose rather than left as "3/5", which a
          screen reader reads as "three slash five" or, worse, as a date.
        */}
        <span className={finished ? styles.finished : styles.progress} aria-hidden="true">
          {completed}/{total}
        </span>
        <span className={styles.srOnly}>
          {completed} of {total} complete
        </span>
      </Text>
      {onReset && (
        <Button variant="framed" size="tiny" onClick={onReset} title="reset this panel to how it started">
          ↺ reset
        </Button>
      )}
    </div>
  );
}
