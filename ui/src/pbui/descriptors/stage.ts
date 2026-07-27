import type { PresentationDescriptor } from "../registry";
import type { StageRef } from "../types";
import type { Action } from "../verbs";

/**
 * `<stage>` — a named set of workspaces, an application allow-list and chrome.
 *
 * New in DATADROP-8, and the reason the switcher in the masthead is not a
 * second mechanism: the `▾` button opens *this* menu programmatically, so the
 * same list is reachable by right-click and there is exactly one place stage
 * verbs are defined.
 *
 * The menu does not list the other stages. Switching is what the `<select>`
 * beside it is for, and duplicating the stage list into a menu would give two
 * places to keep in step — the failure the whole descriptor mechanism exists to
 * avoid.
 */
export const stageDescriptor: PresentationDescriptor<StageRef> = {
  ptype: "stage",
  tone: "var(--pbui-tone-doc)",

  label: (stage) => stage.name,

  describe: (stage) => ({
    presentationType: "stage",
    name: stage.name,
    definedInCode: stage.pinned,
    current: stage.current,
  }),

  actions: (stage) => {
    const actions: Action[] = [];

    if (!stage.current) {
      actions.push({
        label: "Switch to it",
        verb: { kind: "switchStage", stageId: stage.stageId },
      });
    }

    actions.push({
      label: "Copy this stage to the clipboard",
      verb: { kind: "exportStage", stageId: stage.stageId },
    });
    actions.push({
      label: "Add a stage from the clipboard …",
      verb: { kind: "importStage" },
    });
    actions.push({
      label: "Add a workspace from the clipboard …",
      verb: { kind: "importWorkspace", stageId: stage.stageId },
    });
    actions.push({
      label: "Save as a template …",
      verb: {
        kind: "storeTemplate",
        source: { kind: "stage", stageId: stage.stageId },
        name: stage.name,
      },
    });

    actions.push({ label: "Inspect", verb: { kind: "inspect", ptype: "stage", value: stage } });

    return actions;
  },
};
