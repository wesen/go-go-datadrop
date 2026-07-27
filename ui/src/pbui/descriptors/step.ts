import type { PresentationDescriptor } from "../registry";
import type { Action } from "../verbs";

/**
 * `<step>` — one verb in the pipeline.
 *
 * "Disable (keep in the chain)" is deliberately worded to say what it does NOT
 * do. A step is an experiment you can switch off, which is the difference
 * between a pipeline and a recording.
 */
export const stepDescriptor: PresentationDescriptor<string> = {
  ptype: "step",
  tone: "var(--pbui-tone-step)",

  label: (stepId) => stepId,

  describe: (stepId) => ({ presentationType: "step", id: stepId }),

  actions: (stepId, env): Action[] => [
    {
      label: "Enable / disable (keeps it in the chain)",
      verb: { kind: "toggleStep", docId: env.activeDocId, stepId },
    },
    { label: "Move up ↑", verb: { kind: "moveStep", docId: env.activeDocId, stepId, by: -1 } },
    { label: "Move down ↓", verb: { kind: "moveStep", docId: env.activeDocId, stepId, by: 1 } },
    { label: "Remove", verb: { kind: "removeStep", docId: env.activeDocId, stepId } },
  ],
};
