import { useCallback, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { registerApp } from "../../appkit/registry";
import {
  describeBundle,
  portableLeaves,
  type StagePayload,
  type TilePayload,
  type WorkspacePayload,
} from "../../model/portable";
import type { RootState } from "../../store";
import { beginImport, copyTemplate, loadTemplate } from "../../store/effects";
import {
  deleteTemplate,
  listTemplates,
  measureLibrary,
  renameTemplate,
  TEMPLATE_LIMITS,
  type TemplateRecord,
} from "../../store/templates";
import { TemplateTable, type TemplateView } from "../../components/organisms";

/**
 * The stored template library.
 *
 * A thin container, as every application is: it reads `localStorage` through
 * `store/templates.ts`, hands DTOs to `TemplateTable`, and turns the callbacks
 * into thunks.
 *
 * ## Why it re-reads rather than subscribing
 *
 * `localStorage` is not reactive and this is the only writer, so the state that
 * matters is "what is stored right now" and a `useState` bumped after every
 * mutation is the honest model. A `storage` event listener would make a second
 * tab's writes appear here, which sounds better and is worse: a library that
 * changes under the cursor while a confirmation is open is how the wrong row
 * gets deleted.
 *
 * ## Loading always targets THIS stage
 *
 * A workspace template loads into the stage the reader is on, and a stage
 * template makes a new stage. That is the only reading of "Load" that needs no
 * second control, and the import dialog names what will happen before it
 * happens.
 */
function TemplatesApp() {
  const dispatch = useDispatch();
  const stageId = useSelector((state: RootState) => state.layout.currentStageId);
  // A counter rather than the array: the array is re-read on every render
  // anyway, and keeping it in state would give two sources of truth for
  // something localStorage already holds.
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const records = useMemo(() => {
    void generation;
    return listTemplates();
  }, [generation]);

  const templates = useMemo(() => records.map(toView), [records]);
  const measured = useMemo(() => measureLibrary(records), [records]);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  return (
    <TemplateTable
      templates={templates}
      usage={{
        count: measured.count,
        limit: TEMPLATE_LIMITS.count,
        kb: Math.round(measured.bytes / 1024),
        limitKb: TEMPLATE_LIMITS.bytesTotal / 1024,
      }}
      message={message}
      onLoad={(id) => {
        const record = records.find((t) => t.id === id);
        if (!record) return;
        const target =
          record.kind === "stage"
            ? ({ kind: "stage" } as const)
            : record.kind === "workspace"
              ? ({ kind: "workspace", stageId } as const)
              : null;
        if (!target) {
          // A TILE template needs a tile to replace, and this component does
          // not know which one. Said plainly rather than silently doing
          // nothing: the route is the tile's own menu.
          setMessage(
            "A tile template replaces one tile, so load it from that tile's own menu — " +
              "right-click its title and choose “Replace this tile from the clipboard …” " +
              "after copying this template to the clipboard.",
          );
          return;
        }
        setMessage(null);
        (dispatch as (action: unknown) => boolean)(loadTemplate(id, target));
      }}
      onCopy={(id) => {
        setMessage(null);
        void (dispatch as (action: unknown) => Promise<unknown>)(copyTemplate(id));
      }}
      onRename={(id, name) => {
        const result = renameTemplate(id, name);
        setMessage(result.ok ? null : result.reason);
        refresh();
      }}
      onDelete={(id) => {
        deleteTemplate(id);
        setMessage(null);
        refresh();
      }}
      onImport={() => {
        /*
         * There is no "import straight into the library", and that is one
         * mechanism rather than two.
         *
         * A pasted bundle becomes a workspace in this stage — through the same
         * dialog, the same validator and the same confirmation as every other
         * import — and the reader then saves it from the workspace's own menu
         * if they want to keep it. The alternative would be a second parse, a
         * second set of caps and a second describe, all for a shortcut.
         */
        setMessage(
          "Paste a workspace bundle to add it to this stage, then right-click its chip in " +
            "the workspace strip and choose “Save as a template …” to keep it.",
        );
        void (dispatch as (action: unknown) => Promise<unknown>)(
          beginImport({ kind: "workspace", stageId }),
        );
      }}
    />
  );
}

/** A stored record as the table wants it. */
function toView(record: TemplateRecord): TemplateView {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    savedAt: record.savedAt,
    summary: describeBundle(record.bundle),
    apps: appsIn(record),
  };
}

function appsIn(record: TemplateRecord): string[] {
  if (record.kind === "tile") return [(record.bundle.payload as TilePayload).app];
  if (record.kind === "workspace") {
    return portableLeaves((record.bundle.payload as WorkspacePayload).tree).map((l) => l.app);
  }
  return (record.bundle.payload as StagePayload).spaces.flatMap((space) =>
    portableLeaves(space.tree).map((l) => l.app),
  );
}

registerApp({
  id: "templates",
  title: "templates",
  tone: "var(--pbui-tone-neutral)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: TemplatesApp,
});
