import { registerApp, type AppProps } from "../registry";
import { AppBody, Stack } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";

/**
 * Publishing a dataset from the browser.
 *
 * A placeholder in phase 5 so that the account workspace is complete; the batch
 * state machine, browser hashing and the mount fast path land in phase 6
 * (guide §15).
 */
function UploadApp(_props: AppProps) {
  return (
    <AppBody>
      <Stack gap={2}>
        <SectionLabel>Upload</SectionLabel>
        <Text size="small" tone="faint" prose>
          Drag files here to publish a dataset version. Not wired up yet.
        </Text>
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "upload",
  title: "upload",
  tone: "var(--pbui-tone-datum)",
  docBound: false,
  Component: UploadApp,
});
