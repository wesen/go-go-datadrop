import { newStep, schemaAfter } from "../model/pipeline";
import type { Step } from "../model/pipeline";
import type { Table } from "../model/table";
import { describeFor } from "../pbui/registry";
import type { PbuiEnvironment } from "../pbui/types";
import type { Verb } from "../pbui/verbs";
import { worldActions, type WorldState } from "./world";

/**
 * Where a verb becomes a state change.
 *
 * This is the seam phase 1 designed for. Descriptors emit serialisable verbs
 * and know nothing about reducers; this function is the only place that maps
 * one to the other, so adding a verb means adding one case here rather than
 * threading a dispatch through eleven descriptors.
 *
 * Returns the actions to dispatch rather than dispatching, which keeps it a
 * pure function of (verb, state) and therefore testable without a store.
 */
export function actionsForVerb(
  verb: Verb,
  world: WorldState,
  env: PbuiEnvironment,
): ReturnType<typeof worldActions.setMapping>[] {
  const a = worldActions;
  // The reducers accept `docId: null` and resolve it to the active document
  // themselves, so an ambient verb is resolved at APPLICATION time rather than
  // at menu-build time. The active document can change while a menu is open.
  const out: unknown[] = [];

  const stepFor = (docId: string | null, kind: Step["kind"]): Step | null => {
    const doc = world.docs[docId ?? world.activeDocId ?? ""];
    const table = env.tableFor(docId);
    if (!doc || !table) return null;
    // Mint the step against the schema AS OF the end of the pipeline, so a
    // filter added after a summarize offers the summarize's output columns.
    return newStep(kind, schemaAfter(table, doc.spec.steps, undefined, doc.spec.typeOverrides));
  };

  switch (verb.kind) {
    case "inspect":
      out.push(
        a.inspect({
          title: `<${verb.ptype}>`,
          value: describeFor(verb.ptype, verb.value, env),
        }),
      );
      break;

    case "watch":
      out.push(a.watchAdd(verb.ptype, verb.value));
      break;

    case "setMapping":
      out.push(a.setMapping({ docId: verb.docId, channel: verb.channel, field: verb.field }));
      break;

    case "setGeom":
      out.push(a.setGeom({ docId: verb.docId, geom: verb.geom }));
      break;

    case "setYScale":
      out.push(a.setYScale({ docId: verb.docId, scale: verb.scale }));
      break;

    case "setTypeOverride":
      out.push(a.setTypeOverride({ docId: verb.docId, field: verb.field, type: verb.type }));
      break;

    case "addFilter": {
      const step = stepFor(verb.docId, "filter");
      if (step && step.kind === "filter") {
        out.push(
          a.addStep({
            docId: verb.docId,
            step: { ...step, field: verb.field, op: verb.op, value: verb.value },
          }),
        );
      }
      break;
    }

    case "addSummarize": {
      const step = stepFor(verb.docId, "summarize");
      if (step && step.kind === "summarize") {
        out.push(
          a.addStep({
            docId: verb.docId,
            step: { ...step, by: verb.by, fn: verb.fn, field: verb.field },
          }),
        );
      }
      break;
    }

    case "addSort": {
      const step = stepFor(verb.docId, "sort");
      if (step && step.kind === "sort") {
        out.push(
          a.addStep({ docId: verb.docId, step: { ...step, field: verb.field, dir: verb.dir } }),
        );
      }
      break;
    }

    case "toggleStep":
      out.push(a.toggleStep({ docId: verb.docId, stepId: verb.stepId }));
      break;

    case "moveStep":
      out.push(a.moveStep({ docId: verb.docId, stepId: verb.stepId, by: verb.by }));
      break;

    case "removeStep":
      out.push(a.removeStep({ docId: verb.docId, stepId: verb.stepId }));
      break;

    case "setSource":
      out.push(a.setDocSource({ docId: verb.docId, source: verb.source }));
      break;

    case "setLimit":
      out.push(a.setDocLimit({ docId: verb.docId, limit: verb.limit }));
      break;

    case "newDoc":
      out.push(a.newDoc(verb.source));
      break;

    case "setActiveDoc":
      out.push(a.setActiveDoc(verb.docId));
      break;

    case "duplicateDoc":
      out.push(a.duplicateDoc({ docId: verb.docId, id: crypto.randomUUID() }));
      break;

    case "deleteDoc":
      out.push(a.deleteDoc(verb.docId));
      break;

    case "snapshot":
      // The timestamp is passed in rather than read inside the reducer: a
      // reducer that calls Date.now() is not a pure function of its inputs, and
      // a state tree that changes when you replay it is not replayable.
      out.push(a.snapshot(verb.docId, new Date().toISOString()));
      break;

    case "restoreSnapshot":
      out.push(a.restoreSnapshot({ snapshotId: verb.snapshotId, docId: verb.docId }));
      break;

    case "restoreAsNewDoc":
      // Two actions, in order: the new document becomes active, and the restore
      // then lands on it with docId null.
      out.push(a.newDoc(null));
      out.push(a.restoreSnapshot({ snapshotId: verb.snapshotId, docId: null }));
      break;

    case "pinSnapshot":
      out.push(a.pinSnapshot({ slot: verb.slot, snapshotId: verb.snapshotId }));
      break;

    case "deleteSnapshot":
      out.push(a.deleteSnapshot(verb.snapshotId));
      break;
  }

  return out as ReturnType<typeof worldActions.setMapping>[];
}

/** The environment a descriptor sees, built from world state and a table lookup. */
export function environmentFor(
  world: WorldState,
  tableOf: (docId: string | null) => Table | null,
): PbuiEnvironment {
  return {
    tableFor: (docId) => tableOf(docId ?? world.activeDocId),
    activeDocId: world.activeDocId,
    nameOf: (docId) => world.docs[docId ?? world.activeDocId ?? ""]?.name ?? "—",
    overridesFor: (docId) => world.docs[docId ?? world.activeDocId ?? ""]?.spec.typeOverrides,
  };
}
