import { createContext, useContext, useMemo, type ReactNode } from "react";
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
 */
const AppScopeContext = createContext<readonly string[] | null>(null);

export function AppScope({ apps, children }: { apps?: readonly string[]; children: ReactNode }) {
  // Frozen into a memo so the context value does not change identity on every
  // render of whatever holds the config object.
  const value = useMemo(() => (apps ? [...apps] : null), [apps]);
  return <AppScopeContext.Provider value={value}>{children}</AppScopeContext.Provider>;
}

/**
 * The applications a picker should offer, in registration order.
 *
 * Registration order rather than the allow-list's order: the launcher and the
 * tile dropdown read as the same list everywhere, and a tour section should not
 * be able to reorder the vocabulary it is teaching.
 */
export function useScopedApps(): AppDescriptor[] {
  const scope = useContext(AppScopeContext);
  const all = allApps();
  if (!scope) return all;
  const allowed = new Set(scope);
  return all.filter((app) => allowed.has(app.id));
}
