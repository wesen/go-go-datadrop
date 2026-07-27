import {
  describeBundle,
  measureBundle,
  parseBundle,
  type Bundle,
  type BundleKind,
} from "../model/portable";
import type { BundleSource, ImportTarget } from "../pbui/verbs";
import type { AppThunk } from "./index";
import {
  applyStageBundle,
  applyTileBundle,
  applyWorkspaceBundle,
  bundleForStage,
  bundleForTile,
  bundleForWorkspace,
  idsNeeded,
} from "./bundles";
import { layoutActions } from "./layout";
import { listTemplates, saveTemplate, type SaveResult } from "./templates";
import { newId, worldActions } from "./world";

/**
 * The verbs that end in a promise.
 *
 * `actionsForVerb` stays pure by *returning* one of these rather than running
 * it (DR-68): it is a thunk, and RTK's `dispatch` takes thunks, so the caller's
 * loop is unchanged in shape. The purity claim is not a loophole, and the test
 * that shows it builds a store with a fake clipboard, dispatches the returned
 * thunk and asserts on the JSON — no DOM, no browser, no mock of `navigator`.
 *
 * **The only impure steps in the whole export/import path are `clipboard.write`
 * and `clipboard.read`, and both are parameters.** Building the bundle, parsing
 * it, minting documents and replacing the leaf are pure functions of state and
 * text, tested as such in `test/portable.test.ts`.
 */

export type ExportOutcome = { ok: true; bundle: Bundle } | { ok: false; reason: string };

/**
 * Copy something to the clipboard, and report the outcome.
 *
 * Two failures are distinguished on purpose. `bundleFor*` throws when the
 * object cannot be described — most importantly when the credential audit fires
 * — and `clipboard.write` throws when the platform refused. A user needs to
 * know which: the first is "this cannot be shared", the second is "try again".
 */
function exportBundle(build: (at: string) => Bundle): AppThunk<Promise<ExportOutcome>> {
  return async (dispatch, _getState, { clipboard }) => {
    let bundle: Bundle;
    try {
      // The timestamp is read HERE, in the impure layer, and passed into the
      // pure builder — the same rule `applyVerb`'s snapshot case follows.
      bundle = build(new Date().toISOString());
    } catch (error) {
      const reason = error instanceof Error ? error.message : "could not export";
      dispatch(layoutActions.showNotice({ ok: false, title: "Nothing was copied", body: reason }));
      return { ok: false, reason };
    }
    try {
      await clipboard.write(JSON.stringify(bundle, null, 2));
    } catch (error) {
      const reason =
        error instanceof Error
          ? `the copy did not happen — ${error.message}`
          : "the copy did not happen";
      dispatch(layoutActions.showNotice({ ok: false, title: "Nothing was copied", body: reason }));
      return { ok: false, reason };
    }
    dispatch(worldActions.noteExport(bundle.kind, bundle.name));
    // The confirmation states what a bundle contains AND what it does not, once,
    // at the moment the user is about to paste it somewhere. It names sources
    // and filter values — which may themselves be sensitive — and it contains no
    // rows and no credentials, and the user should be told both.
    const measured = measureBundle(bundle);
    dispatch(
      layoutActions.showNotice({
        ok: true,
        title: "Copied to the clipboard",
        body:
          `${describeBundle(bundle)} ${Math.max(1, Math.round(measured.bytes / 1024))} kB. ` +
          "It names the sources these tiles read and the filters you set on them. " +
          "It contains no rows and no credentials.",
      }),
    );
    return { ok: true, bundle };
  };
}

export function exportTile(nodeId: string): AppThunk<Promise<ExportOutcome>> {
  return (dispatch, getState, extra) => {
    const { world, layout } = getState();
    return exportBundle((at) => bundleForTile({ world, layout }, nodeId, at))(
      dispatch,
      getState,
      extra,
    );
  };
}

export function exportWorkspace(spaceId: string): AppThunk<Promise<ExportOutcome>> {
  return (dispatch, getState, extra) => {
    const { world, layout } = getState();
    return exportBundle((at) => bundleForWorkspace({ world, layout }, spaceId, at))(
      dispatch,
      getState,
      extra,
    );
  };
}

export function exportStage(stageId: string): AppThunk<Promise<ExportOutcome>> {
  return (dispatch, getState, extra) => {
    const { world, layout } = getState();
    return exportBundle((at) => bundleForStage({ world, layout }, stageId, at))(
      dispatch,
      getState,
      extra,
    );
  };
}

/** The bundle kind an import target will accept. */
export function kindFor(target: ImportTarget): BundleKind {
  return target.kind === "tile" ? "tile" : target.kind === "workspace" ? "workspace" : "stage";
}

/**
 * Open the import dialog, prefilled only if the clipboard holds a bundle of the
 * right kind (DR-67).
 *
 * The empty path is *the* path and the prefill is the optimisation. Firefox
 * does not implement `readText` for web content at all, so a flow that depends
 * on it does not exist for a large share of users — and the failure is a
 * rejected promise inside a click handler, so the button appears to do nothing.
 *
 * The parse is a **relevance** check as much as a validity one. A clipboard
 * holding a paragraph of prose must not produce a dialog prefilled with a
 * paragraph of prose that the user then has to select and delete.
 */
export function beginImport(target: ImportTarget): AppThunk<Promise<void>> {
  return async (dispatch, _getState, { clipboard }) => {
    const text = await clipboard.read();
    const usable = text !== null && text !== "" && parseBundle(text, kindFor(target)).ok;
    dispatch(
      layoutActions.openImport({
        target,
        prefill: usable ? (text as string) : "",
        from: usable ? "clipboard" : null,
      }),
    );
  };
}

/** Open the import dialog with text already in it — the template library's route in. */
export function beginImportWithText(target: ImportTarget, text: string): AppThunk {
  return (dispatch) => {
    dispatch(layoutActions.openImport({ target, prefill: text, from: "template" }));
  };
}

/* ------------------------------------------------------------ templates -- */

/**
 * Save something as a named template.
 *
 * "Copy this to the clipboard" and "save this as a template" are the same code
 * with a different sink — which is DR-71 paying for itself, and is why the
 * library can offer "Copy to clipboard" on every row for nothing.
 */
export function storeTemplate(source: BundleSource, name: string): AppThunk<SaveResult> {
  return (dispatch, getState) => {
    const { world, layout } = getState();
    const at = new Date().toISOString();
    let bundle: Bundle;
    try {
      bundle =
        source.kind === "tile"
          ? bundleForTile({ world, layout }, source.nodeId, at)
          : source.kind === "workspace"
            ? bundleForWorkspace({ world, layout }, source.spaceId, at)
            : bundleForStage({ world, layout }, source.stageId, at);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "could not build that bundle";
      dispatch(layoutActions.showNotice({ ok: false, title: "Nothing was saved", body: reason }));
      return { ok: false, reason };
    }

    const result = saveTemplate({ id: newId(), name, kind: bundle.kind, savedAt: at, bundle });
    dispatch(
      layoutActions.showNotice(
        result.ok
          ? {
              ok: true,
              title: "Saved as a template",
              body: `“${name}” — ${describeBundle(bundle)} Open the templates workspace on the account stage to load it.`,
            }
          : { ok: false, title: "Nothing was saved", body: result.reason },
      ),
    );
    return result;
  };
}

/**
 * Load a stored template, through the import dialog rather than straight in.
 *
 * Loading a template IS an import (DR-71), so it goes through the same
 * validator, the same describe function and the same confirmation. The user
 * gets a chance to read what they are about to add, and there is one code path
 * to keep correct rather than two.
 */
export function loadTemplate(templateId: string, target: ImportTarget): AppThunk<boolean> {
  return (dispatch) => {
    const record = listTemplates().find((t) => t.id === templateId);
    if (!record) return false;
    dispatch(beginImportWithText(target, JSON.stringify(record.bundle, null, 2)));
    return true;
  };
}

/** Put a stored template on the clipboard, unchanged. */
export function copyTemplate(templateId: string): AppThunk<Promise<ExportOutcome>> {
  return (dispatch, getState, extra) => {
    const record = listTemplates().find((t) => t.id === templateId);
    if (!record) {
      return Promise.resolve<ExportOutcome>({ ok: false, reason: "that template is gone" });
    }
    return exportBundle(() => record.bundle)(dispatch, getState, extra);
  };
}

export type CommitResult = { ok: true } | { ok: false; reason: string };

/**
 * Apply the text in the dialog.
 *
 * A thunk rather than a reducer because it mints ids: `newId()` calls
 * `crypto.randomUUID()`, and a reducer that does that is not a pure function of
 * its inputs — a state tree that changes when you replay it is not replayable.
 * The world slice already faced this and solved it the same way, by taking the
 * id from the caller (`duplicateDoc`), so the ids are minted here and the
 * reducers receive fully-formed nodes.
 */
export function commitImport(text: string): AppThunk<CommitResult> {
  return (dispatch, getState) => {
    const pending = getState().layout.pendingImport;
    if (!pending) return { ok: false, reason: "there is no import in progress" };

    const parsed = parseBundle(text, kindFor(pending.target));
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    const bundle = parsed.bundle;
    const ids = Array.from({ length: idsNeeded(bundle) }, () => newId());

    if (pending.target.kind === "tile" && bundle.kind === "tile") {
      const { leaf, docs } = applyTileBundle(bundle as Bundle<"tile">, ids);
      dispatch(worldActions.addDocs(docs));
      dispatch(layoutActions.replaceLeafFromBundle({ nodeId: pending.target.nodeId, leaf }));
      return { ok: true };
    }
    if (pending.target.kind === "workspace" && bundle.kind === "workspace") {
      const { space, docs } = applyWorkspaceBundle(
        bundle as Bundle<"workspace">,
        pending.target.stageId,
        ids,
      );
      dispatch(worldActions.addDocs(docs));
      dispatch(layoutActions.insertWorkspaceFromBundle({ space }));
      return { ok: true };
    }
    if (pending.target.kind === "stage" && bundle.kind === "stage") {
      const { stage, spaces, docs } = applyStageBundle(bundle as Bundle<"stage">, ids);
      dispatch(worldActions.addDocs(docs));
      dispatch(layoutActions.insertStageFromBundle({ stage, spaces }));
      return { ok: true };
    }
    // Unreachable: `parseBundle` was given the expected kind. Stated rather than
    // left to fall through, because a silent fall-through here would close the
    // dialog with nothing applied and no explanation.
    return { ok: false, reason: "that bundle does not fit here" };
  };
}
