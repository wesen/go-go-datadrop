import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store";
import { allApps, type AppDescriptor } from "./registry";

/**
 * Which applications this workbench offers.
 *
 * **The registry stays global; the visible set is per instance** (DATADROP-7
 * DR-53). Applications are stateless components, so a second registry would buy
 * nothing and cost the class of bug where an application is registered in one
 * and missing from another — which surfaces as a tile rendering "unknown app"
 * with no way to find out why.
 *
 * What a tour section actually needs is narrower than a registry: the grammar
 * track should not offer the token manager in its tile dropdown, because the
 * dropdown is a menu of *what this panel is for*. So the allow-list is a
 * rendering concern, applied by `Tile`'s application picker and by the launcher,
 * and it deliberately does not stop an app from being *mounted* — a tile whose
 * layout names an excluded application still renders it, because the alternative
 * is a seeded layout that silently loses a tile.
 *
 * With no provider the scope is every registered application, which is what the
 * product wants and means no call site has to opt in.
 *
 * ## Three levels, intersected (DATADROP-8 DR-61)
 *
 * | Level | Set by | Why |
 * |---|---|---|
 * | Instance | `InstanceConfig.apps` | a tour section should not offer the token manager |
 * | Stage | `Stage.apps` | "a login stage that only has help and sign in" |
 * | Workspace | `Workspace.apps` | "limit which tiles can be shown in a workspace" |
 *
 * Intersection rather than override, because override has no defensible
 * direction. If the stage wins, an instance embedded in a tutorial page can be
 * handed a stage that re-offers everything and DR-53 is undone silently. If the
 * instance wins, a stage cannot narrow anything and the request is
 * unimplementable. Intersection is the only composition in which adding a
 * constraint can never remove one.
 *
 * ## Instance scope FILTERS; stage and workspace scope GREY OUT
 *
 * The two are deliberately different (§6.3), and the distinction fits in a
 * sentence, which is the test of whether it should exist: *a stage is somewhere
 * you are and can leave; an instance is what this page is, and you cannot.* A
 * tour section teaching four applications should show four, because the list is
 * the lesson's vocabulary and a greyed list of twenty-five is noise. A stage
 * hiding an application it does not offer teaches the user that it does not
 * exist, which is the failure `verbs.ts` already argues against for verbs.
 */
const AppScopeContext = createContext<readonly string[] | null>(null);

export function AppScope({ apps, children }: { apps?: readonly string[]; children: ReactNode }) {
  // Frozen into a memo so the context value does not change identity on every
  // render of whatever holds the config object.
  const value = useMemo(() => (apps ? [...apps] : null), [apps]);
  return <AppScopeContext.Provider value={value}>{children}</AppScopeContext.Provider>;
}

/** `null` means "no constraint at this level". */
export type Scope = readonly string[] | null;

/**
 * Most restrictive wins; `null` contributes nothing.
 *
 * An empty result is possible — a stage offering `["signin"]` inside an instance
 * offering `["chart"]` — and it must not produce an empty dropdown. `Tile` falls
 * back to its own-application rule and `LauncherApp` shows its empty state.
 */
export function intersectScopes(...scopes: Scope[]): Scope {
  const present = scopes.filter((s): s is readonly string[] => s !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => {
    const keep = new Set(b);
    return a.filter((id) => keep.has(id));
  });
}

/**
 * The applications a picker should offer, in registration order.
 *
 * Registration order rather than the allow-list's order: the launcher and the
 * tile dropdown read as the same list everywhere, and a tour section should not
 * be able to reorder the vocabulary it is teaching.
 *
 * **Instance scope only.** Stage and workspace scope are reported by
 * `useAppScope().reasonFor`, because they are shown disabled rather than hidden.
 */
export function useScopedApps(): AppDescriptor[] {
  const scope = useContext(AppScopeContext);
  const all = allApps();
  if (!scope) return all;
  const allowed = new Set(scope);
  return all.filter((app) => allowed.has(app.id));
}

export interface AppScopeView {
  /** What to render: the registry narrowed by the instance's allow-list. */
  apps: AppDescriptor[];
  /** Why an offered application may not be chosen here, or undefined. */
  reasonFor(id: string): string | undefined;
}

/**
 * The composed scope, with a reason per excluded application.
 *
 * Selectors return the stored arrays by reference rather than deriving new ones,
 * so this adds no re-renders: `stage.apps` and `space.apps` are the same objects
 * across every render in which the layout did not change.
 */
export function useAppScope(): AppScopeView {
  const apps = useScopedApps();
  const stage = useSelector((state: RootState) =>
    state.layout.stages.find((s) => s.id === state.layout.currentStageId),
  );
  const space = useSelector((state: RootState) =>
    state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId),
  );
  const stageApps = stage?.apps ?? null;
  const stageName = stage?.name ?? "this";
  const spaceApps = space?.apps ?? null;

  return useMemo(() => {
    const inStage = stageApps === null ? null : new Set(stageApps);
    const inSpace = spaceApps === null ? null : new Set(spaceApps);
    return {
      apps,
      reasonFor(id: string) {
        if (inStage && !inStage.has(id)) return `not offered by the ${stageName} stage`;
        if (inSpace && !inSpace.has(id)) return "not offered by this workspace";
        return undefined;
      },
    };
  }, [apps, stageApps, spaceApps, stageName]);
}
