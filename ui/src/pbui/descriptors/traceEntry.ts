import type { PresentationDescriptor } from "../registry";
import type { Action } from "../verbs";

/**
 * The value: a trace entry's sequence number.
 *
 * Deliberately `seq`, not an array index. `TRACE_CAP` in the world slice drops
 * entries from the front, so an index silently comes to mean a different entry
 * after the cap is reached — a verb carrying `{index: 3}` would target whatever
 * had slid into position 3. The sequence number never moves.
 */
export interface TraceEntryRef {
  seq: number;
}

/**
 * `<traceEntry>` — one verb, as it was recorded.
 *
 * The trace was a write-only log: rendered top to bottom, with no way to ask
 * about any single entry. Making an entry a presentation gives it the same
 * verbs as everything else on screen — inspect it, watch it — and gives the
 * transport something typed to point at.
 */
export const traceEntryDescriptor: PresentationDescriptor<TraceEntryRef> = {
  ptype: "traceEntry",
  tone: "var(--pbui-tone-traceEntry)",

  label: (ref) => `entry ${ref.seq}`,

  describe: (ref) => ({ presentationType: "traceEntry", seq: ref.seq }),

  actions: (ref): Action[] => [
    {
      label: "Inspect this entry",
      verb: { kind: "inspect", ptype: "traceEntry", value: ref },
    },
    {
      label: "Watch it",
      verb: { kind: "watch", ptype: "traceEntry", value: ref },
    },
  ],
};
