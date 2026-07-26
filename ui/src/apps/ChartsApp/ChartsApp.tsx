import { useDispatch, useSelector } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { ChartsPanel } from "../../components/organisms";

/**
 * The document manager — the container half.
 *
 * Two of the dispatches take a value the reducer must not compute itself: a
 * fresh uuid for a duplicate and an ISO instant for a snapshot. A reducer that
 * called crypto.randomUUID() or Date.now() would not be a pure function of its
 * inputs, and a state tree that changes when you replay it is not replayable.
 */
function ChartsApp(_props: AppProps) {
  const dispatch = useDispatch();
  const docs = useSelector((s: RootState) => s.world.docOrder.map((id) => s.world.docs[id]!));
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);

  return (
    <ChartsPanel
      docs={docs}
      activeDocId={activeDocId}
      onNew={() => dispatch(worldActions.newDoc(null))}
      onRename={(docId, name) => dispatch(worldActions.renameDoc({ docId, name }))}
      onActivate={(docId) => dispatch(worldActions.setActiveDoc(docId))}
      onDuplicate={(docId) =>
        dispatch(worldActions.duplicateDoc({ docId, id: crypto.randomUUID() }))
      }
      onSnapshot={(docId) => dispatch(worldActions.snapshot(docId, new Date().toISOString()))}
      onDelete={(docId) => dispatch(worldActions.deleteDoc(docId))}
    />
  );
}

registerApp({
  id: "charts",
  title: "charts",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: ChartsApp,
});
