// A time axis.
//
// The reference artifact treats a temporal x as a band scale — one slot per
// distinct value — which is fine for twenty-four monthly buckets and wrong for
// a sensor stream, where it produces one slot per reading, unevenly spaced
// intervals drawn evenly, and axis labels that are full ISO timestamps.
//
// So a temporal x is continuous here: values are parsed to epoch milliseconds
// and scaled linearly, and ticks land on round units of time rather than on
// round numbers of milliseconds.
//
// Everything is UTC. The table view shows the stored timestamps verbatim, and
// an axis that silently shifted them into the reader's zone would disagree with
// the rows sitting underneath it.

/** Parse a cell into epoch milliseconds, or NaN. */
export function toInstant(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  return Date.parse(value);
}

const MILLISECOND = 1;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Candidate tick spacings, in milliseconds.
 *
 * Round *time* units, not round numbers: 15 minutes is a spacing a person
 * reads at a glance, and 16.384 seconds is not, however tidy it looks in
 * base ten.
 */
const STEPS = [
  // Sub-second steps, because datadrop is a timeseries store and a
  // high-frequency stream really does produce sub-second windows. Without
  // these the ladder bottoms out at one second and any span under a second
  // gets exactly ONE tick — an axis with a single label, which says nothing
  // about its own extent. Found by charting 120 events that were pushed in
  // 825 ms.
  MILLISECOND,
  5 * MILLISECOND,
  10 * MILLISECOND,
  25 * MILLISECOND,
  50 * MILLISECOND,
  100 * MILLISECOND,
  250 * MILLISECOND,
  500 * MILLISECOND,
  SECOND,
  5 * SECOND,
  15 * SECOND,
  30 * SECOND,
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  7 * DAY,
  28 * DAY,
  91 * DAY,
  365 * DAY,
];

/** The smallest ladder step that yields at most `n` ticks over the span. */
export function chooseStep(spanMs: number, n: number): number {
  const target = spanMs / Math.max(1, n);
  for (const step of STEPS) {
    if (step >= target) return step;
  }
  // Beyond a year, fall back to whole years.
  return Math.ceil(target / (365 * DAY)) * 365 * DAY;
}

export interface TimeTick {
  at: number;
  label: string;
}

/**
 * Ticks on round units of time.
 *
 * Alignment is to the epoch, which is midnight UTC on a Thursday. For every
 * step at or below a day that puts ticks on the hour, the minute or the second
 * as expected; above a day it is approximate, which is the price of not
 * carrying a calendar library for a workbench axis.
 */
export function timeTicks(loMs: number, hiMs: number, n = 5): TimeTick[] {
  if (!(hiMs > loMs)) return [{ at: loMs, label: formatInstant(loMs, MINUTE) }];

  const step = chooseStep(hiMs - loMs, n);
  const first = Math.ceil(loMs / step) * step;

  const ticks: TimeTick[] = [];
  for (let at = first; at <= hiMs; at += step) {
    ticks.push({ at, label: formatInstant(at, step) });
  }
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Label an instant at the granularity the tick spacing implies.
 *
 * A one-minute step does not need the year; a one-year step does not need the
 * seconds. Showing both everywhere is how an axis becomes unreadable.
 */
export function formatInstant(ms: number, stepMs: number): string {
  const d = new Date(ms);
  // Below a second the milliseconds ARE the information; without them every
  // tick on a sub-second axis carries the same label.
  if (stepMs < SECOND) {
    return `${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${String(
      d.getUTCMilliseconds(),
    ).padStart(3, "0")}`;
  }
  if (stepMs < MINUTE) {
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  if (stepMs < DAY) {
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  if (stepMs < 28 * DAY) {
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (stepMs < 365 * DAY) {
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return String(d.getUTCFullYear());
}
