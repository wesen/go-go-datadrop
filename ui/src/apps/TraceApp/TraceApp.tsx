import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { AppBody, Stack } from "../../components/layout";
import { Text } from "../../components/foundation";

/**
 * Every verb, in order.
 *
 * The audit trail and the teaching device at once: a user who does not
 * understand what a click did can read what it did. Capped at 500 entries and
 * dropping from the front, because at one entry per keystroke a long session is
 * otherwise a memory leak with a scrollbar.
 */
const TONE: Record<string, string> = {
  doc_added: "var(--pbui-tone-doc)",
  doc_activated: "var(--pbui-tone-doc)",
  doc_removed: "var(--pbui-danger)",
  step_added: "var(--pbui-tone-step)",
  step_removed: "var(--pbui-danger)",
  step_toggled: "var(--pbui-tone-step)",
  encoded: "var(--pbui-tone-chart)",
  geom_set: "var(--pbui-tone-chart)",
  source_set: "var(--pbui-tone-source)",
  snapshotted: "var(--pbui-tone-geom)",
  restored: "var(--pbui-tone-geom)",
};

function TraceApp(_props: AppProps) {
  const trace = useSelector((s: RootState) => s.world.trace);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [trace.length]);

  return (
    <AppBody>
      <Stack gap={1}>
        {trace.length === 0 && (
          <Text size="small" tone="faint">
            Nothing yet — map a field, add a step.
          </Text>
        )}
        {trace.map((entry) => (
          <Stack key={entry.seq} direction="row" gap={2} align="baseline">
            <Text size="tiny" tone="faint">
              <span style={{ display: "inline-block", width: 26, textAlign: "right" }}>
                {entry.seq}
              </span>
            </Text>
            <span
              style={{
                background: TONE[entry.type] ?? "var(--pbui-pane-alt)",
                border: "var(--pbui-border-hair)",
                padding: "0 var(--pbui-space-2)",
                fontSize: "var(--pbui-fs-micro)",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {entry.type}
            </span>
            <Text size="tiny">{entry.detail}</Text>
            {entry.note && (
              <Text size="tiny" tone="faint">
                · {entry.note}
              </Text>
            )}
          </Stack>
        ))}
        <div ref={end} />
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "trace",
  title: "trace",
  tone: "var(--pbui-tone-source)",
  docBound: false,
  Component: TraceApp,
});
