// Live tail: project arriving envelopes with the server's own flattening rules.
//
// This is a deliberate, contained violation of "one projection, on the server".
// The alternative is a round trip per event, which for a stream doing a hundred
// events a second is not a design. It is contained by being exactly these
// twenty lines, by using the same column names, and by test/live.test.ts
// asserting agreement against a fixture the Go implementation generated.

import type { Field, Row, Table } from "./table";

/** The envelope shape the SSE endpoint emits. */
export interface Envelope {
  id: string;
  drop?: string;
  stream?: string;
  seq: number;
  time: string;
  received_at: string;
  source?: string;
  type?: string;
  subject?: string;
  data?: unknown;
}

/** The fixed leading columns, in the same order as tabular.EnvelopeColumns. */
export const ENVELOPE_COLUMNS = [
  "id",
  "drop",
  "stream",
  "seq",
  "time",
  "received_at",
  "source",
  "type",
  "subject",
] as const;

export const DATA_PREFIX = "data.";

/**
 * Flatten a value into dotted-path leaves.
 *
 * Mirrors pkg/tabular/flatten.go: nested objects use dotted paths, arrays and
 * anything else stay whole, a top-level null contributes nothing, and an empty
 * object is a leaf.
 */
export function flattenValues(prefix: string, value: unknown, out: Row): void {
  if (value === undefined) return;

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix !== "") {
      out[prefix] = {};
      return;
    }
    for (const [key, child] of entries) {
      flattenValues(prefix === "" ? key : `${prefix}.${key}`, child, out);
    }
    return;
  }

  if (value === null) {
    if (prefix === "") return;
    out[prefix] = null;
    return;
  }

  out[prefix] = value;
}

/**
 * Render a timestamp the way the server renders it in a table.
 *
 * The SSE endpoint marshals an envelope with Go's default time encoding, which
 * is RFC3339Nano and strips trailing zeros: the same instant that the table
 * endpoint reports as "…05.100Z" arrives over SSE as "…05.1Z". Copying it
 * through verbatim would put two spellings of one instant in one column, which
 * a nominal axis would render as two categories.
 *
 * Date#toISOString produces exactly the canonical form — RFC3339, UTC, three
 * fractional digits — so this is a normalization rather than a reformatting.
 * An unparseable value is passed through unchanged; losing it entirely would be
 * worse than showing it oddly.
 */
export function canonicalTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

/** Project one envelope into a table row. */
export function projectEnvelope(envelope: Envelope): Row {
  const row: Row = {
    id: envelope.id,
    drop: envelope.drop ?? "",
    stream: envelope.stream ?? "",
    seq: envelope.seq,
    time: canonicalTime(envelope.time),
    received_at: canonicalTime(envelope.received_at),
    source: envelope.source ?? "",
    type: envelope.type ?? "",
    subject: envelope.subject ?? "",
  };
  const payload: Row = {};
  flattenValues("", envelope.data, payload);
  for (const [name, value] of Object.entries(payload)) {
    row[DATA_PREFIX + name] = value;
  }
  return row;
}

function inferFromValue(value: unknown): Field["type"] {
  if (typeof value === "number") return "q";
  return "n";
}

/**
 * Fold one arriving envelope into a table.
 *
 * Three behaviours worth naming:
 *
 *  - New columns are added as they appear. An event carrying a key no earlier
 *    row had gets a field, typed by observation; earlier rows are simply
 *    missing it rather than being back-filled with a null.
 *  - The row budget is held by evicting from the front, so a long-running tail
 *    does not grow without bound.
 *  - A sequence gap is reported rather than smoothed. The hub is deliberately
 *    lossy — it evicts a slow subscriber instead of queueing forever — so a gap
 *    is expected, and interpolating across one would invent data.
 */
export function appendEnvelope(
  table: Table,
  envelope: Envelope,
  budget: number,
): { table: Table; gap: boolean } {
  const row = projectEnvelope(envelope);
  const known = new Set(table.fields.map((f) => f.name));
  const fields = [...table.fields];

  for (const [name, value] of Object.entries(row)) {
    if (known.has(name)) continue;
    if (!name.startsWith(DATA_PREFIX)) continue;
    fields.push({ name, type: inferFromValue(value), inferred_from: "values" });
  }

  const previous = table.next_after ?? 0;
  const gap = previous > 0 && envelope.seq > previous + 1;

  const rows = [...table.rows, row];
  while (rows.length > budget) rows.shift();

  return {
    table: {
      ...table,
      fields,
      rows,
      row_count: rows.length,
      next_after: Math.max(previous, envelope.seq),
    },
    gap,
  };
}
