import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Presentation } from "../../../pbui";
import type { RootState } from "../../../store";
import { layoutActions } from "../../../store/layout";
import { SectionLabel, Text } from "../../foundation";
import { Stack, Toolbar } from "../../layout";

/**
 * The workspace strip.
 *
 * Workspaces are named tile arrangements over ONE world. Switching is a state
 * change, not a remount of the data: the documents, the snapshots and the
 * cached tables are the same objects, which is why an accept started in one
 * workspace can be satisfied in another.
 */
export function WorkspaceStrip() {
  const dispatch = useDispatch();
  const spaces = useSelector((s: RootState) => s.layout.spaces);
  const current = useSelector((s: RootState) => s.layout.currentSpaceId);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <Toolbar tight>
      <SectionLabel>Workspaces</SectionLabel>
      <Stack direction="row" gap={2} wrap align="center">
        {spaces.map((space) =>
          renaming === space.id ? (
            <input
              key={space.id}
              autoFocus
              defaultValue={space.name}
              aria-label="workspace name"
              onBlur={() => setRenaming(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  dispatch(
                    layoutActions.renameSpace({
                      spaceId: space.id,
                      name: (event.target as HTMLInputElement).value.trim() || space.name,
                    }),
                  );
                  setRenaming(null);
                }
                if (event.key === "Escape") setRenaming(null);
              }}
              style={{
                border: "var(--pbui-border-firm)",
                background: "var(--pbui-pane)",
                fontSize: "var(--pbui-fs-small)",
                width: 100,
              }}
            />
          ) : (
            <Presentation
              key={space.id}
              ptype="workspace"
              value={space.id}
              doc={`<workspace> ${space.name}`}
              onActivate={() => dispatch(layoutActions.setCurrentSpace(space.id))}
              activateDoc="switch to it"
            >
              <span
                style={{
                  border: "var(--pbui-border-firm)",
                  background:
                    current === space.id ? "var(--pbui-selected)" : "var(--pbui-pane-alt)",
                  padding: "0 var(--pbui-space-4)",
                  fontSize: "var(--pbui-fs-small)",
                  fontWeight: current === space.id ? 700 : 400,
                }}
                onDoubleClick={() => setRenaming(space.id)}
              >
                {space.name}
              </span>
            </Presentation>
          ),
        )}
        <button
          type="button"
          onClick={() => dispatch(layoutActions.addSpace())}
          style={{
            border: "var(--pbui-border-firm)",
            boxShadow: "var(--pbui-shadow-hard)",
            background: "var(--pbui-tone-source)",
            padding: "0 var(--pbui-space-3)",
            fontSize: "var(--pbui-fs-small)",
            fontWeight: 700,
          }}
        >
          + workspace
        </button>
        <Text size="tiny" tone="faint">
          L switches · double-click renames · R for duplicate / delete
        </Text>
      </Stack>
    </Toolbar>
  );
}
