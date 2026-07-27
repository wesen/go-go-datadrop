import type { PresentationDescriptor } from "../registry";
import type { WorkspaceRef } from "../types";
import type { Action } from "../verbs";

/**
 * `<workspace>` — a named binary split tree of tiles, belonging to one stage.
 *
 * The workspace strip has ended its help text with "R for duplicate / delete"
 * since DATADROP-4, describing a feature that did not exist: `workspace` was a
 * declared presentation type with no descriptor, so right-clicking a chip
 * produced the empty menu. This file is what makes that sentence true.
 *
 * The strip's `biome-ignore` comment says the same thing from the other side —
 * double-click-to-rename "genuinely has NO keyboard route today … DATADROP-8
 * adds one". `Rename this workspace …` is that route.
 */
export const workspaceDescriptor: PresentationDescriptor<WorkspaceRef> = {
  ptype: "workspace",
  tone: "var(--pbui-tone-source)",

  label: (space) => space.name,

  describe: (space) => ({
    presentationType: "workspace",
    name: space.name,
    stage: space.stageId,
    definedInCode: space.pinned,
  }),

  actions: (space) => {
    const actions: Action[] = [];

    actions.push({ label: "Switch to it", verb: { kind: "switchStage", stageId: space.stageId } });

    actions.push({
      label: "Rename this workspace …",
      verb: { kind: "beginRenameWorkspace", spaceId: space.spaceId },
      // A pinned workspace's name comes from code and would be overwritten on
      // the next load, so offering the edit would be a lie — the same sentence
      // the strip's tooltip has always shown, now reachable by keyboard.
      ...(space.pinned ? { disabledBecause: "defined in code — cannot be renamed" } : {}),
    });

    actions.push({
      label: "Duplicate",
      verb: { kind: "duplicateWorkspace", spaceId: space.spaceId },
    });

    actions.push({
      label: "Copy this workspace to the clipboard",
      verb: { kind: "exportWorkspace", spaceId: space.spaceId },
    });
    actions.push({
      label: "Add a workspace from the clipboard …",
      verb: { kind: "importWorkspace", stageId: space.stageId },
    });
    actions.push({
      label: "Save as a template …",
      verb: {
        kind: "storeTemplate",
        source: { kind: "workspace", spaceId: space.spaceId },
        name: space.name,
      },
    });

    actions.push({
      label: "Inspect",
      verb: { kind: "inspect", ptype: "workspace", value: space },
    });

    actions.push({
      label: "Delete",
      verb: { kind: "deleteWorkspace", spaceId: space.spaceId },
      ...(space.pinned
        ? { disabledBecause: "defined in code — cannot be deleted" }
        : space.canDelete
          ? {}
          : { disabledBecause: "the last workspace in a stage cannot be deleted" }),
    });

    return actions;
  },
};
