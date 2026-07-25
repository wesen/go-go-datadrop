// The transformation pipeline: five verbs over plain row objects.
//
// Ported from the reference artifact (pbui-gog.jsx:556-660) with one change
// that matters: the source is a Table argument rather than a module-level
// registry. A global works in a single-file artifact with three built-in
// datasets and becomes a liability the moment two charts point at two sources.

import type { Field, FieldType, Row, Table } from "./table";
import { asNumber, asText, effectiveType } from "./table";

export type Aggregate = "mean" | "sum" | "min" | "max" | "count";
export type DeriveOp = "+" | "-" | "*" | "/" | "log10";
export type FilterOp = "=" | "!=" | ">" | "<";

export type Step =
  | { id: string; kind: "filter"; on: boolean; field: string; op: FilterOp; value: string }
  | {
      id: string;
      kind: "derive";
      on: boolean;
      name: string;
      op: DeriveOp;
      a: string;
      b: string;
    }
  | { id: string; kind: "summarize"; on: boolean; by: string; fn: Aggregate; field: string }
  | { id: string; kind: "sort"; on: boolean; field: string; dir: "asc" | "desc" }
  | { id: string; kind: "limit"; on: boolean; n: number };

export const AGGREGATES: Aggregate[] = ["mean", "sum", "min", "max", "count"];
export const DERIVE_OPS: DeriveOp[] = ["+", "-", "*", "/", "log10"];
export const FILTER_OPS: FilterOp[] = ["=", "!=", ">", "<"];

let stepCounter = 0;

/**
 * The step variant for a given kind.
 *
 * `Omit<Step, "id" | "on">` over a discriminated union collapses to the keys
 * the members share, which is almost none of them. `Extract` keeps the variant
 * whole, so `newStep("filter", …)` is known to have `field`, `op` and `value`
 * and a caller can spread it without a cast.
 */
export type StepOf<K extends Step["kind"]> = Extract<Step, { kind: K }>;

/**
 * Mint a step of the given kind with sensible defaults for the field list.
 *
 * The body builds a `Step` and the signature narrows it. TypeScript cannot
 * verify that a switch on a *generic* discriminant narrows the return type — it
 * checks each branch against the whole of `StepOf<K>` rather than against the
 * branch's own variant — so the cast is at the boundary, once, rather than at
 * every call site.
 */
export function newStep<K extends Step["kind"]>(kind: K, fields: Field[]): StepOf<K> {
  return buildStep(kind, fields) as StepOf<K>;
}

function buildStep(kind: Step["kind"], fields: Field[]): Step {
  const id = `s${++stepCounter}`;
  const quantitative = fields.filter((f) => f.type === "q").map((f) => f.name);
  const categorical = fields.filter((f) => f.type !== "q").map((f) => f.name);
  const first = fields[0]?.name ?? "";

  switch (kind) {
    case "filter":
      return { id, kind, on: true, field: first, op: "=", value: "" };
    case "derive":
      return {
        id,
        kind,
        on: true,
        name: "derived",
        op: "/",
        a: quantitative[0] ?? first,
        b: quantitative[1] ?? quantitative[0] ?? first,
      };
    case "summarize":
      return {
        id,
        kind,
        on: true,
        by: categorical[0] ?? first,
        fn: "mean",
        field: quantitative[0] ?? first,
      };
    case "sort":
      return { id, kind, on: true, field: first, dir: "asc" };
    case "limit":
      return { id, kind, on: true, n: 100 };
  }
}

/** The output column name of an aggregation. */
export function aggregateName(fn: Aggregate, field: string): string {
  return fn === "count" ? "count" : `${fn}_${field}`;
}

export function stepLabel(step: Step): string {
  switch (step.kind) {
    case "filter":
      return `filter ${step.field} ${step.op} ${step.value || "…"}`;
    case "derive":
      return step.op === "log10"
        ? `derive ${step.name} = log10(${step.a})`
        : `derive ${step.name} = ${step.a} ${step.op} ${step.b}`;
    case "summarize":
      return `group ${step.by} → ${aggregateName(step.fn, step.field)}`;
    case "sort":
      return `sort ${step.field} ${step.dir === "asc" ? "↑" : "↓"}`;
    case "limit":
      return `limit ${step.n}`;
  }
}

function applyAggregate(fn: Aggregate, values: number[]): number {
  if (fn === "count") return values.length;
  if (values.length === 0) return 0;
  switch (fn) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

export interface PipelineResult {
  rows: Row[];
  fields: Field[];
  /** A configuration problem, reported rather than thrown. */
  err: string | null;
  /** Rows a derive step removed because the expression was not finite. */
  dropped: Record<string, number>;
}

/**
 * The field list after the first `upto` steps, without touching rows.
 *
 * Step editors use this so that step 3's dropdown offers exactly what steps 1
 * and 2 produce — including `mean_mass_g`, which does not exist in the source.
 */
export function schemaAfter(
  table: Table,
  steps: Step[],
  upto?: number,
  overrides?: Record<string, FieldType>,
): Field[] {
  let fields: Field[] = table.fields.map((f) => ({
    ...f,
    type: effectiveType(f, overrides),
  }));
  const n = upto === undefined ? steps.length : upto;

  for (let i = 0; i < n; i++) {
    const step = steps[i];
    if (!step || !step.on) continue;
    if (step.kind === "derive") {
      fields = [
        ...fields.filter((f) => f.name !== step.name),
        { name: step.name, type: "q", inferred_from: "values" },
      ];
    }
    if (step.kind === "summarize") {
      const by = fields.find((f) => f.name === step.by);
      fields = [
        ...(by ? [by] : []),
        { name: aggregateName(step.fn, step.field), type: "q", inferred_from: "values" },
      ];
    }
  }
  return fields;
}

/**
 * Run the pipeline.
 *
 * Total: a misconfigured step reports through `err` and is skipped rather than
 * throwing. A workbench where a half-typed filter blanks the screen with a
 * stack trace is not usable.
 */
export function evaluate(
  table: Table,
  steps: Step[],
  overrides?: Record<string, FieldType>,
): PipelineResult {
  let rows: Row[] = table.rows;
  let fields: Field[] = table.fields.map((f) => ({
    ...f,
    type: effectiveType(f, overrides),
  }));
  let err: string | null = null;
  const dropped: Record<string, number> = {};

  const typeOf = (name: string): FieldType | undefined =>
    fields.find((f) => f.name === name)?.type;

  for (const step of steps) {
    if (!step.on) continue;

    switch (step.kind) {
      case "filter": {
        const type = typeOf(step.field);
        if (type === undefined) {
          err = `filter refers to ${step.field}, which the pipeline no longer produces`;
          continue;
        }
        // An unconfigured filter passes everything. Dropping every row while
        // the user is still typing the value would be actively unhelpful.
        if (step.value === "") continue;

        if (type === "q") {
          const bound = Number(step.value);
          rows = rows.filter((row) => {
            const v = asNumber(row[step.field]);
            switch (step.op) {
              case "=":
                return v === bound;
              case "!=":
                return v !== bound;
              case ">":
                return v > bound;
              case "<":
                return v < bound;
            }
          });
        } else {
          rows = rows.filter((row) => {
            const v = asText(row[step.field]);
            switch (step.op) {
              case "=":
                return v === step.value;
              case "!=":
                return v !== step.value;
              case ">":
                return v > step.value;
              case "<":
                return v < step.value;
            }
          });
        }
        break;
      }

      case "derive": {
        const before = rows.length;
        rows = rows
          .map((row) => {
            let value: number;
            if (step.op === "log10") {
              const a = asNumber(row[step.a]);
              value = a > 0 ? Math.log10(a) : NaN;
            } else {
              const a = asNumber(row[step.a]);
              const b = asNumber(row[step.b]);
              switch (step.op) {
                case "+":
                  value = a + b;
                  break;
                case "-":
                  value = a - b;
                  break;
                case "*":
                  value = a * b;
                  break;
                case "/":
                  value = b === 0 ? NaN : a / b;
                  break;
              }
            }
            return { ...row, [step.name]: Number.isFinite(value) ? value : null };
          })
          .filter((row) => row[step.name] !== null);
        // Surprising but deliberate: a chart cannot plot NaN. The editor shows
        // this count so the disappearance is visible rather than mysterious.
        if (before !== rows.length) dropped[step.id] = before - rows.length;
        fields = [
          ...fields.filter((f) => f.name !== step.name),
          { name: step.name, type: "q", inferred_from: "values" },
        ];
        break;
      }

      case "summarize": {
        const groups = new Map<string, Row[]>();
        for (const row of rows) {
          const key = asText(row[step.by]);
          const bucket = groups.get(key);
          if (bucket) bucket.push(row);
          else groups.set(key, [row]);
        }

        const byType = typeOf(step.by) ?? "n";
        const outName = aggregateName(step.fn, step.field);
        const out: Row[] = [];
        for (const [key, group] of groups) {
          const values =
            step.fn === "count"
              ? group.map(() => 1)
              : group.map((row) => asNumber(row[step.field])).filter(Number.isFinite);
          out.push({ [step.by]: key, [outName]: applyAggregate(step.fn, values) });
        }
        rows = out;
        // A deliberate simplification of a real group-by: the output is the key
        // and the aggregate, nothing else. The editor says so, because silently
        // losing the other columns costs an afternoon.
        fields = [
          { name: step.by, type: byType, inferred_from: "values" },
          { name: outName, type: "q", inferred_from: "values" },
        ];
        break;
      }

      case "sort": {
        const type = typeOf(step.field);
        const sign = step.dir === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          if (type === "q") {
            return sign * (asNumber(a[step.field]) - asNumber(b[step.field]));
          }
          return sign * asText(a[step.field]).localeCompare(asText(b[step.field]));
        });
        break;
      }

      case "limit":
        rows = rows.slice(0, Math.max(1, Math.floor(step.n) || 1));
        break;
    }
  }

  return { rows, fields, err, dropped };
}
