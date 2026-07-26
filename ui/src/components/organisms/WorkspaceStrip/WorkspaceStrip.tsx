import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Presentation, usePbui } from "../../../pbui";
import type { RootState } from "../../../store";
import { layoutActions } from "../../../store/layout";
import { SectionLabel, Text } from "../../foundation";
import { Button } from "../../atoms";
import { InlineRename } from "../../molecules";
import { Stack, Toolbar } from "../../layout";

/**
 * The workspace strip.
 *
 * Workspaces are named tile arrangements over ONE world. Switching is a state
 * change, not a remount of the data: the documents, the snapshots and the
 * cached tables are the same objects, which is why an accept started in one
 * workspace can be satisfied in another.
 *
 * **Scoped to the current stage** since DATADROP-8. Before stages this was
 * every workspace in the layout, which is how the account arrangement and the
 * four tutorial arrangements ended up in the same flat strip as the user's own
 * — twelve chips, two of them marked ⌾ and needing a tooltip to explain why
 * they were different.
 *
 * ## The help text is finally true
 *
 * It has ended with "R for duplicate / delete" since DATADROP-4, describing a
 * feature that did not exist: `workspace` was a declared presentation type with
 * no descriptor, so right-clicking a chip produced "no verbs for this object
 * yet". `pbui/descriptors/workspace.ts` is what makes the sentence true, and it
 * also supplies the keyboard route the double-click never had.
 */
export function WorkspaceStrip() {
  const dispatch = useDispatch();
  const pbui = usePbui();
  // Selected raw and filtered in a memo, not filtered inside the selector: a
  // selector returning a fresh array on every call re-renders on every store
  // change and trips react-redux's identity warning.
  const allSpaces = useSelector((s: RootState) => s.layout.spaces);
  const stageId = useSelector((s: RootState) => s.layout.currentStageId);
  const spaces = useMemo(
    () => allSpaces.filter((space) => space.stageId === stageId),
    [allSpaces, stageId],
  );
  const current = useSelector((s: RootState) => s.layout.currentSpaceId);
  const renaming = useSelector((s: RootState) => s.layout.renamingId);

  return (
    <Toolbar tight>
      <SectionLabel>Workspaces</SectionLabel>
      <Stack direction="row" gap={2} wrap align="center">
        {spaces.map((space) =>
          // A pinned space cannot be renamed: the name comes from code and
          // would be overwritten on the next load, so offering the edit would
          // be a lie (DR-29).
          renaming === space.id && !space.pinned ? (
            <InlineRename
              key={space.id}
              initial={space.name}
              label="workspace name"
              fallback={space.name}
              // Through `perform`, not `dispatch`, so the rename appears in the
              // trace as a verb like every other user decision.
              onCommit={(name) =>
                pbui.perform({ kind: "renameWorkspace", spaceId: space.id, name })
              }
              onCancel={() => dispatch(layoutActions.beginRename(null))}
            />
          ) : (
            <Presentation
              key={space.id}
              ptype="workspace"
              // A WorkspaceRef, not a bare id: the descriptor has to know
              // whether this is the last workspace in its stage, and that is a
              // question about the layout that a descriptor may not ask.
              value={{
                spaceId: space.id,
                name: space.name,
                stageId: space.stageId,
                pinned: space.pinned === true,
                canDelete: spaces.length > 1,
              }}
              doc={`<workspace> ${space.name}`}
              onActivate={() => dispatch(layoutActions.setCurrentSpace(space.id))}
              activateDoc="switch to it"
            >
              {/* biome-ignore lint/a11y/noStaticElementInteractions: the interactive element is the Presentation around this span — it carries tabIndex, role and the key handlers. What this span adds is double-click-to-rename; the keyboard route is "Rename this workspace …" in the object menu, which DATADROP-8 added. */}
              <span
                style={{
                  border: "var(--pbui-border-firm)",
                  background:
                    current === space.id ? "var(--pbui-selected)" : "var(--pbui-pane-alt)",
                  padding: "0 var(--pbui-space-4)",
                  fontSize: "var(--pbui-fs-small)",
                  fontWeight: current === space.id ? 700 : 400,
                }}
                onDoubleClick={() => !space.pinned && dispatch(layoutActions.beginRename(space.id))}
                title={space.pinned ? "defined in code — cannot be renamed or deleted" : undefined}
              >
                {space.pinned ? `⌾ ${space.name}` : space.name}
              </span>
            </Presentation>
          ),
        )}
        <Button
          variant="raised"
          fill="var(--pbui-tone-source)"
          onClick={() => dispatch(layoutActions.addSpace())}
        >
          + workspace
        </Button>
        <Text size="tiny" tone="faint">
          L switches · double-click renames · R for rename / duplicate / delete / export · ⌾ is
          defined in code
        </Text>
      </Stack>
    </Toolbar>
  );
}
