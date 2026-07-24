// The chart specification: what to draw, from what, with which channels.
//
// A ChartSpec plus a Table is everything buildPlot needs. Nothing here reaches
// for a store, a context, or the network.

import type { Field, FieldType, SourceRef, Table } from "./table";
import type { Step } from "./pipeline";

export type Geom = "point" | "line" | "bar" | "area";
export type Channel = "x" | "y" | "color" | "size" | "facet";

export const GEOMS: Geom[] = ["point", "line", "bar", "area"];
export const CHANNELS: Channel[] = ["x", "y", "color", "size", "facet"];

export interface ChartSpec {
  source: SourceRef;
  steps: Step[];
  geom: Geom;
  mapping: Record<Channel, string | null>;
  yScale: "linear" | "log";
  /**
   * Per-chart type overrides.
   *
   * A presentation decision about this chart, never written back to the source.
   * The server's `inferred_from` keeps saying what the server thought.
   */
  typeOverrides?: Record<string, FieldType>;
}

/**
 * Which field types a channel will accept.
 *
 * Enforced by filtering the dropdown rather than by rejecting a selection: an
 * option that cannot work should not be offerable.
 */
export const CHANNEL_ACCEPTS: Record<Channel, FieldType[]> = {
  x: ["q", "n", "t"],
  y: ["q"],
  color: ["q", "n", "t"],
  size: ["q"],
  facet: ["n", "t"],
};

/**
 * A chart that draws something.
 *
 * A workbench that opens on a blank canvas with five empty dropdowns teaches
 * nothing, so this picks a defensible starting point rather than an empty one.
 * Two rules do most of the work:
 *
 *  - Payload columns beat envelope columns. `data.temp_c` is what the producer
 *    measured; `seq` is a row number the server assigned, and a chart of
 *    sequence against time is a straight line that says nothing.
 *  - A colour channel needs few categories. The server reports `distinct` per
 *    field, so a 120-value identifier column is skipped instead of producing a
 *    legend longer than the chart.
 */

/** Envelope columns are metadata about delivery, not measurements. */
const ENVELOPE_COLUMNS = new Set([
  "id",
  "drop",
  "stream",
  "seq",
  "source",
  "type",
  "subject",
]);

/** Payload first, then everything else, order otherwise preserved. */
function payloadFirst(fields: Field[]): Field[] {
  const payload = fields.filter((f) => !ENVELOPE_COLUMNS.has(f.name));
  const envelope = fields.filter((f) => ENVELOPE_COLUMNS.has(f.name));
  return [...payload, ...envelope];
}

export function defaultChart(table: Table): ChartSpec {
  const ranked = payloadFirst(table.fields);
  const quantitative = ranked.filter((f) => f.type === "q");
  const temporal = ranked.find((f) => f.type === "t");

  // A colour channel with more categories than the palette holds is a legend,
  // not an encoding. Prefer the field with the fewest distinct values.
  const colorCandidates = ranked
    .filter((f) => f.type === "n" && (f.distinct ?? 0) >= 2 && (f.distinct ?? 0) <= 8)
    .sort((a, b) => (a.distinct ?? 0) - (b.distinct ?? 0));

  const x = temporal ? temporal.name : (quantitative[0]?.name ?? null);
  const y = temporal
    ? (quantitative[0]?.name ?? null)
    : (quantitative[1]?.name ?? quantitative[0]?.name ?? null);

  return {
    source: table.source,
    steps: [],
    geom: temporal ? "line" : "point",
    mapping: {
      x,
      y,
      color: colorCandidates[0]?.name ?? null,
      size: null,
      facet: null,
    },
    yScale: "linear",
  };
}

export function describeSource(source: SourceRef): string {
  if (source.kind === "stream") {
    return `${source.drop} / ${source.stream ?? "events"}`;
  }
  return `${source.drop} / ${source.dataset} v${source.version} / ${source.path}`;
}

export function sameSource(a: SourceRef, b: SourceRef): boolean {
  return (
    a.kind === b.kind &&
    a.drop === b.drop &&
    (a.stream ?? "") === (b.stream ?? "") &&
    (a.dataset ?? "") === (b.dataset ?? "") &&
    (a.version ?? 0) === (b.version ?? 0) &&
    (a.path ?? "") === (b.path ?? "")
  );
}
