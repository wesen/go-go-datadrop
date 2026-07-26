import { useEffect, useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
import type { Goal } from "../../../appkit/lessons";
import type { RootState } from "../../../store";
import { Button } from "../../atoms";
import { Text } from "../../foundation";
import { Callout, GoalItem, HintList } from "../../molecules";
import { RailHeader } from "../LessonRail/RailHeader";
import { wedgeOf } from "../LessonRail/wedge";
import styles from "../LessonRail/LessonRail.module.css";

/**
 * The capstone: one question, some goals, and no ▶.
 *
 * The rail teaches; this asks. There are no steps, no ordering and no "do it
 * for me" — a question, a workbench, and a list of things that have to be true
 * when the reader is finished. The goals tick by watching the world, so **any
 * route that reaches the same state counts**, including one nobody wrote down.
 *
 * It shares `RailHeader` and the stylesheet with `LessonRail` rather than
 * copying either, because they are visibly the same panel and two copies is how
 * they end up differing by half a pixel of tracking that nobody chose.
 *
 * The completion message is deliberately the last thing a reader sees, and it
 * says the thing the whole tour has been building to: *nothing above was a
 * special tutorial mode — this panel is the application.*
 */
export function BriefChecklist({
  question,
  goals,
  hints,
  onReset,
}: {
  question: ReactNode;
  goals: Goal[];
  hints: ReactNode[];
  onReset?: () => void;
}) {
  const state = useSelector((s: RootState) => s);
  // `| undefined` for the same reason as LessonRail's: a lookup can miss.
  const [done, setDone] = useState<Record<string, true | undefined>>({});
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setDone((prev) => {
      let next = prev;
      for (const goal of goals) {
        if (next[goal.id]) continue;
        let ok = false;
        try {
          ok = goal.done(state);
        } catch {
          ok = false;
        }
        if (ok) next = { ...next, [goal.id]: true };
      }
      return next;
    });
  }, [state, goals]);

  const met = goals.filter((goal) => done[goal.id]).length;
  const wedge = wedgeOf(state);

  return (
    <div className={styles.rail}>
      <RailHeader title="The brief" completed={met} total={goals.length} onReset={onReset} />

      <div className={styles.question}>
        <Text size="base" prose>
          {question}
        </Text>
      </div>

      {wedge && (
        <div className={styles.wedge}>
          <Callout variant="warning" title="Stuck">
            {wedge}{" "}
            {onReset && (
              <Button variant="bare" onClick={onReset}>
                ↺ start over
              </Button>
            )}
          </Callout>
        </div>
      )}

      <div className={styles.goals}>
        {goals.map((goal) => (
          <GoalItem key={goal.id} done={!!done[goal.id]}>
            {goal.label}
          </GoalItem>
        ))}

        {met === goals.length && goals.length > 0 && (
          <div className={styles.finale}>
            <Callout variant="ok" title="That is the whole system">
              Live objects, typed verbs, one shared world, any number of compositions over it.
              Nothing above was a special tutorial mode — this panel is the application.
            </Callout>
          </div>
        )}

        <div className={styles.hints}>
          <HintList hints={hints} shown={shown} onReveal={() => setShown((n) => n + 1)} />
        </div>
      </div>
    </div>
  );
}
