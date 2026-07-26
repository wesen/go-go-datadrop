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
  // not an encoding — so candidates are capped at 8. Two further rules, both
  // learned from a fixture that this got wrong:
  //
  //  - Envelope columns are EXCLUDED outright, not merely ranked lower. Ranking
  //    them lower does not survive the sort below: `ranked` puts payload first,
  //    and then sorting by distinct count reorders across that boundary. A
  //    stream whose `id` happened to have fewer levels than its payload column
  //    would be coloured by the delivery identifier.
  //
  //  - Among the survivors, prefer MORE levels, not fewer. The cap already
  //    handles legibility, and a field with more levels carries more
  //    information: colouring `lab/temps` by a two-valued `data.ok` flag rather
  //    than by its four stations produces a chart about a boolean instead of a
  //    chart about the sensors. The sort is stable, so payload order still
  //    breaks ties.
  const colorCandidates = ranked
    .filter(
      (f) =>
        f.type === "n" &&
        !ENVELOPE_COLUMNS.has(f.name) &&
        (f.distinct ?? 0) >= 2 &&
        (f.distinct ?? 0) <= 8,
    )
    .sort((a, b) => (b.distinct ?? 0) - (a.distinct ?? 0));

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

/**
 * A specification as an ordered list of labelled facts.
 *
 * The one place that decides what a `ChartSpec` *says*, added by DATADROP-6
 * phase 5 (DR-85). Three surfaces describe a spec — the snapshot gallery in one
 * line, the document manager in one line plus a row budget, and the A/B compare
 * as an aligned table — and before this they each built their own sentence out
 * of the same six fields. Three copies of one description drift, and the way
 * you find out is that a snapshot and the document it came from read
 * differently while being identical.
 *
 * Ordered rather than a record, because the compare view walks it top to bottom
 * and the order is a presentation decision: source first because it is what a
 * reader checks first, mappings last because they are the part that changes
 * most often.
 *
 * `limit` is optional and appears only when supplied. It is a property of the
 * document rather than of the drawing, so a caller describing a bare spec has
 * nothing to say about it.
 */
export function specFacts(spec: ChartSpec, limit?: number): Array<[string, string]> {
  const facts: Array<[string, string]> = [
    ["source", spec.source.drop ? describeSource(spec.source) : "no source"],
  ];
  if (limit !== undefined) facts.push(["row budget", limit.toLocaleString()]);
  facts.push(
    ["geom", spec.geom],
    ["y scale", spec.yScale],
    // Disabled steps are excluded: the count answers "what is this chart doing",
    // and a step toggled off is doing nothing.
    ["steps", String(spec.steps.filter((s) => s.on).length)],
    ["x", spec.mapping.x ?? "—"],
    ["y", spec.mapping.y ?? "—"],
    ["colour", spec.mapping.color ?? "—"],
    ["size", spec.mapping.size ?? "—"],
    ["facet", spec.mapping.facet ?? "—"],
  );
  return facts;
}
