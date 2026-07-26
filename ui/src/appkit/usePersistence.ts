import { useEffect } from "react";
import { useSelector, useStore } from "react-redux";
import type { RootState } from "../store";
import { save } from "../store/persist";

/**
 * Write the world and the layout to localStorage, debounced — or don't.
 *
 * Lifted out of the workbench shell (DATADROP-7 DR-47/DR-52). It was an effect
 * inside `Workbench`, which was the right place while there was one workbench
 * per page and the wrong place the moment there was not. Persistence is a
 * property of the *application*, not of the shell: an embedded instance on a
 * landing page renders the identical shell and must write nothing at all.
 *
 * `key === null` means memory-only, and it is the default an embedded instance
 * gets. The early return happens before the timer is created, so a memory-only
 * instance does not merely skip the write — it never schedules anything, which
 * is what keeps five instances on a page from running five 500 ms timers each
 * time the reader touches one of them.
 *
 * 500 ms because a layout write per keystroke would be wasteful and a write per
 * session would lose work.
 */
export function usePersistence(key: string | null): void {
  const store = useStore<RootState>();
  const world = useSelector((state: RootState) => state.world);
  const layout = useSelector((state: RootState) => state.layout);

  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => {
      // Read through the store rather than closing over `world` and `layout`:
      // the timer fires up to 500 ms late, and it should write what is true
      // then rather than what was true when it was scheduled.
      const state = store.getState();
      save(key, state.world, state.layout);
    }, 500);
    return () => clearTimeout(timer);
  }, [key, world, layout, store]);
}
