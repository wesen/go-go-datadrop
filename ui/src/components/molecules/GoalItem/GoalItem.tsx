import type { ReactNode } from "react";
import { StateGlyph } from "../../atoms";
import { Text } from "../../foundation";
import styles from "./GoalItem.module.css";

/**
 * One goal in the capstone brief: satisfied, or not yet.
 *
 * Differs from `LessonStep` in three ways that are all the same way — the brief
 * has no ordering, no prose body and no ▶ button. It states a thing that has to
 * be true when you are finished and then watches for it. There is nothing to
 * expand because there is nothing to tell you.
 *
 * Completed goals fade rather than vanish, because the list is the brief: a
 * reader three goals in needs to see what they have done as much as what is
 * left, and a shrinking list would keep re-flowing under their eye.
 */
export function GoalItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <div className={styles.goal}>
      <StateGlyph state={done ? "ok" : "pending"} label={done ? "satisfied" : "not yet"} />
      <span className={done ? styles.met : undefined}>
        <Text size="small" prose>
          {children}
        </Text>
      </span>
    </div>
  );
}
