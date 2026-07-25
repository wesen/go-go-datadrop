import { leaf, split, type LayoutState, type Workspace } from "./layout";
import { newId } from "./world";

/**
 * The hardwired workspaces (DR-29).
 *
 * Fixed ids, not newId(), which is what lets mergePinned match them across
 * reloads. `welcome` is what an unauthenticated visitor sees; `account` is
 * where signing up lands.
 */
export const WELCOME_SPACE_ID = "ws-welcome";
export const ACCOUNT_SPACE_ID = "ws-account";

export function pinnedSpaces(): Workspace[] {
  return [
    {
      id: WELCOME_SPACE_ID,
      name: "welcome",
      pinned: true,
      tree: split("row", leaf("signin"), leaf("about"), 0.42),
    },
    {
      id: ACCOUNT_SPACE_ID,
      name: "account",
      pinned: true,
      tree: split(
        "row",
        leaf("profile"),
        split("col", leaf("tokens"), leaf("upload"), 0.55),
        0.38,
      ),
    },
  ];
}

/**
 * Code-defined spaces win; user-created ones survive.
 *
 * The asymmetry is the point. A pinned space is taken wholesale from source so
 * that a new tile added in a release actually appears; everything else comes
 * from storage so that a user's arrangement is not thrown away.
 */
export function mergePinned(restored: Workspace[]): Workspace[] {
  const pinned = pinnedSpaces();
  const pinnedIds = new Set(pinned.map((space) => space.id));
  return [...pinned, ...restored.filter((space) => !pinnedIds.has(space.id))];
}

/**
 * The default workspace layouts, retargeted from pbui-gog.jsx:2427-2456.
 *
 * `build` is the daily cockpit and is deliberately the same arrangement the
 * deleted App.tsx had — pipeline and encoding on the left, chart and table on
 * the right — assembled out of tiles rather than out of a fixed grid. That is
 * the phase-3 acceptance test in one preset: everything the old shell did, in
 * the new one.
 */
export function defaultSpaces(): LayoutState {
  const spaces: Workspace[] = [
    ...pinnedSpaces(),
    {
      id: newId(),
      name: "build",
      tree: split(
        "row",
        split("col", leaf("pipeline"), leaf("encode"), 0.55),
        split("col", leaf("chart"), leaf("table"), 0.6),
        0.4,
      ),
    },
    {
      id: newId(),
      name: "explore",
      tree: split("row", leaf("sources"), split("col", leaf("chart"), leaf("inspector"), 0.6), 0.34),
    },
    {
      id: newId(),
      name: "gallery",
      tree: split("row", leaf("charts"), split("col", leaf("gallery"), leaf("compare"), 0.5), 0.4),
    },
    {
      id: newId(),
      name: "1·objects",
      tree: split("row", leaf("tut1"), split("col", leaf("sources"), leaf("inspector"), 0.55), 0.44),
    },
    {
      id: newId(),
      name: "2·pipeline",
      tree: split("row", leaf("tut2"), split("col", leaf("pipeline"), leaf("table"), 0.5), 0.42),
    },
    {
      id: newId(),
      name: "3·encode",
      tree: split("row", leaf("tut3"), split("col", leaf("encode"), leaf("chart"), 0.45), 0.42),
    },
    {
      id: newId(),
      name: "4·docs",
      tree: split("row", leaf("tut4"), split("col", leaf("charts"), leaf("gallery"), 0.55), 0.42),
    },
    {
      id: newId(),
      name: "help",
      tree: split("row", leaf("about"), split("col", leaf("watch"), leaf("trace"), 0.45), 0.55),
    },
  ];
  // `build` rather than spaces[0], which is now the pinned `welcome` space.
  // A signed-in user should land in the cockpit; the signed-out gate in
  // Workbench forces `welcome` when there is nobody to show it to.
  const build = spaces.find((space) => space.name === "build");
  return { spaces, currentSpaceId: (build ?? spaces[0]!).id };
}
