import { asText } from "../../model/table";
import type { PresentationDescriptor } from "../registry";
import type { DatumRef } from "../types";
import type { Action } from "../verbs";

/**
 * `<datum>` — one row, drawn as a mark or as a table row number.
 *
 * The same presentation type in both places, so the verbs are the same in both
 * places. That equivalence is the point: a mark in a scatter plot and a row
 * number in a table are the same object seen twice, and neither is a picture.
 */
export const datumDescriptor: PresentationDescriptor<DatumRef> = {
  ptype: "datum",
  tone: "var(--pbui-tone-neutral)",

  label: (ref) =>
    Object.entries(ref.row)
      .slice(0, 2)
      .map(([key, value]) => `${key}=${asText(value)}`)
      .join(" "),

  describe: (ref, env) => ({
    presentationType: "datum",
    from_chart: env.nameOf(ref.docId),
    ...ref.row,
  }),

  actions: (ref, env) => {
    const target = ref.docId ?? env.activeDocId;
    const where = `chart ${env.nameOf(target)}`;
    // Schema, not rows: this only needs each column's type to decide which get
    // keep/exclude. `actions` is a menu path so `tableFor` would be affordable,
    // but asking for rows you do not read is how a render path acquires one by
    // accident later.
    const fields = env.fieldsFor(ref.docId);
    const overrides = env.overridesFor(ref.docId);

    // Only categorical columns get keep/exclude: "keep only temp_c = 21.4" is a
    // filter that matches one row and is never what anyone wants.
    const categorical = Object.keys(ref.row).filter((name) => {
      const field = fields.find((f) => f.name === name);
      if (!field) return false;
      const type = overrides?.[name] ?? field.type;
      return type !== "q";
    });

    const actions: Action[] = [];
    for (const name of categorical.slice(0, 4)) {
      const value = asText(ref.row[name]);
      actions.push({
        label: `Keep only ${name} = ${value}  (${where})`,
        verb: { kind: "addFilter", docId: target, field: name, op: "=", value },
      });
      actions.push({
        label: `Exclude ${name} = ${value}`,
        verb: { kind: "addFilter", docId: target, field: name, op: "!=", value },
      });
    }

    actions.push({ label: "Inspect", verb: { kind: "inspect", ptype: "datum", value: ref } });
    actions.push({ label: "Add to watchlist", verb: { kind: "watch", ptype: "datum", value: ref } });
    return actions;
  },
};
