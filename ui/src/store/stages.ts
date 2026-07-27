import {
  leaf,
  split,
  type AppId,
  type LayoutState,
  type Node,
  type Stage,
  type StageId,
  type Workspace,
} from "./layout";
import { newId } from "./world";

/**
 * The hardwired stages (DATADROP-8 DR-59), and the workspaces that belong to
 * them.
 *
 * This file was `spaces.ts`. It defined two hardwired *workspaces* —
 * `ws-welcome` (sign in beside about) and `ws-account` (profile, tokens,
 * upload) — that sat in the same strip as the user's own and had to be
 * explained by a tooltip. They were always stages: `Workbench.tsx` had to
 * *force* the current workspace to one of them twice, an application forcing a
 * layout value, because there was no layer at which "which part of the product
 * am I in" could be said.
 *
 * Fixed ids, not `newId()`, which is what lets `mergeStages` match them across
 * reloads.
 *
 * ## What "hardwired" costs and buys
 *
 * A code-defined stage and its code-defined workspaces are taken wholesale from
 * source on every load; everything else comes from storage. A user who deleted
 * a tile from the account stage in a previous release gets it back; a user who
 * *added* one loses it. That asymmetry is the whole meaning of the word and is
 * the same rule `spaces.ts` stated.
 *
 * The one field a pinned stage keeps from storage is `currentSpaceId`, because
 * that is a memory of where the user was rather than a definition of what the
 * stage is (DR-60). Taking it from source too would reset the account stage to
 * its first workspace on every reload.
 */

export const SIGNIN_STAGE_ID: StageId = "stage-signin";
export const WELCOME_STAGE_ID: StageId = "stage-welcome";
export const ACCOUNT_STAGE_ID: StageId = "stage-account";
export const WORK_STAGE_ID: StageId = "stage-work";

/** The sign-in stage's single workspace. */
export const SIGNIN_SPACE_ID = "ws-signin";
/** The welcome stage's four tutorial workspaces. */
export const TOUR_SPACE_IDS = ["ws-tour-1", "ws-tour-2", "ws-tour-3", "ws-tour-4"] as const;
/** The account stage's workspaces. */
export const ACCOUNT_SPACE_ID = "ws-account";
/**
 * The templates workspace, which the stage menu's "templates …" opens.
 *
 * On the account stage rather than anywhere else because that is what the
 * request asked for: "a button on the top right that is used to manage account,
 * stored workspace templates, etc." The button is the stage menu, and account
 * management is a stage.
 */
export const TEMPLATES_SPACE_ID = "ws-templates";

/**
 * The applications the welcome stage offers.
 *
 * "The welcome global workspace has the welcome + tutorial panes available",
 * plus the four document-bound applications the tutorials actually drive — a
 * tutorial that says "map a field to y" needs an encoding tile to say it about.
 */
const WELCOME_APPS = [
  "about",
  "tut1",
  "tut2",
  "tut3",
  "tut4",
  "lessons",
  "cheat",
  "modules",
  "brief",
  "sources",
  "inspector",
  "chart",
  "table",
  "pipeline",
  "encode",
  "launcher",
] as const;

/** Account surfaces, and nothing that reads a document. */
const ACCOUNT_APPS = ["profile", "tokens", "upload", "templates", "about", "launcher"] as const;

const FULL_CHROME = { masthead: true, workspaces: true, stageBar: true } as const;

export function pinnedStages(): { stages: Stage[]; spaces: Workspace[] } {
  const stages: Stage[] = [
    {
      id: SIGNIN_STAGE_ID,
      name: "sign in",
      // The request, exactly: "a login global workspace that only has help and
      // sign in".
      apps: ["signin", "about"],
      // No stage bar. A visitor who is not signed in must not be offered a
      // switcher to a stage whose every tile would show 401 — the same
      // reasoning as the signed-out gate itself (DATADROP-5 DR-31): one gate at
      // the top rather than a check per tile.
      chrome: { masthead: true, workspaces: false, stageBar: false },
      currentSpaceId: SIGNIN_SPACE_ID,
      pinned: true,
    },
    {
      id: WELCOME_STAGE_ID,
      name: "welcome",
      apps: [...WELCOME_APPS],
      chrome: { ...FULL_CHROME },
      currentSpaceId: TOUR_SPACE_IDS[0],
      pinned: true,
    },
    {
      id: ACCOUNT_STAGE_ID,
      name: "account",
      apps: [...ACCOUNT_APPS],
      chrome: { ...FULL_CHROME },
      currentSpaceId: ACCOUNT_SPACE_ID,
      pinned: true,
    },
    {
      id: WORK_STAGE_ID,
      name: "work",
      // Everything. This is the full view the product has today (request item
      // 3), and the only stage with no allow-list at all.
      apps: null,
      chrome: { ...FULL_CHROME },
      // Deliberately empty: the work stage owns no code-defined workspaces, so
      // there is no fixed id to name here. `mergeStages` and `defaultLayout`
      // both repair an unresolvable pointer to the stage's first workspace,
      // which is exactly what an empty string is asking them to do.
      //
      // A fixed `ws-build` would have been simpler and is wrong: it is an id
      // shared by every store in the process, and `test/instances.test.ts`
      // exists to fail on precisely that — a workspace id two stores agree on
      // that is not code-defined.
      currentSpaceId: "",
      pinned: true,
    },
  ];

  const spaces: Workspace[] = [
    {
      id: SIGNIN_SPACE_ID,
      name: "sign in",
      stageId: SIGNIN_STAGE_ID,
      pinned: true,
      tree: split("row", leaf("signin"), leaf("about"), 0.42),
    },
    {
      id: TOUR_SPACE_IDS[0],
      name: "1·objects",
      stageId: WELCOME_STAGE_ID,
      pinned: true,
      tree: split(
        "row",
        leaf("tut1"),
        split("col", leaf("sources"), leaf("inspector"), 0.55),
        0.44,
      ),
    },
    {
      id: TOUR_SPACE_IDS[1],
      name: "2·pipeline",
      stageId: WELCOME_STAGE_ID,
      pinned: true,
      tree: split("row", leaf("tut2"), split("col", leaf("pipeline"), leaf("table"), 0.5), 0.42),
    },
    {
      id: TOUR_SPACE_IDS[2],
      name: "3·encode",
      stageId: WELCOME_STAGE_ID,
      pinned: true,
      tree: split("row", leaf("tut3"), split("col", leaf("encode"), leaf("chart"), 0.45), 0.42),
    },
    {
      id: TOUR_SPACE_IDS[3],
      name: "4·docs",
      stageId: WELCOME_STAGE_ID,
      pinned: true,
      tree: split("row", leaf("tut4"), split("col", leaf("charts"), leaf("gallery"), 0.55), 0.42),
    },
    {
      id: ACCOUNT_SPACE_ID,
      name: "profile",
      stageId: ACCOUNT_STAGE_ID,
      pinned: true,
      tree: split("row", leaf("profile"), split("col", leaf("tokens"), leaf("upload"), 0.55), 0.38),
    },
    {
      id: TEMPLATES_SPACE_ID,
      name: "templates",
      stageId: ACCOUNT_STAGE_ID,
      pinned: true,
      // One tile. The library is a table with a detail pane and wants the
      // width; a second tile beside it would be furniture.
      tree: leaf("templates"),
    },
  ];

  return { stages, spaces };
}

const PINNED_STAGE_IDS: ReadonlySet<string> = new Set([
  SIGNIN_STAGE_ID,
  WELCOME_STAGE_ID,
  ACCOUNT_STAGE_ID,
  WORK_STAGE_ID,
]);

/** Was this workspace id defined in code by *this* build? */
export function isPinnedSpaceId(id: string): boolean {
  return pinnedStages().spaces.some((space) => space.id === id);
}

/**
 * Code-defined stages and spaces win; user-created ones survive.
 *
 * The successor to `mergePinned`, with the same asymmetry and one addition: a
 * restored stage supplies the code-defined stage's `currentSpaceId`, because
 * that field is a memory rather than a definition (DR-60).
 *
 * Also repairs, because a restored payload is not trusted to be coherent:
 *  - a workspace naming a stage that no longer exists joins `work`;
 *  - a stage whose remembered workspace is gone falls back to its first;
 *  - a stage left with no workspaces at all gets one.
 */
export function mergeStages(
  restoredStages: Stage[],
  restoredSpaces: Workspace[],
): { stages: Stage[]; spaces: Workspace[] } {
  const pinned = pinnedStages();
  const pinnedSpaceIds = new Set(pinned.spaces.map((s) => s.id));

  const stages: Stage[] = [
    ...pinned.stages.map((stage) => {
      const stored = restoredStages.find((s) => s.id === stage.id);
      return stored ? { ...stage, currentSpaceId: stored.currentSpaceId } : stage;
    }),
    ...restoredStages.filter((stage) => !PINNED_STAGE_IDS.has(stage.id)),
  ];

  const known = new Set(stages.map((s) => s.id));
  const spaces: Workspace[] = [
    ...pinned.spaces,
    ...restoredSpaces
      .filter((space) => !pinnedSpaceIds.has(space.id))
      // A workspace whose stage is gone is not discarded: an orphan is still a
      // layout the user built, and dropping it silently is the failure mode
      // DR-73 rejects one level up.
      .map((space) => (known.has(space.stageId) ? space : { ...space, stageId: WORK_STAGE_ID })),
  ];

  for (const stage of stages) {
    let own = spaces.filter((s) => s.stageId === stage.id);
    if (own.length === 0) {
      const space: Workspace = {
        id: newId(),
        name: "build",
        tree: leaf("launcher"),
        stageId: stage.id,
      };
      spaces.push(space);
      own = [space];
    }
    if (!own.some((s) => s.id === stage.currentSpaceId)) {
      stage.currentSpaceId = (own[0] as Workspace).id;
    }
  }

  return { stages, spaces };
}

/**
 * One workspace on one freshly-minted stage.
 *
 * What every embedded instance and every story that seeds a layout wants. The
 * stage is minted rather than reusing a pinned id, because six tour panels
 * sharing one stage id would be harmless today and confusing the moment a stage
 * verb names one.
 *
 * `stageBar: false` because a workbench with one stage offers no choice, and a
 * switcher that cannot switch is furniture that reads as a control. `masthead:
 * false` because the embedding page has its own; an instance that wants one
 * says so, and `??` in the shell lets it win.
 */
export function singleStageLayout(
  name: string,
  tree: Node,
  apps: AppId[] | null = null,
): LayoutState {
  const spaceId = newId();
  const stageId = newId();
  return {
    stages: [
      {
        id: stageId,
        name,
        apps,
        chrome: { masthead: false, workspaces: true, stageBar: false },
        currentSpaceId: spaceId,
      },
    ],
    currentStageId: stageId,
    spaces: [{ id: spaceId, name, tree, stageId }],
    currentSpaceId: spaceId,
  };
}

/**
 * The default layout: the four pinned stages, their workspaces, and the work
 * stage's four user-owned ones.
 *
 * `build` is the daily cockpit and is deliberately the same arrangement the
 * deleted App.tsx had — pipeline and encoding on the left, chart and table on
 * the right — assembled out of tiles rather than out of a fixed grid.
 *
 * The four work-stage workspaces are NOT pinned. They are a starting point the
 * user owns: renameable, deletable, and not re-created behind their back.
 */
export function defaultLayout(): LayoutState {
  const pinned = pinnedStages();
  const work = (name: string, tree: Workspace["tree"]): Workspace => ({
    id: newId(),
    name,
    tree,
    stageId: WORK_STAGE_ID,
  });

  const spaces: Workspace[] = [
    ...pinned.spaces,
    work(
      "build",
      split(
        "row",
        split("col", leaf("pipeline"), leaf("encode"), 0.55),
        split("col", leaf("chart"), leaf("table"), 0.6),
        0.4,
      ),
    ),
    work(
      "explore",
      split("row", leaf("sources"), split("col", leaf("chart"), leaf("inspector"), 0.6), 0.34),
    ),
    work(
      "gallery",
      split("row", leaf("charts"), split("col", leaf("gallery"), leaf("compare"), 0.5), 0.4),
    ),
    work(
      "help",
      split("row", leaf("about"), split("col", leaf("watch"), leaf("trace"), 0.45), 0.55),
    ),
  ];

  // `work` on `build`: a signed-in user lands in the cockpit. The signed-out
  // gate in `Workbench` switches to the sign-in STAGE when there is nobody to
  // show it to, which is the layer that decision belongs at (DR-59).
  const build = spaces.find((space) => space.stageId === WORK_STAGE_ID) as Workspace;
  for (const stage of pinned.stages) {
    if (stage.id === WORK_STAGE_ID) stage.currentSpaceId = build.id;
  }
  return {
    stages: pinned.stages,
    currentStageId: WORK_STAGE_ID,
    spaces,
    currentSpaceId: build.id,
  };
}
