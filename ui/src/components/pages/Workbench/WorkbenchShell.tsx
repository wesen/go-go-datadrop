import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AcceptBanner, MouseDocLine, ObjectMenu } from "../../../pbui";
import type { RootState } from "../../../store";
import { countLeaves } from "../../../store/layout";
import { allApps } from "../../../appkit/registry";
import { commitImport, kindFor } from "../../../store/effects";
import { layoutActions } from "../../../store/layout";
import { BundleDialog, Dialog, NodeView, StageBar, WorkspaceStrip } from "../../organisms";
import { Button, IconButton } from "../../atoms";
import { Surface, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import styles from "./Workbench.module.css";

/**
 * The shell: chrome, a split tree, and the three PBUI surfaces.
 *
 * Holds no chart state whatsoever — a masthead, a workspace strip, a split
 * tree, the accept banner, the object menu and the mouse documentation line.
 * Everything a tile shows lives in the world, which is what this file existing
 * at 100-odd lines demonstrates: the prototype's equivalent is 314 lines
 * because it also holds `labelFor`, `describe` and `actionsFor`
 * (pbui-gog.jsx:2458-2772).
 *
 * **It also holds no application state** (DATADROP-7 DR-52), which is the
 * change this ticket made. The signed-out gate, the `?first=1` URL read, the
 * `useMeQuery` call and the persistence effect were all in here, and all four
 * are routing/session/authentication concerns rather than shell concerns. They
 * ended up here because there was only ever one shell; they moved out the
 * moment there could be five.
 *
 * What is left takes props, so an embedded instance renders the same component
 * as the product with a different configuration rather than a different
 * component. That identity is the whole basis of the tutorial's claim to be
 * executable documentation.
 */
export interface WorkbenchShellProps {
  /**
   * The DATALAB wordmark and its tagline.
   *
   * The product wants it; an instance embedded in a page that already has a
   * masthead does not, and five of them down one page would be absurd.
   *
   * **`?? stage.chrome`, never `&&`** (DATADROP-8 §5.6). Three chrome props now
   * have two possible sources: the stage says what this part of the product
   * looks like, and the instance may override. An instance that says nothing
   * defers to the stage; an instance that says `false` wins. `&&` would make
   * "say nothing" indistinguishable from "say false" and every embedded panel
   * would lose its workspace strip.
   */
  masthead?: boolean;
  /**
   * The workspace strip.
   *
   * Hidden by a stage that holds exactly one workspace, and by a tour section
   * that pins its reader to one layout so the lesson's prose can name what is
   * on screen.
   */
  workspaces?: boolean;
  /** The stage switcher in the masthead. Off for the sign-in stage. */
  stageBar?: boolean;
  /** Extra ambient text for the mouse-doc line, appended to the tile counts. */
  ambient?: string;
  /**
   * Expand to fill the window, and come back.
   *
   * Supplied by an embedded instance, absent in the product — which already
   * fills the window, so a control that promised to do it again would be a lie.
   *
   * Fifteen tiles in a 660px band down a scrolling page is not enough room to
   * do the work a lesson asks for, and asking a reader to open the application
   * in another tab defeats the point of embedding it. The shell renders the
   * control; the instance owns the state, because it owns the box being
   * resized.
   */
  fullFrame?: boolean;
  onToggleFullFrame?: () => void;
}

/**
 * The import dialog, rendered by the shell because it is modal over the whole
 * workbench and opened from a menu three components down.
 *
 * A separate component so the shell does not re-render on every keystroke in
 * the text area: `BundleDialog` holds the text, and only `pendingImport`
 * becoming non-null crosses this boundary.
 *
 * Rendered BEFORE `<ObjectMenu />` so the menu's stacking context wins — it is
 * `z-index: 100` against the dialog's 60, which is what makes right-clicking
 * inside a dialog work at all.
 */
function ImportDialog() {
  const dispatch = useDispatch();
  const pending = useSelector((state: RootState) => state.layout.pendingImport ?? null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setError(null);
    dispatch(layoutActions.closeImport());
  }, [dispatch]);

  if (!pending) return null;

  return (
    <BundleDialog
      kind={kindFor(pending.target)}
      initial={pending.prefill}
      from={pending.from}
      // The registry, not the scope: a bundle naming an application this BUILD
      // lacks is the warning. An application the stage merely does not offer is
      // still installed, and warning about it would be wrong.
      knownApps={new Set(allApps().map((app) => app.id))}
      error={error}
      onCancel={close}
      onConfirm={(text) => {
        const result = (dispatch as (action: unknown) => { ok: boolean; reason?: string })(
          commitImport(text),
        );
        // The dialog already refuses text that will not parse, so reaching here
        // means the caller refused for a reason the dialog could not know —
        // the target vanished while it was open, say. Shown rather than
        // swallowed; the reducer closes the dialog itself on success.
        if (!result.ok) setError(result.reason ?? "that import did not apply");
      }}
    />
  );
}

/**
 * What an export did, stated once, at the moment the user is about to paste.
 *
 * The sentence about what a bundle contains and what it does not is the whole
 * of §7.6 in the interface: it names sources and filter values, which may
 * themselves be sensitive, and it holds no rows and no credentials. Both halves
 * matter and neither is obvious from a JSON blob on a clipboard.
 *
 * The failure case is why this exists at all. The one clipboard write that
 * predates this ticket is `navigator.clipboard?.writeText(secret)` — correct,
 * minimal, and silent — so a browser that refuses leaves the user believing the
 * copy worked.
 */
function ExportNotice() {
  const dispatch = useDispatch();
  const notice = useSelector((state: RootState) => state.layout.notice ?? null);
  const close = useCallback(() => dispatch(layoutActions.dismissNotice()), [dispatch]);
  if (!notice) return null;
  return (
    <Dialog
      title={notice.title}
      onClose={close}
      footer={
        <Button variant="raised" fill="var(--pbui-tone-source)" onClick={close}>
          OK
        </Button>
      }
    >
      <Text size="small" tone={notice.ok ? "default" : "danger"} prose>
        {notice.body}
      </Text>
    </Dialog>
  );
}

export function WorkbenchShell({
  masthead,
  workspaces,
  stageBar,
  ambient,
  fullFrame = false,
  onToggleFullFrame,
}: WorkbenchShellProps = {}) {
  const space = useSelector((state: RootState) =>
    state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId),
  );
  const stage = useSelector((state: RootState) =>
    state.layout.stages.find((s) => s.id === state.layout.currentStageId),
  );
  // Workspaces in THIS stage, not in the layout: the count under the canvas
  // should agree with the strip above it, and the strip is now stage-scoped.
  const spaceCount = useSelector(
    (state: RootState) =>
      state.layout.spaces.filter((s) => s.stageId === state.layout.currentStageId).length,
  );
  const docCount = useSelector((state: RootState) => state.world.docOrder.length);

  const chrome = {
    masthead: masthead ?? stage?.chrome.masthead ?? true,
    workspaces: workspaces ?? stage?.chrome.workspaces ?? true,
    stageBar: stageBar ?? stage?.chrome.stageBar ?? true,
  };

  /**
   * Escape leaves full frame.
   *
   * Registered only while expanded, so a page with six collapsed instances adds
   * no listeners at all — and, more importantly, an Escape meant for the object
   * menu or a pending accept is never intercepted by a workbench that is not
   * covering the window.
   */
  useEffect(() => {
    if (!fullFrame || !onToggleFullFrame) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggleFullFrame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullFrame, onToggleFullFrame]);

  const counts =
    `${space ? countLeaves(space.tree) : 0} tiles · ` +
    `${spaceCount} workspaces · ${docCount} documents`;

  return (
    <>
      <div className={styles.shell}>
        {chrome.masthead && (
          <Surface tone="inverted" border="none">
            <Toolbar tight>
              <Text size="title" strong>
                <span className={styles.wordmark}>DATALAB</span>
              </Text>
              {/* The tagline names the four things the workbench does, in the
                  order a session actually goes: load a source, look at it, ask
                  what a value is, and end up somewhere. It is the only prose in
                  the shell chrome, so it stays on the tiny scale. */}
              <Text size="tiny" tone="faint">
                <span className={styles.tagline}>DATA · EXPLORE · INSPECT · UNDERSTAND</span>
              </Text>
              {/* Top right, as the request asked. Inside the masthead rather
                  than beside the workspace strip, because a stage outranks a
                  workspace and the sign-in stage hides the strip entirely. */}
              {chrome.stageBar && <StageBar />}
            </Toolbar>
          </Surface>
        )}

        <AcceptBanner />

        {(chrome.workspaces || onToggleFullFrame) && (
          <div className={styles.chrome}>
            {chrome.workspaces && <WorkspaceStrip />}
            <span className={styles.chromeSpacer} />
            {onToggleFullFrame && (
              <span className={styles.chromeAction}>
                <IconButton
                  variant="framed"
                  size="tiny"
                  glyph={fullFrame ? "⤡" : "⤢"}
                  label={fullFrame ? "leave full frame (Esc)" : "fill the window"}
                  title={
                    fullFrame
                      ? "shrink back into the page — Esc does the same"
                      : "fill the window, for room to work"
                  }
                  onClick={onToggleFullFrame}
                />
              </span>
            )}
          </div>
        )}

        <div className={styles.canvas}>{space && <NodeView node={space.tree} />}</div>

        <MouseDocLine ambient={ambient ? `${counts} · ${ambient}` : counts} />
      </div>
      <ImportDialog />
      <ExportNotice />
      <ObjectMenu />
    </>
  );
}
