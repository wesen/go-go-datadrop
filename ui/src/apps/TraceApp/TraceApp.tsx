import { useSelector } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import type { RootState } from "../../store";
import { TracePanel } from "../../components/organisms";

/**
 * Every verb, in order — the container half.
 *
 * One selector. The cap and the drop-from-the-front live in the world slice,
 * not here and not in the panel: two places that both capped would disagree the
 * first time either changed.
 */
function TraceApp(_props: AppProps) {
  const trace = useSelector((s: RootState) => s.world.trace);
  return <TracePanel entries={trace} />;
}

registerApp({
  id: "trace",
  title: "trace",
  tone: "var(--pbui-tone-source)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: TraceApp,
});
