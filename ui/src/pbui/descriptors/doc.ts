import type { PresentationDescriptor } from "../registry";
import type { DocId } from "../types";
import type { Action } from "../verbs";

/**
 * `<doc>` — a live chart document (α, β, γ …).
 *
 * A document is an identity plus a ChartSpec (guide §7.3, DR-8), which is why
 * snapshotting is a deep copy and a permalink is the same object encoded. There
 * is no separate document-specification type and there must not be one.
 */
export const docDescriptor: PresentationDescriptor<DocId> = {
  ptype: "doc",
  tone: "var(--pbui-tone-doc)",

  label: (docId, env) => env.nameOf(docId),

  describe: (docId, env) => {
    const table = env.tableFor(docId);
    return {
      presentationType: "chart document",
      name: env.nameOf(docId),
      active: env.activeDocId === docId,
      source: table?.source ?? "(no source)",
      rows_loaded: table?.row_count ?? 0,
      overrides: env.overridesFor(docId) ?? {},
    };
  },

  actions: (docId, env) => {
    const actions: Action[] = [];
    if (env.activeDocId !== docId) {
      actions.push({
        // Ambient verbs — those fired from a chip that names no document — land
        // on the active one, so making a document active is how you aim them.
        label: "Make the ACTIVE chart",
        verb: { kind: "setActiveDoc", docId },
      });
    }
    actions.push({ label: "⚑ Snapshot it", verb: { kind: "snapshot", docId } });
    actions.push({ label: "Duplicate document", verb: { kind: "duplicateDoc", docId } });
    actions.push({ label: "Delete document", verb: { kind: "deleteDoc", docId } });
    actions.push({ label: "Inspect", verb: { kind: "inspect", ptype: "doc", value: docId } });
    actions.push({ label: "Add to watchlist", verb: { kind: "watch", ptype: "doc", value: docId } });
    return actions;
  },
};
