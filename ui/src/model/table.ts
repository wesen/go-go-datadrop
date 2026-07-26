// The wire types produced by pkg/tabular, plus the small helpers every other
// module needs.
//
// Nothing in src/model imports React. That is a rule rather than a convention:
// it is what lets `bun test` exercise the whole grammar of graphics with no DOM
// and no server.

/** The visual-encoding type of a column: quantitative, nominal, temporal. */
export type FieldType = "q" | "n" | "t";

/** How the server decided a field's type. */
export type TypeSource = "schema" | "envelope" | "values" | "default";

export interface Field {
  name: string;
  type: FieldType;
  inferred_from: TypeSource;
  distinct?: number;
  distinct_capped?: boolean;
  null_count?: number;
}

export interface SourceRef {
  kind: "stream" | "dataset";
  drop: string;
  stream?: string;
  dataset?: string;
  version?: number;
  path?: string;
}

/** One row. Values keep the JSON types the server sent. */
export type Row = Record<string, unknown>;

export interface Table {
  source: SourceRef;
  fields: Field[];
  rows: Row[];
  row_count: number;
  truncated: boolean;
  strategy: "head" | "latest";
  next_after?: number;
}

export const TYPE_LABEL: Record<FieldType, string> = {
  q: "quantitative",
  n: "nominal",
  t: "temporal",
};

export const TYPE_SOURCE_LABEL: Record<TypeSource, string> = {
  schema: "from the dataset schema",
  envelope: "fixed by the event envelope",
  values: "inferred from the sampled values",
  default: "no evidence — assumed nominal",
};

export const EMPTY_TABLE: Table = {
  source: { kind: "stream", drop: "" },
  fields: [],
  rows: [],
  row_count: 0,
  truncated: false,
  strategy: "head",
};

/**
 * The effective type of a field, honouring a chart-local override.
 *
 * An override is a presentation decision about one chart. It is never written
 * back to the source and never changes what the server said — which is why the
 * field keeps reporting its own `inferred_from` alongside.
 */
export function effectiveType(field: Field, overrides?: Record<string, FieldType>): FieldType {
  return overrides?.[field.name] ?? field.type;
}

/** A name-to-type map for the current field list. */
export function typeMap(
  fields: Field[],
  overrides?: Record<string, FieldType>,
): Record<string, FieldType> {
  const out: Record<string, FieldType> = {};
  for (const field of fields) out[field.name] = effectiveType(field, overrides);
  return out;
}

/**
 * Coerce a cell to a number.
 *
 * Returns NaN rather than throwing or defaulting to zero: a missing measurement
 * and a measurement of zero are different facts, and every consumer here filters
 * on Number.isFinite before plotting.
 */
export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** Render a cell for display or for a category key. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Format a number for an axis label or a tooltip. */
export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) return value.toExponential(1);
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}
