import { useSelector } from "react-redux";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { AppBody } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";

/**
 * Whatever was last inspected, as formatted JSON.
 *
 * Everything the descriptors say about honesty surfaces here: no statistic
 * without the window it was computed over, and provenance reported beside every
 * type. A mean over a 2 000-row sample of forty thousand is a different fact
 * from a mean over the lot, and the difference belongs on screen.
 */
function InspectorApp(_props: AppProps) {
  const inspected = useSelector((s: RootState) => s.world.inspected);

  return (
    <AppBody>
      {!inspected ? (
        <Text size="small" tone="faint" prose>
          Nothing inspected yet. Right-click any presentation and choose
          <strong> Inspect</strong>.
        </Text>
      ) : (
        <>
          <SectionLabel>{inspected.title}</SectionLabel>
          <pre
            style={{
              margin: "var(--pbui-space-3) 0 0",
              fontSize: "var(--pbui-fs-small)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(inspected.value, null, 2)}
          </pre>
        </>
      )}
    </AppBody>
  );
}

registerApp({
  id: "inspector",
  title: "inspector",
  tone: "var(--pbui-tone-step)",
  docBound: false,
  Component: InspectorApp,
});
