import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { layoutActions, type NodeId } from "../../../store/layout";

/**
 * Drag a tile onto another to swap or dock.
 *
 * The registry of tile elements is module-level rather than React state: the
 * hit test runs on every pointer move and needs a synchronous read, and a
 * dragged tile must be able to see tiles it is not a descendant of.
 *
 * `isConnected` is checked at hit-test time because a closed tile leaves its
 * entry behind, and a phantom drop target is a memorably confusing bug —
 * pbui-gog.jsx:2530-2531 does the same for the same reason.
 */
const TILES = new Map<NodeId, HTMLElement>();

export type Zone = "left" | "right" | "top" | "bottom" | "center";

interface DragState {
  from: NodeId;
  over: NodeId | null;
  zone: Zone | null;
}

let listeners: Array<(state: DragState | null) => void> = [];
let dragState: DragState | null = null;

function setDrag(next: DragState | null) {
  dragState = next;
  for (const listener of listeners) listener(next);
}

/**
 * Which part of a tile the pointer is over.
 *
 * The band is 30 % of the smaller dimension, capped at 110px, so a large tile
 * still has a generous centre and a small one still has reachable edges.
 * Ported from pbui-gog.jsx:2523-2528.
 */
export function zoneFor(box: DOMRect, x: number, y: number): Zone {
  const left = x - box.left;
  const right = box.right - x;
  const top = y - box.top;
  const bottom = box.bottom - y;
  const band = Math.min(Math.min(box.width, box.height) * 0.3, 110);
  const nearest = Math.min(left, right, top, bottom);
  if (nearest > band) return "center";
  if (nearest === left) return "left";
  if (nearest === right) return "right";
  if (nearest === top) return "top";
  return "bottom";
}

function hitTest(x: number, y: number): { id: NodeId; zone: Zone } | null {
  for (const [id, element] of TILES) {
    if (!element.isConnected) {
      TILES.delete(id);
      continue;
    }
    const box = element.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return { id, zone: zoneFor(box, x, y) };
    }
  }
  return null;
}

export function useDrag(nodeId: NodeId) {
  const dispatch = useDispatch();
  const [state, setState] = useState<DragState | null>(dragState);

  useEffect(() => {
    const listener = (next: DragState | null) => setState(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (element) TILES.set(nodeId, element);
      else TILES.delete(nodeId);
    },
    [nodeId],
  );

  const onGripPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const previous = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      setDrag({ from: nodeId, over: null, zone: null });

      const move = (moveEvent: PointerEvent) => {
        const hit = hitTest(moveEvent.clientX, moveEvent.clientY);
        setDrag({
          from: nodeId,
          over: hit && hit.id !== nodeId ? hit.id : null,
          zone: hit && hit.id !== nodeId ? hit.zone : null,
        });
      };

      const up = () => {
        document.body.style.userSelect = previous;
        const current = dragState;
        setDrag(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);

        if (!current?.over || !current.zone) return;
        if (current.zone === "center") {
          dispatch(layoutActions.swapTiles({ a: current.from, b: current.over }));
        } else {
          dispatch(
            layoutActions.dockTile({ from: current.from, to: current.over, zone: current.zone }),
          );
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [dispatch, nodeId],
  );

  return {
    dragging: state?.from === nodeId,
    zone: state?.over === nodeId ? state.zone : null,
    onGripPointerDown,
    register,
  };
}
