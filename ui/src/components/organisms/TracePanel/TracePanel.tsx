import { useEffect, useRef, useState } from "react";
import type { TraceEntry } from "../../../store/world";
import { Text } from "../../foundation";
import { AppBody, Stack } from "../../layout";
import { Presentation } from "../../../pbui";
import { Sparkline } from "../../atoms";
import { TransportBar } from "../TransportBar";
import styles from "./TracePanel.module.css";

/**
 * The accent per event type.
 *
 * A token name per kind, never a hex value. Anything not listed falls back to
 * the alt surface rather than to a default colour, so a new verb added to the
 * world slice appears in the trace looking unremarkable instead of looking like
 * one of the kinds it is not.
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

/**
 * Every verb, in order.
 *
 * The audit trail and the teaching device at once: a user who does not
 * understand what a click did can read what it did.
 *
 * ## The scroll effect, and why it is keyed on length
 *
 * A trace that does not follow its own tail is a trace you have to scroll to
 * read, which defeats the purpose of watching it while you work. The effect
 * depends on `entries.length` rather than on `entries`, so an edit to an
 * existing entry does not yank the viewport away from whatever the reader was
 * looking at.
 *
 * `block: "nearest"` rather than `"end"`: it scrolls only when the anchor is
 * actually out of view, so a reader who has scrolled up to read history is not
 * fighting the component.
 *
 * ## The cap is not enforced here
 *
 * `TRACE_CAP` lives in the world slice and drops from the front there. A panel
 * that also capped would be a second policy, and the two would disagree the
 * first time either changed.
 */
export function TracePanel({ entries }: { entries: readonly TraceEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  // `null` means "following the tail", which is the state the panel has always
  // been in. A number means the reader has taken hold of the transport. Keeping
  // them distinct is what stops the auto-scroll from fighting a reader who has
  // deliberately scrubbed backwards — the defect DATADROP-7 hit with the tour's
  // auto-advance.
  const [reviewing, setReviewing] = useState<number | null>(null);

  useEffect(() => {
    if (reviewing === null) end.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length, reviewing]);

  const cursor = reviewing ?? Math.max(0, entries.length - 1);
  const current = entries[cursor];

  // One point per entry, so the shape shows where the work happened rather than
  // what it was. Verb kinds are nominal; their ordinal position is not
  // meaningful, so the series is a constant 1 per entry and the reading is
  // density over the run.
  const activity = entries.map(() => 1);

  return (
    <AppBody>
      {entries.length > 0 && (
        <TransportBar
          length={entries.length}
          cursor={cursor}
          onCursor={(next) => setReviewing(next === entries.length - 1 ? null : next)}
          currentLabel={
            current ? (
              <Presentation
                ptype="traceEntry"
                value={{ seq: current.seq }}
                doc={`<traceEntry> ${current.type} — ${current.detail}`}
              >
                <span>
                  {current.type} · {current.detail}
                </span>
              </Presentation>
            ) : null
          }
          note={
            reviewing === null
              ? "Following the tail. Scrub to review an earlier entry."
              : "Reviewing this entry — it shows what the verb did. It does not roll the workbench back (see DATADROP-12)."
          }
        />
      )}
      <Stack gap={1}>
        {entries.length > 2 && (
          <Sparkline
            points={activity}
            label={`${entries.length} verbs applied`}
            width={220}
            height={18}
          />
        )}
        {entries.length === 0 && (
          <Text size="small" tone="faint">
            Nothing yet — map a field, add a step.
          </Text>
        )}
        {entries.map((entry, index) => (
          <Stack
            key={entry.seq}
            direction="row"
            gap={2}
            align="baseline"
            className={index === cursor && reviewing !== null ? styles.reviewing : undefined}
          >
            <Text size="tiny" tone="faint">
              <span className={styles.seq}>{entry.seq}</span>
            </Text>
            <span
              className={styles.kind}
              style={{ background: TONE[entry.type] ?? "var(--pbui-pane-alt)" }}
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
