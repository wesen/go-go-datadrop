import { useDispatch, useSelector } from "react-redux";
import { appFor, allApps } from "../../../apps/registry";
import { Presentation, usePbui } from "../../../pbui";
import type { RootState } from "../../../store";
import { layoutActions, type Node } from "../../../store/layout";
import { Text } from "../../foundation";
import { useDrag } from "./useDrag";
import styles from "./Tile.module.css";

/**
 * One tile: a title bar and an application.
 *
 * The tile holds `app` and `docId` and nothing else (DR-11). Everything the
 * application shows lives in the world, which is why swapping two tiles is a
 * two-field exchange and closing one loses nothing.
 */
export function Tile({ node }: { node: Extract<Node, { type: "leaf" }> }) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const app = appFor(node.app);
  const docName = useSelector((state: RootState) =>
    node.docId ? (state.world.docs[node.docId]?.name ?? null) : null,
  );
  const canClose = useSelector((state: RootState) => {
    const space = state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId);
    if (!space) return false;
    const count = (n: Node): number => (n.type === "leaf" ? 1 : count(n.a) + count(n.b));
    return count(space.tree) > 1;
  });

  const { dragging, zone, onGripPointerDown, register } = useDrag(node.id);

  const title = app ? app.title : node.app;
  const label = docName ? `${title} · ${docName}` : title;

  const zoneStyle =
    zone === "left"
      ? { left: 0, top: 0, bottom: 0, width: "50%" }
      : zone === "right"
        ? { right: 0, top: 0, bottom: 0, width: "50%" }
        : zone === "top"
          ? { top: 0, left: 0, right: 0, height: "50%" }
          : zone === "bottom"
            ? { bottom: 0, left: 0, right: 0, height: "50%" }
            : zone === "center"
              ? { inset: 0 }
              : null;

  const Component = app?.Component;

  return (
    <section
      ref={register}
      // A landmark per tile, named by its application and document, so the
      // workspace is navigable by region rather than by tabbing through it.
      aria-label={label}
      className={[styles.tile, dragging ? styles.dragging : ""].filter(Boolean).join(" ")}
      style={{ background: app ? undefined : "var(--pbui-pane-alt)" }}
    >
      {zoneStyle && (
        <div className={styles.zone} style={zoneStyle}>
          <span className={styles.zoneLabel}>
            {zone === "center" ? "⇄ swap applications" : "split-dock here · the source tile closes"}
          </span>
        </div>
      )}

      <div className={styles.title} style={{ background: app?.tone ?? "var(--pbui-pane-alt)" }}>
        <span
          className={styles.grip}
          onPointerDown={onGripPointerDown}
          onMouseEnter={() =>
            pbui.setMouseDoc(
              "drag ⠿ — drop on a tile's CENTRE to swap applications, or near an EDGE to split-dock",
            )
          }
          onMouseLeave={() => pbui.setMouseDoc(null)}
          aria-hidden="true"
        >
          ⠿
        </span>

        <Presentation
          ptype="tile"
          value={node.id}
          doc={`<tile> ${label} — split / close / swap`}
        >
          <Text size="tiny" strong>
            <span style={{ textTransform: "uppercase", letterSpacing: "var(--pbui-track-label)" }}>
              {label}
            </span>
          </Text>
        </Presentation>

        <span style={{ flex: 1 }} />

        <select
          aria-label="application"
          value={node.app}
          onChange={(event) =>
            dispatch(layoutActions.setLeafApp({ nodeId: node.id, app: event.target.value }))
          }
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            border: "var(--pbui-border-hair)",
            background: "var(--pbui-pane)",
            fontSize: "var(--pbui-fs-tiny)",
          }}
        >
          {allApps().map((descriptor) => (
            <option key={descriptor.id} value={descriptor.id}>
              {descriptor.title}
            </option>
          ))}
        </select>

        <TileButton
          label="split right"
          onClick={() => dispatch(layoutActions.splitLeaf({ nodeId: node.id, dir: "row" }))}
        >
          ⬌
        </TileButton>
        <TileButton
          label="split below"
          onClick={() => dispatch(layoutActions.splitLeaf({ nodeId: node.id, dir: "col" }))}
        >
          ⬍
        </TileButton>
        <TileButton
          label="close tile"
          disabled={!canClose}
          onClick={() => dispatch(layoutActions.closeLeaf(node.id))}
        >
          ✕
        </TileButton>
      </div>

      <div className={styles.body}>
        {Component ? (
          <Component leafId={node.id} docId={node.docId} />
        ) : (
          <div style={{ padding: "var(--pbui-space-4)" }}>
            <Text size="small" tone="faint">
              no application called “{node.app}” — choose one above
            </Text>
          </div>
        )}
      </div>
    </section>
  );
}

function TileButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "var(--pbui-border-hair)",
        background: "var(--pbui-pane-alt)",
        padding: "0 var(--pbui-space-2)",
        fontSize: "var(--pbui-fs-tiny)",
        fontWeight: 700,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
