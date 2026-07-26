import { useDispatch } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useScopedApps } from "../../appkit/AppScope";
import { layoutActions } from "../../store/layout";
import { AppBody, Stack } from "../../components/layout";
import { Text } from "../../components/foundation";
import { Button } from "../../components/atoms";

/** What an empty tile shows: a button per application. */
function LauncherApp({ leafId }: AppProps) {
  const dispatch = useDispatch();
  const apps = useScopedApps();
  return (
    <AppBody>
      <Stack gap={3}>
        <Text size="small" tone="faint" prose>
          Empty tile — choose an application. Chart, table, pipeline and encoding bind to a chart
          DOCUMENT and can be re-pointed; the rest are shared views over the world.
        </Text>
        <Stack direction="row" gap={2} wrap>
          {apps
            .filter((app) => app.id !== "launcher")
            .map((app) => (
              <Button
                key={app.id}
                variant="raised"
                fill={app.tone}
                onClick={() => dispatch(layoutActions.setLeafApp({ nodeId: leafId, app: app.id }))}
              >
                {app.title}
              </Button>
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
