import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import "../../../apps/all";
import { useMeQuery } from "../../../api/client";
import { useTableFor } from "../../../apps/useTable";
import {
  AcceptBanner,
  MouseDocLine,
  ObjectMenu,
  PbuiProvider,
  type Verb,
} from "../../../pbui";
import type { RootState } from "../../../store";
import { usePersistence } from "../../../appkit/usePersistence";
import { actionsForVerb, environmentFor } from "../../../store/applyVerb";
import { countLeaves, layoutActions } from "../../../store/layout";
import { ACCOUNT_SPACE_ID, WELCOME_SPACE_ID } from "../../../store/spaces";
import { NodeView, WorkspaceStrip } from "../../organisms";
import { Surface, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import styles from "./Workbench.module.css";

/**
 * The shell.
 *
 * Holds no chart state whatsoever: a workspace strip, a split tree, the accept
 * banner, the object menu and the mouse documentation line. Everything a tile
 * shows lives in the world, which is what this file existing at 100-odd lines
 * demonstrates — the prototype's equivalent is 314 lines because it also holds
 * `labelFor`, `describe` and `actionsFor` (pbui-gog.jsx:2458-2772).
 */
export interface WorkbenchProps {
  /**
   * Where to persist, or null for memory-only.
   *
   * **Defaults to null, and the default is the point** (DATADROP-7 DR-47).
   * Persistence used to be an unconditional effect in this file, which is
   * correct while there is one workbench per page and destructive the moment
   * there is not — five embedded instances would each write to one key, so the
   * reader's real layout would be overwritten by whichever tutorial section
   * they last scrolled past. Defaulting to null means an embedded instance that
   * forgets to opt out is inert rather than destructive; `main.tsx` opts in.
   */
  persistKey?: string | null;
}

export function Workbench({ persistKey = null }: WorkbenchProps = {}) {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const world = useSelector((state: RootState) => state.world);
  const space = useSelector((state: RootState) =>
    state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId),
  );
  const spaceCount = useSelector((state: RootState) => state.layout.spaces.length);
  const tableFor = useTableFor();
  const { data: me } = useMeQuery();

  /**
   * The signed-out gate (DR-31).
   *
   * ONE gate, at the shell, not a check per tile. A per-tile check is a promise
   * to remember it on every future tile, and that promise is always broken. It
   * is not a security boundary either way — the server denies the data
   * regardless — but it is the difference between a sign-in screen and twelve
   * tiles all saying "401".
   */
  const lockedOut = me?.auth_mode === "oidc" && !me.authenticated;

  useEffect(() => {
    if (lockedOut) dispatch(layoutActions.setCurrentSpace(WELCOME_SPACE_ID));
  }, [dispatch, lockedOut]);

  // A first sign-in lands in the account workspace rather than wherever this
  // browser was last, because a new user has nothing to go back to. The flag is
  // true exactly once, so it is read and stripped rather than stored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("first") !== "1") return;
    dispatch(layoutActions.setCurrentSpace(ACCOUNT_SPACE_ID));
    params.delete("first");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }, [dispatch]);

  /**
   * The environment descriptors resolve against.
   *
   * Rebuilt when the world changes, which is what keeps a menu opened after a
   * document was renamed from naming the old name.
   */
  const environment = useMemo(() => environmentFor(world, tableFor), [world, tableFor]);

  /**
   * Where the verbs from phase 1 finally land.
   *
   * This one callback is the entire seam. Descriptors emit serialisable verbs
   * and know nothing about reducers; `actionsForVerb` maps them; nothing in
   * `pbui/` had to change between the phase where verbs were merely displayed
   * and this one.
   */
  const perform = useCallback(
    (verb: Verb) => {
      for (const action of actionsForVerb(verb, store.getState().world, environment)) {
        dispatch(action);
      }
    },
    [dispatch, environment, store],
  );

  usePersistence(persistKey);

  return (
    <PbuiProvider environment={environment} onPerform={perform}>
      <div className={styles.shell}>
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
          </Toolbar>
        </Surface>

        <AcceptBanner />
        {!lockedOut && <WorkspaceStrip />}

        <div className={styles.canvas}>{space && <NodeView node={space.tree} />}</div>

        <MouseDocLine
          ambient={`${space ? countLeaves(space.tree) : 0} tiles · ${spaceCount} workspaces · ${
            world.docOrder.length
          } documents`}
        />
      </div>
      <ObjectMenu />
    </PbuiProvider>
  );
}
