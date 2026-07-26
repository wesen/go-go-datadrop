import { useSelector } from "react-redux";
import { AcceptBanner, MouseDocLine, ObjectMenu } from "../../../pbui";
import type { RootState } from "../../../store";
import { countLeaves } from "../../../store/layout";
import { NodeView, WorkspaceStrip } from "../../organisms";
import { Surface, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import styles from "./Workbench.module.css";

/**
 * The shell: chrome, a split tree, and the three PBUI surfaces.
 *
 * Holds no chart state whatsoever — a masthead, a workspace strip, a split
 * tree, the accept banner, the object menu and the mouse documentation line.
 * Everything a tile shows lives in the world, which is what this file existing
 * at 100-odd lines demonstrates: the prototype's equivalent is 314 lines
 * because it also holds `labelFor`, `describe` and `actionsFor`
 * (pbui-gog.jsx:2458-2772).
 *
 * **It also holds no application state** (DATADROP-7 DR-52), which is the
 * change this ticket made. The signed-out gate, the `?first=1` URL read, the
 * `useMeQuery` call and the persistence effect were all in here, and all four
 * are routing/session/authentication concerns rather than shell concerns. They
 * ended up here because there was only ever one shell; they moved out the
 * moment there could be five.
 *
 * What is left takes props, so an embedded instance renders the same component
 * as the product with a different configuration rather than a different
 * component. That identity is the whole basis of the tutorial's claim to be
 * executable documentation.
 */
export interface WorkbenchShellProps {
  /**
   * The DATALAB wordmark and its tagline.
   *
   * The product wants it; an instance embedded in a page that already has a
   * masthead does not, and five of them down one page would be absurd.
   */
  masthead?: boolean;
  /**
   * The workspace strip.
   *
   * Hidden by the signed-out gate, and by a tour section that pins its reader
   * to one layout so the lesson's prose can name what is on screen.
   */
  workspaces?: boolean;
  /** Extra ambient text for the mouse-doc line, appended to the tile counts. */
  ambient?: string;
}

export function WorkbenchShell({
  masthead = true,
  workspaces = true,
  ambient,
}: WorkbenchShellProps = {}) {
  const space = useSelector((state: RootState) =>
    state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId),
  );
  const spaceCount = useSelector((state: RootState) => state.layout.spaces.length);
  const docCount = useSelector((state: RootState) => state.world.docOrder.length);

  const counts =
    `${space ? countLeaves(space.tree) : 0} tiles · ` +
    `${spaceCount} workspaces · ${docCount} documents`;

  return (
    <>
      <div className={styles.shell}>
        {masthead && (
          <Surface tone="inverted" border="none">
            <Toolbar tight>
              <Text size="title" strong>
                <span className={styles.wordmark}>DATALAB</span>
              </Text>
              {/* The tagline names the four things the workbench does, in the
                  order a session actually goes: load a source, look at it, ask
                  what a value is, and end up somewhere. It is the only prose in
                  the shell chrome, so it stays on the tiny scale. */}
              <Text size="tiny" tone="faint">
                <span className={styles.tagline}>DATA · EXPLORE · INSPECT · UNDERSTAND</span>
              </Text>
            </Toolbar>
          </Surface>
        )}

        <AcceptBanner />
        {workspaces && <WorkspaceStrip />}

        <div className={styles.canvas}>{space && <NodeView node={space.tree} />}</div>

        <MouseDocLine ambient={ambient ? `${counts} · ${ambient}` : counts} />
      </div>
      <ObjectMenu />
    </>
  );
}
