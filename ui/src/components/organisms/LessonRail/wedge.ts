import { evaluate, schemaAfter } from "../../../model/pipeline";
import { CHANNELS } from "../../../model/chart";
import type { RootState } from "../../../store";

/**
 * States the workbench can legitimately reach in which a lesson is
 * unreachable — named as a teaching moment, never as an apology.
 *
 * Both of these are three clicks away and neither is an error. A filter that
 * removes every row is a filter doing its job; a mapping pointing at a column a
 * `summarize` step removed is the schema doing its job. The reader has not
 * broken anything, but the next lesson step cannot succeed, and a rail that
 * says nothing leaves them pressing ▶ and watching nothing happen.
 *
 * Both sentences end mid-clause on purpose. The rail appends "↺ start this
 * panel over", so the whole reads "…switch one off with its ✓ box, **or** ↺
 * start this panel over" — an option offered rather than a dead end announced.
 *
 * Ported from `pbui-landing.jsx:1773-1784`, retargeted onto our state and our
 * own `schemaAfter`, which is where the second condition comes from cheaply:
 * `EncodingApp` already computes exactly this staleness for its own display.
 */
export function wedgeOf(state: RootState): string | null {
  const docId = state.world.activeDocId;
  const doc = docId ? state.world.docs[docId] : undefined;
  if (!doc) return null;

  const table = state.datadrop.queries;
  // A wedge is a statement about rows and schema, and both need a table. With
  // none loaded yet there is nothing to be stuck about — an empty workbench is
  // a starting point, not a dead end.
  const cached = Object.values(table).find(
    (entry) => (entry?.data as { source?: unknown } | undefined)?.source,
  )?.data as Parameters<typeof evaluate>[0] | undefined;
  if (!cached) return null;

  const enabled = doc.spec.steps.filter((step) => step.on);
  if (enabled.length > 0) {
    const out = evaluate(cached, doc.spec.steps, doc.spec.typeOverrides);
    if (out.rows.length === 0) {
      return (
        `chart ${doc.name} has no rows left — a filter step is too strict. ` +
        `Switch one off with its ✓ box, or`
      );
    }
  }

  const fields = schemaAfter(cached, doc.spec.steps, undefined, doc.spec.typeOverrides);
  const names = new Set(fields.map((field) => field.name));
  const lost = CHANNELS.filter((channel) => {
    const mapped = doc.spec.mapping[channel];
    return mapped != null && !names.has(mapped);
  });
  if (lost.length > 0) {
    return (
      `chart ${doc.name} maps ${lost.join(" and ")} to a field the pipeline no longer ` +
      `produces — a group∑ step changes the schema. Re-map it, or`
    );
  }

  return null;
}
