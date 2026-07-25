import type { PresentationDescriptor } from "../registry";
import type { CatRef } from "../types";
import type { Action } from "../verbs";

/**
 * `<cat>` — a level of a categorical field: a legend swatch, a banded axis label.
 *
 * This and `<datum>` are where the thesis of the ticket becomes visible. Its
 * verbs do not filter the *picture*: they append a real `filter` step to the
 * document's pipeline, which appears in the pipeline tile with a checkbox that
 * disables it without deleting it. The click on the legend and the step in the
 * chain are the same act seen from two surfaces.
 */
export const catDescriptor: PresentationDescriptor<CatRef> = {
  ptype: "cat",
  tone: "var(--pbui-tone-cat)",

  label: (ref) => `${ref.field} = ${ref.value}`,

  describe: (ref, env) => ({
    presentationType: "category",
    field: ref.field,
    value: ref.value,
    chart: env.nameOf(ref.docId),
  }),

  actions: (ref, env) => {
    const where = `chart ${env.nameOf(ref.docId ?? env.activeDocId)}`;
    const target = ref.docId ?? env.activeDocId;
    const actions: Action[] = [
      {
        label: `Keep only ${ref.field} = ${ref.value}  (${where})`,
        verb: { kind: "addFilter", docId: target, field: ref.field, op: "=", value: ref.value },
      },
      {
        label: `Exclude ${ref.field} = ${ref.value}`,
        verb: { kind: "addFilter", docId: target, field: ref.field, op: "!=", value: ref.value },
      },
      {
        label: `Facet by ${ref.field}`,
        verb: { kind: "setMapping", docId: target, channel: "facet", field: ref.field },
      },
      { label: "Inspect", verb: { kind: "inspect", ptype: "cat", value: ref } },
      { label: "Add to watchlist", verb: { kind: "watch", ptype: "cat", value: ref } },
    ];
    return actions;
  },
};
