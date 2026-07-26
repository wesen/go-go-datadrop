import { useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../store";
import { AppBody, Stack } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { Button, Tick } from "../../components/atoms";

/**
 * The tutorial machinery.
 *
 * Every step's ▶ button dispatches exactly the actions the interface
 * dispatches. That is the whole design: the tutorial is **executable
 * documentation and therefore cannot silently rot**. Rename an action creator
 * and the tutorial fails to compile, which is a property a screenshot
 * walkthrough can never have — a walkthrough is wrong within a month and tells
 * nobody.
 *
 * It is also why the tutorials are ported early rather than last. They are the
 * cheapest regression test in the project for "do the verbs still do what the
 * prose says they do".
 *
 * ## The four tutorials stay inline (DR-43, re-confirmed)
 *
 * DATADROP-6 phase 6 asks for this decision to be made explicitly rather than
 * by omission. DR-43 said "leave them, and revisit if a fifth tutorial is
 * written", on the grounds that a `Tutorial` organism taking a step DTO would
 * be a generic solution to four specific instances.
 *
 * Two things have happened since, and both support leaving them.
 *
 * **The shared part is already extracted — it is this file.** `TutorialHead`
 * and `TutorialStep` are the machinery; what is left in Tut1 through Tut4 is
 * 70 to 100 lines each of prose and step content, which is the part that is
 * genuinely one-off. There is no second extraction to make, only a DTO to
 * invent.
 *
 * **A fifth teaching surface was written, and it did get the treatment.**
 * DATADROP-7's tour is content in `tour/` behind `LessonRail`, `ModuleRack` and
 * `BriefChecklist` — exactly the shape DR-43 predicted a fifth would need. But
 * it was designed that way from the start rather than retrofitted, which means
 * it is evidence about how to build the *next* teaching surface rather than
 * evidence that these four should be rebuilt.
 *
 * So the four stay. The open question they now raise is not "extract them" but
 * "should they exist at all, given the tour covers the same ground" — a
 * product question, and a different ticket.
 */

export interface TutorialContext {
  dispatch: AppDispatch;
  state: RootState;
}

export function TutorialHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <SectionLabel>{title}</SectionLabel>
      <Text size="small" tone="faint" prose>
        {children}
      </Text>
    </Stack>
  );
}

export function Step({
  n,
  run,
  runLabel,
  children,
}: {
  n: number;
  run?: (ctx: TutorialContext) => void;
  runLabel?: string;
  children: ReactNode;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const state = useSelector((s: RootState) => s);
  const [done, setDone] = useState(false);

  return (
    <Stack direction="row" gap={3} align="start">
      {/*
        Was eleven properties of inline style here until DATADROP-7 phase 4.
        The atom also fixes an accessibility defect the inline version had: it
        was `aria-hidden`, so a screen-reader user got no step number and no
        completion state at all — the numbering existed only for sighted
        readers. `Tick` carries `role="img"` and a described label.
      */}
      <Tick state={done ? "self" : "pending"} n={n} />
      <Stack gap={2}>
        <Text size="small" prose>
          {children}
        </Text>
        {run && (
          <Stack direction="row" gap={2} align="center">
            <Button
              variant="raised"
              fill={done ? "var(--pbui-pane-alt)" : "var(--pbui-tone-geom)"}
              onClick={() => {
                run({ dispatch, state });
                setDone(true);
              }}
            >
              ▶ {runLabel ?? "do it for me"}
            </Button>
            {done && (
              <Text size="tiny" tone="ok">
                done — watch the other tiles, and check the trace
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

export function TutorialBody({ children }: { children: ReactNode }) {
  return (
    <AppBody>
      <Stack gap={4}>{children}</Stack>
    </AppBody>
  );
}
