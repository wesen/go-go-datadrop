import { useDispatch, useSelector } from "react-redux";
import { usePbui } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { ComparePanel } from "../../components/organisms";

/**
 * Two pinned snapshots — the container half.
 *
 * The accept lives here because it is a protocol rather than a rendering: the
 * user is asked to click a `<chart>` presentation, which may be in the gallery
 * tile, in the watchlist, or in another workspace entirely.
 */
function CompareApp(_props: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const pins = useSelector((s: RootState) => s.world.pins);
  const snapshots = useSelector((s: RootState) => s.world.snapshots);

  const pick = async (slot: 0 | 1) => {
    const result = await pbui.accept({
      ptype: "chart",
      prompt: `COMPARE ${slot === 0 ? "A" : "B"} — click a snapshot in the gallery`,
    });
    if (result) {
      dispatch(worldActions.pinSnapshot({ slot, snapshotId: result.value as string }));
    }
  };

  return (
    <ComparePanel
      a={pins[0] ? (snapshots[pins[0]] ?? null) : null}
      b={pins[1] ? (snapshots[pins[1]] ?? null) : null}
      onPick={(slot) => void pick(slot)}
    />
  );
}

registerApp({
  id: "compare",
  title: "compare a/b",
  tone: "var(--pbui-tone-cat)",
  docBound: false,
  Component: CompareApp,
});
