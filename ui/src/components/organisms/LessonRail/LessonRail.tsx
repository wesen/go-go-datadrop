import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import type { Lesson } from "../../../appkit/lessons";
import { usePbui } from "../../../pbui";
import type { AppDispatch, RootState } from "../../../store";
import { Button, type TickState } from "../../atoms";
import { Text } from "../../foundation";
import { Callout, LessonStep, PredictPrompt } from "../../molecules";
import styles from "./LessonRail.module.css";
import { RailHeader } from "./RailHeader";
import { wedgeOf } from "./wedge";

/**
 * A rail of lesson steps that tick themselves off by watching the world.
 *
 * The completion loop below is DR-50, and everything interesting about the
 * teaching layer follows from it. A step is complete when a **predicate over
 * `RootState`** says so — not when a button was pressed — so any route to the
 * goal counts, including routes nobody wrote down. A step that says "filter to
 * one species" ticks for the pipeline's `+ filter…` button, for right-clicking
 * a legend swatch, for right-clicking a mark, and for a field chip's object
 * menu, because all four write the same step into the same document.
 *
 * Four properties fall out, each of them deliberate:
 *
 *  - **A predicate that throws is false, not a crash.** The reader is free to
 *    delete the document a predicate names; that is a legal move.
 *  - **Completion is monotonic.** Undoing your filter does not reopen the step.
 *    Right for a tutorial, wrong for a validator, and this is a tutorial.
 *  - **Watched is distinguished from did.** Pressing ▶ records that fact, so if
 *    the predicate then goes true the tick is grey and labelled rather than
 *    green. Watching is not the same as knowing.
 *  - **It renders inside the instance's `PbuiProvider`** (DR-55), which is what
 *    lets a ▶ runner call `accept()` and demonstrate the accept protocol rather
 *    than describe it.
 *
 * There is no probe. The prototype needs one (`pbui-landing.jsx:1667-1674`, a
 * ref written during render) because its layout lives in the shell's
 * `useState`; ours lives in the same store as the world, so one `useSelector`
 * gives a predicate both halves.
 */
export function LessonRail({ lessons, onReset }: { lessons: Lesson[]; onReset?: () => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const pbui = usePbui();

  /**
   * The whole state, and the cost is named rather than hidden.
   *
   * This re-renders the rail on every store change, including each keystroke in
   * a step editor. Acceptable here — the rail is five to seven collapsed rows —
   * and it is the honest way to support arbitrary predicates. It would not be
   * acceptable in a tile, and no tile does it.
   */
  const state = useSelector((s: RootState) => s);

  /**
   * `| undefined` in the value type is load-bearing, not decoration.
   *
   * `Record<string, "self" | "watched">` makes TypeScript believe every key is
   * present, so `done[id] ?? "pending"` narrows to `"self" | "watched"` and the
   * later `=== "pending"` is reported as a comparison with no overlap. Saying
   * that a lookup can miss is the honest type and it makes the fallback real.
   */
  const [done, setDone] = useState<Record<string, "self" | "watched" | undefined>>({});
  const [open, setOpen] = useState<string | null>(lessons[0]?.id ?? null);
  const ranRef = useRef<Record<string, true>>({});

  useEffect(() => {
    setDone((prev) => {
      let next = prev;
      for (const lesson of lessons) {
        if (next[lesson.id] || !lesson.done) continue;
        let ok = false;
        try {
          ok = lesson.done(state);
        } catch {
          ok = false;
        }
        if (ok) {
          next = { ...next, [lesson.id]: ranRef.current[lesson.id] ? "watched" : "self" };
        }
      }
      // An identity return ends the update rather than scheduling another.
      return next;
    });
  }, [state, lessons]);

  /**
   * When the open step completes, open the next incomplete one.
   *
   * **Except when it was watched**, and that exception is the point rather than
   * an edge case. A watched step's body carries the follow-up — *you watched
   * this one; try the same move by hand in the panel* — and advancing past it
   * means that sentence is written, rendered, and never read. Worse, it makes
   * pressing ▶ feel like progress, which is the exact incentive the watched
   * state exists to remove: the reader gets a tick and a new step, and the
   * nudge to actually do it is gone before they look up.
   *
   * Found in a browser. The unit tests were green and the story rendered
   * correctly; what they could not show is that a string I had written was
   * unreachable.
   *
   * Wrapping to the first incomplete step keeps a reader who worked backwards
   * from staring at a finished list.
   */
  useEffect(() => {
    if (!open) return;
    if (done[open] !== "self") return;
    const index = lessons.findIndex((lesson) => lesson.id === open);
    const next =
      lessons.slice(index + 1).find((lesson) => !done[lesson.id]) ??
      lessons.find((lesson) => !done[lesson.id]);
    if (next && next.id !== open) setOpen(next.id);
  }, [done, open, lessons]);

  const run = useCallback(
    async (lesson: Lesson) => {
      if (!lesson.run) return;
      ranRef.current[lesson.id] = true;
      await lesson.run({
        dispatch,
        getState: () => store.getState(),
        accept: pbui.accept,
      });
    },
    [dispatch, store, pbui],
  );

  const completed = lessons.filter((lesson) => done[lesson.id]).length;
  const wedge = wedgeOf(state);

  return (
    <div className={styles.rail}>
      <RailHeader completed={completed} total={lessons.length} onReset={onReset} />

      {wedge && (
        <div className={styles.wedge}>
          <Callout variant="warning" title="The panel is stuck">
            {wedge}{" "}
            {onReset && (
              <Button variant="bare" onClick={onReset}>
                ↺ start this panel over
              </Button>
            )}
          </Callout>
        </div>
      )}

      <div className={styles.steps}>
        {lessons.map((lesson, index) => {
          const tick: TickState = done[lesson.id] ?? "pending";
          const isOpen = open === lesson.id;
          return (
            <LessonStep
              key={lesson.id}
              n={index + 1}
              title={lesson.title}
              state={tick}
              open={isOpen}
              onToggle={() => setOpen(isOpen ? null : lesson.id)}
              actions={
                tick === "pending" ? (
                  <>
                    {lesson.run && (
                      <Button variant="raised" onClick={() => void run(lesson)}>
                        ▶ do it for me
                      </Button>
                    )}
                    {lesson.manual && (
                      <Button
                        variant="raised"
                        fill="var(--pbui-tone-source)"
                        onClick={() => setDone((d) => ({ ...d, [lesson.id]: "self" }))}
                      >
                        ✓ got it
                      </Button>
                    )}
                    {lesson.run && (
                      <Text size="tiny" tone="faint">
                        — or do it yourself, and this ticks green
                      </Text>
                    )}
                  </>
                ) : tick === "watched" ? (
                  <Text size="tiny" tone="faint">
                    you watched this one. try the same move by hand in the panel.
                  </Text>
                ) : null
              }
            >
              {lesson.body}
              {lesson.predict && (
                <PredictPrompt
                  question={lesson.predict.q}
                  options={lesson.predict.options}
                  answer={lesson.predict.answer}
                  reveal={lesson.predict.reveal}
                />
              )}
            </LessonStep>
          );
        })}
      </div>
    </div>
  );
}
