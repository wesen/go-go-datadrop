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
import { actionsForVerb, environmentFor } from "../../../store/applyVerb";
import { countLeaves, layoutActions } from "../../../store/layout";
import { save } from "../../../store/persist";
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
export function Workbench() {
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

  // Persist, debounced. A layout write per keystroke would be wasteful and a
  // write per session would lose work.
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = store.getState();
      save(state.world, state.layout);
    }, 500);
    return () => clearTimeout(timer);
  }, [world, space, store]);

  return (
    <PbuiProvider environment={environment} onPerform={perform}>
      <div className={styles.shell}>
        <Surface tone="inverted" border="none">
          <Toolbar tight>
            <Text size="title" strong>
              <span style={{ letterSpacing: "var(--pbui-track-banner)" }}>
                DATADROP — GRAMMAR OF GRAPHICS
              </span>
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
