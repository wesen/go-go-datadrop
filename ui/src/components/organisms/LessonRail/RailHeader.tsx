import { Button } from "../../atoms";
import { Text } from "../../foundation";
import { Toolbar } from "../../layout";
import styles from "./LessonRail.module.css";

/**
 * The progress count and the reset control. No title.
 *
 * The title used to be here, in an inverted bar, back when a rail was a panel
 * beside the workbench and had to name itself. It is a **tile** now, and a tile
 * already has a title bar — so the panel was drawing a second one directly
 * beneath the first, saying the same word. The frame it drew inside the tile's
 * frame was the same mistake in the other axis.
 *
 * What is left is what has no other home: how far through you are, and ↺. A
 * light toolbar rather than an inverted bar, because the tile's title bar is
 * the loud element and two competing for that role is what made the nesting
 * obvious in the first place.
 *
 * ↺ resets by *remount*: the section changes the instance's `key` and React
 * throws the subtree away, taking the store with it. There is no `reset()` and
 * there should not be — a reset that walks state back can leave a fragment
 * behind, and the fragment is always in the thing you did not think to walk
 * back.
 */
export function RailHeader({
  completed,
  total,
  onReset,
}: {
  completed: number;
  total: number;
  onReset?: () => void;
}) {
  const finished = completed === total && total > 0;
  return (
    <Toolbar tight bordered>
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
      <span className={styles.spacer} />
      {onReset && (
        <Button
          variant="framed"
          size="tiny"
          onClick={onReset}
          title="reset this panel to how it started"
        >
          ↺ reset
        </Button>
      )}
    </Toolbar>
  );
}
