import { useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { AppScope } from "../../../appkit/AppScope";
import { usePersistence } from "../../../appkit/usePersistence";
import type { FixtureData } from "../../../api/fixtures";
import { makeStore, type AppStore, type PreloadedState } from "../../../store";
import { WorkbenchProviders } from "../Workbench/WorkbenchProviders";
import { WorkbenchShell } from "../Workbench/WorkbenchShell";
import styles from "./WorkbenchInstance.module.css";

/**
 * A whole workbench, sandboxed, embeddable, and as many as you like on a page.
 *
 * This is the unit the landing page composes: five of them down one scrolling
 * page, each with its own documents, its own tile layout and its own accept
 * plumbing, sharing nothing (DATADROP-7 DR-45). The store is the instance
 * boundary — everything an instance owns is either in its store or in React
 * context beneath its `Provider`, and nothing instance-scoped lives in a module.
 *
 * It renders **the same `WorkbenchShell` the product renders**. That identity is
 * not a tidiness argument, it is the entire basis of the claim that the tutorial
 * is executable documentation: the moment a tour needs its own `ChartApp`, a
 * lesson can go stale without anything failing. The differences between the
 * product and a tour panel are all configuration — which applications the
 * dropdown offers, whether there is a masthead, where (if anywhere) to persist.
 *
 * ## Children render inside the providers, beside the shell
 *
 * ```tsx
 * <WorkbenchInstance config={{ apps: ["chart", "pipeline"], spaces: grammarSpaces }}>
 *   <LessonRail lessons={lessonsC} />
 * </WorkbenchInstance>
 * ```
 *
 * The rail is a *sibling* of the shell, not a child of it, and both are under
 * one `PbuiProvider` (DR-55). That placement is what lets a lesson's ▶ runner
 * call `accept()` — a promise-returning context value — so the step that teaches
 * the accept protocol can demonstrate it rather than describe it.
 *
 * ## Reset is remount
 *
 * There is no `reset()`. Give the instance a `key` and change it; React throws
 * the subtree away and the `useRef` null-check below builds a fresh store. The
 * prototype does exactly this (pbui-landing.jsx:2114-2123) and it is the only
 * version that cannot leave a fragment of the old state behind.
 */
export interface InstanceConfig {
  /**
   * The starting state: documents, snapshots, workspaces, split trees.
   *
   * Read once, at construction. Changing it afterwards does nothing — change
   * the `key` instead.
   */
  preloaded?: PreloadedState;
  /**
   * Give a world with no documents one. Default true, as `makeStore`'s is.
   */
  seed?: boolean;
  /**
   * Tables answered from memory instead of from the server (DR-48).
   *
   * With this set the instance never reaches the network — not "prefers not
   * to", never — so a tour panel renders the same charts with the API absent,
   * returning 500, or demanding an account, which is what a landing page's
   * visitor always faces.
   */
  fixtures?: FixtureData;
  /**
   * Which applications the tile dropdown and the launcher offer (DR-53).
   *
   * Omit for every registered application, which is what the product wants.
   */
  apps?: readonly string[];
  /**
   * Where to persist, or null for memory-only.
   *
   * **Null by default**, and unlike the product this is almost never worth
   * changing: an embedded panel that writes to localStorage is a panel that
   * fights every other panel on the page for one key.
   */
  persistKey?: string | null;
  /** The DATALAB wordmark. Off by default: the page has its own masthead. */
  masthead?: boolean;
  /** The workspace strip. On by default — switching layouts is §B's lesson. */
  workspaces?: boolean;
}

export function WorkbenchInstance({
  config = {},
  children,
  className,
}: {
  config?: InstanceConfig;
  children?: ReactNode;
  className?: string;
}) {
  /**
   * One store, built once.
   *
   * A ref with a null check rather than `useState`'s lazy initialiser: both are
   * available on the first render, but StrictMode double-invokes the initialiser
   * and would construct two stores, discarding one after its middleware had
   * already started. The prototype uses the same shape for the same reason
   * (pbui-landing.jsx:2088-2090). An effect would be worse still — the first
   * render must already have a store to hand to `Provider`.
   */
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore({
      preloaded: config.preloaded,
      seed: config.seed,
      fixtures: config.fixtures,
    });
  }

  return (
    <Provider store={storeRef.current}>
      <AppScope apps={config.apps}>
        <div className={className ? `${styles.instance} ${className}` : styles.instance}>
          <WorkbenchProviders>
            {children}
            <WorkbenchShell
              masthead={config.masthead ?? false}
              workspaces={config.workspaces ?? true}
            />
          </WorkbenchProviders>
        </div>
        <InstancePersistence persistKey={config.persistKey ?? null} />
      </AppScope>
    </Provider>
  );
}

/**
 * `usePersistence` needs the store above it, and hooks cannot be called before
 * the `Provider` that supplies it exists. A one-line component is the cheapest
 * way to be inside it.
 *
 * It renders nothing, and with a null key it does nothing — not "writes
 * nothing", but never schedules the timer at all, which is what keeps five
 * instances from running five debounce timers each time the reader touches one.
 */
function InstancePersistence({ persistKey }: { persistKey: string | null }) {
  usePersistence(persistKey);
  return null;
}
