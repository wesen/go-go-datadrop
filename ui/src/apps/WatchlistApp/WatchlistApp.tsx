import { useDispatch, useSelector } from "react-redux";
import { usePbui } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { WatchlistPanel } from "../../components/organisms";

/**
 * The watchlist — the container half.
 *
 * One selector and one accept. The accept is a UNION over seven presentation
 * types, which the API takes an array for precisely because of this call site:
 * "watch anything" is not expressible as a filter over one type.
 */
function WatchlistApp(_props: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const watch = useSelector((s: RootState) => s.world.watch);

  const add = async () => {
    const result = await pbui.accept({
      ptype: ["field", "source", "doc", "step", "datum", "cat", "chart"],
      prompt: "WATCH — click any presentation, in any tile or workspace",
    });
    if (result) dispatch(worldActions.watchAdd(result.ptype, result.value));
  };

  return (
    <WatchlistPanel
      entries={watch}
      onWatch={() => void add()}
      onRemove={(id) => dispatch(worldActions.watchRemove(id))}
    />
  );
}

registerApp({
  id: "watch",
  title: "watchlist",
  tone: "var(--pbui-tone-chart)",
  docBound: false,
  Component: WatchlistApp,
});
