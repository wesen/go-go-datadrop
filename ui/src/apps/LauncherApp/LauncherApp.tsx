import { useDispatch } from "react-redux";
import { allApps, registerApp, type AppProps } from "../registry";
import { layoutActions } from "../../store/layout";
import { AppBody, Stack } from "../../components/layout";
import { Text } from "../../components/foundation";

/** What an empty tile shows: a button per application. */
function LauncherApp({ leafId }: AppProps) {
  const dispatch = useDispatch();
  return (
    <AppBody>
      <Stack gap={3}>
        <Text size="small" tone="faint" prose>
          Empty tile — choose an application. Chart, table, pipeline and encoding
          bind to a chart DOCUMENT and can be re-pointed; the rest are shared
          views over the world.
        </Text>
        <Stack direction="row" gap={2} wrap>
          {allApps()
            .filter((app) => app.id !== "launcher")
            .map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => dispatch(layoutActions.setLeafApp({ nodeId: leafId, app: app.id }))}
                style={{
                  border: "var(--pbui-border-firm)",
                  boxShadow: "var(--pbui-shadow-hard)",
                  background: app.tone,
                  padding: "var(--pbui-space-1) var(--pbui-space-4)",
                  fontSize: "var(--pbui-fs-small)",
                  fontWeight: 700,
                }}
              >
                {app.title}
              </button>
            ))}
        </Stack>
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "launcher",
  title: "new tile",
  tone: "var(--pbui-pane-alt)",
  docBound: false,
  Component: LauncherApp,
});
