import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMeQuery } from "../../../api/client";
import { AppScope } from "../../../appkit/AppScope";
import { usePersistence } from "../../../appkit/usePersistence";
import type { RootState } from "../../../store";
import { layoutActions } from "../../../store/layout";
import { ACCOUNT_STAGE_ID, SIGNIN_STAGE_ID } from "../../../store/stages";
import { WorkbenchProviders } from "./WorkbenchProviders";
import { WorkbenchShell } from "./WorkbenchShell";
import styles from "./Workbench.module.css";

/**
 * The application.
 *
 * Everything here is a *session* concern rather than a shell concern: who is
 * signed in, where a first sign-in should land, and where this browser's layout
 * is stored. All four used to live inside the shell, and all four had to leave
 * for the landing page to be possible (DATADROP-7 DR-52).
 *
 * The failure modes are the argument. With five instances on a page and this
 * code still in the shell:
 *
 *  - five `GET /v1/me` requests on load, and — worse — five tutorial sections
 *    forcing themselves to the `welcome` workspace for an anonymous visitor,
 *    which is what every landing-page visitor is. Every embedded workbench
 *    would show the sign-in tile.
 *  - five instances racing to consume one `?first=1` query parameter and
 *    rewrite one URL. Exactly one wins; the other four have already jumped to
 *    the account workspace, discarding their seeded layout.
 *
 * There is no equivalent risk in the shell itself, which is now a pure function
 * of the store beneath it. That is the property that makes `WorkbenchInstance`
 * safe.
 *
 * This component requires a `<Provider>` above it; `main.tsx` supplies the one
 * store the product has.
 */
export interface WorkbenchProps {
  /**
   * Where to persist, or null for memory-only.
   *
   * **Defaults to null, and the default is the point** (DR-47). Persistence
   * used to be an unconditional effect in the shell, which is correct while
   * there is one workbench per page and destructive the moment there is not —
   * five embedded instances would each write to one key, so the reader's real
   * layout would be overwritten by whichever tutorial section they last
   * scrolled past, with no error and no symptom until they next reloaded.
   *
   * Defaulting to null means an embedded instance that forgets to opt out is
   * inert rather than destructive. `main.tsx` opts in, in one place, in a file
   * whose job is to know that it is the application.
   */
  persistKey?: string | null;
}

/** What the sign-in stage offers, filtered rather than greyed. See below. */
const SIGNIN_APPS = ["signin", "about"] as const;

export function Workbench({ persistKey = null }: WorkbenchProps = {}) {
  const dispatch = useDispatch();
  const { data: me } = useMeQuery();

  /**
   * The signed-out gate (DR-31).
   *
   * ONE gate, at the application, not a check per tile. A per-tile check is a
   * promise to remember it on every future tile, and that promise is always
   * broken. It is not a security boundary either way — the server denies the
   * data regardless — but it is the difference between a sign-in screen and
   * twelve tiles all saying "401".
   */
  const lockedOut = me?.auth_mode === "oidc" && !me.authenticated;

  /**
   * The gate sets a STAGE, not a workspace (DATADROP-8 DR-59).
   *
   * This is the line that proves the two hardwired workspaces were always
   * stages: an application was forcing a *layout* value, twice, because there
   * was no layer at which "which part of the product am I in" could be said.
   * The sign-in stage offers two applications and hides both the workspace
   * strip and the stage switcher, so there is no route from it to a stage whose
   * every tile would show 401 — which is what made `workspaces={!lockedOut}`
   * necessary below and is now the stage's own chrome.
   */
  useEffect(() => {
    if (lockedOut) dispatch(layoutActions.setCurrentStage(SIGNIN_STAGE_ID));
  }, [dispatch, lockedOut]);

  // A first sign-in lands in the account stage rather than wherever this
  // browser was last, because a new user has nothing to go back to. The flag is
  // true exactly once, so it is read and stripped rather than stored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("first") !== "1") return;
    dispatch(layoutActions.setCurrentStage(ACCOUNT_STAGE_ID));
    params.delete("first");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }, [dispatch]);

  const onSignIn = useSelector(
    (state: RootState) => state.layout.currentStageId === SIGNIN_STAGE_ID,
  );

  usePersistence(persistKey);

  return (
    <div className={styles.app}>
      {/*
        The sign-in stage is the ONE stage that also narrows the instance scope.

        Stage scope normally greys an application out with a reason, because
        hiding an unavailable option hides the rule that makes it unavailable
        (§6.3). On the sign-in screen that produces twenty-three greyed rows in
        a two-tile layout, which is noise rather than teaching: a visitor who is
        not signed in is not learning the vocabulary, they are signing in. An
        instance scope filters, so the picker offers exactly `sign in` and
        `about / help`.

        It sits here, beside the gate that put the reader on that stage, rather
        than as a flag on Stage — one exception written where its reason is
        readable beats a field every future stage has to have an opinion about.
      */}
      <AppScope apps={onSignIn ? SIGNIN_APPS : undefined}>
        <WorkbenchProviders>
          {/* No chrome props: the stage decides now. `workspaces={!lockedOut}`
              used to be the whole of the signed-out chrome rule, and it lived
              here because there was nowhere else to put it. */}
          <WorkbenchShell />
        </WorkbenchProviders>
      </AppScope>
    </div>
  );
}
