import { CHANNELS, CHANNEL_ACCEPTS } from "../../model/chart";
import { TYPE_LABEL, TYPE_SOURCE_LABEL, asNumber, effectiveType } from "../../model/table";
import type { Field, FieldType, Table } from "../../model/table";
import type { PresentationDescriptor } from "../registry";
import type { FieldRef, PbuiEnvironment } from "../types";
import type { Action } from "../verbs";

/**
 * `<field>` — a column, with a type and a provenance.
 *
 * The atom of the whole workbench: it appears in the source browser, in table
 * headers, in the pipeline's output schema, in encoding rows and as a legend
 * title, and it is the same object in all five.
 */

/** Resolve a field against the document that owns the presentation. */
export function resolveField(
  ref: FieldRef,
  env: PbuiEnvironment,
): { table: Table | null; field: Field | null; type: FieldType | null } {
  const table = env.tableFor(ref.docId);
  const field = table?.fields.find((f) => f.name === ref.name) ?? null;
  if (!field) return { table, field: null, type: null };
  return { table, field, type: effectiveType(field, env.overridesFor(ref.docId)) };
}

/** Summary statistics, always reported with the window they cover. */
function statistics(ref: FieldRef, table: Table, type: FieldType) {
  const values = table.rows.map((row) => row[ref.name]);

  if (type === "q") {
    const numbers = values.map(asNumber).filter(Number.isFinite);
    if (numbers.length === 0) return { n: 0 };
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const variance =
      numbers.reduce((a, b) => a + (b - mean) * (b - mean), 0) / numbers.length;
    return {
      n: numbers.length,
      min: Number(Math.min(...numbers).toFixed(3)),
      max: Number(Math.max(...numbers).toFixed(3)),
      mean: Number(mean.toFixed(3)),
      sd: Number(Math.sqrt(variance).toFixed(3)),
    };
  }

  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value === null || value === undefined ? "(null)" : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const levels = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  return {
    n: values.length,
    distinct: Object.keys(counts).length,
    top_levels: Object.fromEntries(levels),
  };
}

export const fieldDescriptor: PresentationDescriptor<FieldRef> = {
  ptype: "field",
  tone: "var(--pbui-tone-field)",

  label: (ref) => ref.name,

  describe: (ref, env) => {
    const { table, field, type } = resolveField(ref, env);
    if (!table || !field) {
      return {
        presentationType: "field",
        name: ref.name,
        note: "not in the current pipeline output — a step may have removed it",
      };
    }

    const overridden = field.type !== type;
    return {
      presentationType: "field",
      name: field.name,
      type: TYPE_LABEL[type as FieldType],
      // Provenance, never just the type. A column typed `q` because a schema
      // says so and one typed `q` because 2 000 sampled values happened to
      // parse are different facts, and anyone deciding whether to trust a chart
      // needs the difference.
      type_source: TYPE_SOURCE_LABEL[field.inferred_from],
      ...(overridden
        ? { overridden_to: TYPE_LABEL[type as FieldType], server_said: TYPE_LABEL[field.type] }
        : {}),
      distinct: field.distinct_capped ? `${field.distinct}+` : field.distinct,
      null_count: field.null_count,
      // Every statistic carries the window it was computed over. The prototype
      // reports a mean over whatever rows it has, and it has all of them; ours
      // may be a 2 000-row sample of forty thousand.
      computed_over: table.truncated
        ? `the loaded window — ${table.row_count.toLocaleString()} of at least ${(table.row_count + 1).toLocaleString()} rows`
        : `all ${table.row_count.toLocaleString()} rows`,
      ...statistics(ref, table, type as FieldType),
    };
  },

  actions: (ref, env) => {
    const { field, type } = resolveField(ref, env);
    const target = ref.docId ?? env.activeDocId;
    const where = `chart ${env.nameOf(target)}`;
    const actions: Action[] = [];

    for (const channel of CHANNELS) {
      const accepted = type !== null && CHANNEL_ACCEPTS[channel].includes(type);
      actions.push({
        label: `Map to ${channel}  (${where})`,
        verb: { kind: "setMapping", docId: target, channel, field: ref.name },
        // Offered and disabled, never hidden. A user who never sees "Map to y"
        // on a nominal column never learns that y requires a quantitative one.
        disabledBecause: accepted
          ? undefined
          : type === null
            ? "not in the pipeline output"
            : `${channel} accepts ${CHANNEL_ACCEPTS[channel].map((t) => TYPE_LABEL[t]).join(", ")}`,
      });
    }

    actions.push({
      label: "Filter on this field",
      verb: {
        kind: "addFilter",
        docId: target,
        field: ref.name,
        op: type === "q" ? ">" : "=",
        value: "",
      },
    });

    if (type !== null && type !== "q") {
      actions.push({
        label: "Group by + count",
        verb: { kind: "addSummarize", docId: target, by: ref.name, fn: "count", field: ref.name },
      });
    }

    actions.push({
      label: "Sort output by (descending)",
      verb: { kind: "addSort", docId: target, field: ref.name, dir: "desc" },
    });

    if (type !== null) {
      const flipped: FieldType = type === "q" ? "n" : "q";
      actions.push({
        // The wording carries two facts: it affects one chart, and it does not
        // change what the server said. The provenance badge keeps reporting the
        // server's answer beside the overridden type.
        label: `Read as ${TYPE_LABEL[flipped]} in this chart only`,
        verb: { kind: "setTypeOverride", docId: target, field: ref.name, type: flipped },
      });
      if (field && field.type !== type) {
        actions.push({
          label: `Restore the server's type (${TYPE_LABEL[field.type]})`,
          verb: { kind: "setTypeOverride", docId: target, field: ref.name, type: null },
        });
      }
    }

    actions.push({ label: "Inspect", verb: { kind: "inspect", ptype: "field", value: ref } });
    actions.push({ label: "Add to watchlist", verb: { kind: "watch", ptype: "field", value: ref } });
    return actions;
  },
};
