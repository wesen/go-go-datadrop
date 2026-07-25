import { leaf, split, type LayoutState, type Workspace } from "./layout";
import { newId } from "./world";

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
  return { spaces, currentSpaceId: spaces[0]!.id };
}
