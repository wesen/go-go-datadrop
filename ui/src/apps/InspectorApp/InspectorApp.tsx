import { useSelector } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { InspectorPanel } from "../../components/organisms";

/**
 * Whatever was last inspected — the container half.
 *
 * One selector, and nothing else. `world.inspected` is written by the `inspect`
 * verb, which every descriptor offers, so this tile shows objects of sixteen
 * presentation types without knowing about any of them.
 */
function InspectorApp(_props: AppProps) {
  const inspected = useSelector((s: RootState) => s.world.inspected);
  return <InspectorPanel inspected={inspected} />;
}

registerApp({
  id: "inspector",
  title: "inspector",
  tone: "var(--pbui-tone-step)",
  docBound: false,
  Component: InspectorApp,
});
