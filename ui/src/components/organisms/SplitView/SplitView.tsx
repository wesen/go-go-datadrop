import { memo, useCallback, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { layoutActions, snapRatio, type Node } from "../../../store/layout";
import { Tile } from "../Tile";
import styles from "./SplitView.module.css";

/**
 * A node of the split tree: either a tile, or two panes and a divider.
 *
 * `memo` matters here more than anywhere else in the application. `updateNode`
 * returns the identical object for untouched subtrees, so a change to one tile
 * lets React skip every other branch — with fifteen tiles each running
 * `evaluate` over a 50 000-row table, that is the difference between a
 * responsive divider drag and a slideshow.
 */
export const NodeView = memo(function NodeView({ node }: { node: Node }) {
  return node.type === "leaf" ? <Tile node={node} /> : <SplitView node={node} />;
});

const SplitView = memo(function SplitView({ node }: { node: Extract<Node, { type: "split" }> }) {
  const dispatch = useDispatch();
  const container = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"idle" | "dragging" | "snapped">("idle");
  const row = node.dir === "row";

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      // Without this the browser selects text across the whole window for the
      // duration of the drag, which looks like a rendering bug.
      const previous = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const move = (moveEvent: PointerEvent) => {
        const element = container.current;
        if (!element) return;
        const box = element.getBoundingClientRect();
        const raw = row
          ? (moveEvent.clientX - box.left) / box.width
          : (moveEvent.clientY - box.top) / box.height;
        const clamped = Math.max(0.1, Math.min(0.9, raw));
        const { ratio, snapped } = snapRatio(clamped);
        setDrag(snapped ? "snapped" : "dragging");
        dispatch(layoutActions.setRatio({ nodeId: node.id, ratio }));
      };

      const up = () => {
        document.body.style.userSelect = previous;
        setDrag("idle");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [dispatch, node.id, row],
  );

  // The divider is keyboard-operable. The prototype's is not, and a layout you
  // cannot adjust without a mouse is a layout half the users are stuck with.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.01 : 0.05;
    const decrease = row ? "ArrowLeft" : "ArrowUp";
    const increase = row ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrease && event.key !== increase) return;
    event.preventDefault();
    const next = Math.max(0.1, Math.min(0.9, node.ratio + (event.key === increase ? step : -step)));
    dispatch(layoutActions.setRatio({ nodeId: node.id, ratio: next }));
  };

  return (
    <div ref={container} className={[styles.split, row ? styles.row : styles.col].join(" ")}>
      <div className={styles.pane} style={{ flex: `${node.ratio} 1 0px` }}>
        <NodeView node={node.a} />
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: there is no semantic element for a splitter. role="separator" with aria-orientation and aria-valuenow is the ARIA pattern, and it has to sit on a <button> because a resize handle must be focusable and activatable from the keyboard — which is exactly what this component added over the prototype. */}
      <button
        type="button"
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        aria-label={`resize ${row ? "horizontally" : "vertically"}`}
        aria-valuenow={Math.round(node.ratio * 100)}
        className={[
          styles.divider,
          row ? styles.dividerRow : styles.dividerCol,
          drag === "dragging" ? styles.dragging : "",
          drag === "snapped" ? styles.snapped : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <span className={row ? styles.grip : styles.gripCol} />
      </button>

      <div className={styles.pane} style={{ flex: `${1 - node.ratio} 1 0px` }}>
        <NodeView node={node.b} />
      </div>
    </div>
  );
});
