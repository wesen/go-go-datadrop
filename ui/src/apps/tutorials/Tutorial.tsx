import { useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../store";
import { AppBody, Stack } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";

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
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          border: "1.5px solid var(--pbui-ink)",
          background: done ? "var(--pbui-ok)" : "var(--pbui-selected)",
          color: done ? "var(--pbui-paper)" : "var(--pbui-ink)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--pbui-fs-tiny)",
          fontWeight: 700,
        }}
      >
        {done ? "✓" : n}
      </span>
      <Stack gap={2}>
        <Text size="small" prose>
          {children}
        </Text>
        {run && (
          <Stack direction="row" gap={2} align="center">
            <button
              type="button"
              onClick={() => {
                run({ dispatch, state });
                setDone(true);
              }}
              style={{
                border: "1.5px solid var(--pbui-ink)",
                boxShadow: "var(--pbui-shadow-hard)",
                background: done ? "var(--pbui-pane-alt)" : "var(--pbui-tone-geom)",
                padding: "0 var(--pbui-space-4)",
                fontSize: "var(--pbui-fs-small)",
                fontWeight: 700,
              }}
            >
              ▶ {runLabel ?? "do it for me"}
            </button>
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
