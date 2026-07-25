import { useDispatch, useSelector } from "react-redux";
import { DocChip } from "../../atoms";
import { SectionLabel } from "../../foundation";
import { Toolbar } from "../../layout";
import type { RootState } from "../../../store";
import { layoutActions } from "../../../store/layout";
import { worldActions } from "../../../store/world";
import type { DocId } from "../../../pbui";
import type { NodeId } from "../../../store/layout";

/**
 * The strip atop every document-bound tile: which document am I a view of?
 *
 * Ported from pbui-gog.jsx:1302-1317. The dropdown re-points the tile and ＋
 * spawns a new document into it. Two tiles pointed at one document stay in
 * lockstep because they are views of one object rather than copies — which is
 * the property the whole window manager rests on.
 */
export function DocBar({ leafId, docId }: { leafId: NodeId; docId: DocId | null }) {
  const dispatch = useDispatch();
  const docs = useSelector((state: RootState) => state.world.docOrder.map((id) => state.world.docs[id]!));
  const activeDocId = useSelector((state: RootState) => state.world.activeDocId);
  const shown = docId ?? activeDocId;

  return (
    <Toolbar tight bordered>
      <SectionLabel>Doc</SectionLabel>
      {shown && <DocChip docId={shown} />}

      <select
        aria-label="which document this tile shows"
        value={shown ?? ""}
        onChange={(event) =>
          dispatch(layoutActions.setLeafDoc({ nodeId: leafId, docId: event.target.value || null }))
        }
        style={{
          border: "var(--pbui-border-hair)",
          background: "var(--pbui-pane)",
          fontSize: "var(--pbui-fs-tiny)",
        }}
      >
        {docs.length === 0 && <option value="">(no documents)</option>}
        {docs.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.name} · {doc.spec.source.drop || "—"}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label="new document in this tile"
        title="new chart document — this tile re-points to it"
        onClick={() => {
          const action = worldActions.newDoc(null);
          dispatch(action);
          dispatch(layoutActions.setLeafDoc({ nodeId: leafId, docId: action.payload.id }));
        }}
        style={{
          border: "var(--pbui-border-hair)",
          background: "var(--pbui-pane-alt)",
          padding: "0 var(--pbui-space-2)",
          fontSize: "var(--pbui-fs-tiny)",
          fontWeight: 700,
        }}
      >
        ＋
      </button>
    </Toolbar>
  );
}
