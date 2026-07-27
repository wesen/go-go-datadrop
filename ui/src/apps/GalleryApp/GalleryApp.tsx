import { useDispatch, useSelector } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { GalleryPanel } from "../../components/organisms";

/**
 * Snapshots — the container half.
 *
 * Three selectors and five dispatches. The panel takes plain snapshot views, so
 * a story of "a snapshot whose source has since gone" is one line of args
 * rather than a source that has to be deleted from a running server.
 */
function GalleryApp(_props: AppProps) {
  const dispatch = useDispatch();
  const snapshots = useSelector((s: RootState) =>
    s.world.snapshotOrder.map((id) => s.world.snapshots[id]!),
  );
  const pins = useSelector((s: RootState) => s.world.pins);
  const activeDocName = useSelector((s: RootState) =>
    s.world.activeDocId ? (s.world.docs[s.world.activeDocId]?.name ?? "—") : "—",
  );

  return (
    <GalleryPanel
      snapshots={snapshots}
      pins={pins}
      activeDocName={activeDocName}
      // docId null means "the active document", resolved by the reducer at
      // application time rather than here — the active document can change
      // between the render and the click.
      onRestore={(snapshotId) =>
        dispatch(worldActions.restoreSnapshot({ snapshotId, docId: null }))
      }
      onPin={(slot, snapshotId) => dispatch(worldActions.pinSnapshot({ slot, snapshotId }))}
      onDelete={(snapshotId) => dispatch(worldActions.deleteSnapshot(snapshotId))}
    />
  );
}

registerApp({
  id: "gallery",
  title: "snapshots",
  tone: "var(--pbui-tone-geom)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: GalleryApp,
});
