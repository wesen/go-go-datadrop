import { useCallback, useMemo, type ReactNode } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import "../../../apps/all";
import { useFieldsFor, useTableFor } from "../../../apps/useTable";
import { PbuiProvider, type Verb } from "../../../pbui";
import type { RootState } from "../../../store";
import { actionsForVerb, environmentFor } from "../../../store/applyVerb";

/**
 * The presentation environment for one workbench, and the verb sink beneath it.
 *
 * Split out of the shell (DATADROP-7 DR-52/DR-55) for one reason that is not
 * obvious from looking at it: **the lesson rail has to be a sibling of the
 * shell, inside this provider.** A rail step that teaches the accept protocol
 * — "press Watch…, then click a field chip in another tile" — must call
 * `accept()`, which returns a promise and lives in React context rather than in
 * the store. With the provider inside the shell, a rail rendered beside the
 * shell could not reach it, and the choice would be between duplicating the
 * accept protocol and dropping the one lesson that teaches the least familiar
 * idea in the system.
 *
 * So: `<WorkbenchProviders>{rail}<WorkbenchShell /></WorkbenchProviders>`.
 *
 * Everything here was previously inline in `Workbench`. Nothing about it
 * changed except its address.
 */
export function WorkbenchProviders({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const world = useSelector((state: RootState) => state.world);
  const tableFor = useTableFor();
  // The render path's lookup (DR-40): cheap, and what descriptors use to
  // resolve a field for display.
  const fieldsFor = useFieldsFor();

  /**
   * The environment descriptors resolve against.
   *
   * Rebuilt when the world changes, which is what keeps a menu opened after a
   * document was renamed from naming the old name.
   */
  const environment = useMemo(
    () => environmentFor(world, tableFor, fieldsFor),
    [world, tableFor, fieldsFor],
  );

  /**
   * Where the verbs finally land.
   *
   * This one callback is the entire seam. Descriptors emit serialisable verbs
   * and know nothing about reducers; `actionsForVerb` maps them; nothing in
   * `pbui/` had to change between the phase where verbs were merely displayed
   * and the phase where they were dispatched.
   */
  const perform = useCallback(
    (verb: Verb) => {
      const { world, layout } = store.getState();
      // Unchanged in shape by DATADROP-8: `actionsForVerb` now takes the whole
      // state and may return a thunk, and RTK's dispatch takes thunks — so the
      // loop is the same loop. The cast is because `useDispatch` is untyped
      // here; the store's own `AppDispatch` knows about thunks.
      for (const action of actionsForVerb(verb, { world, layout }, environment)) {
        (dispatch as (action: unknown) => unknown)(action);
      }
    },
    [dispatch, environment, store],
  );

  return (
    <PbuiProvider environment={environment} onPerform={perform}>
      {children}
    </PbuiProvider>
  );
}
