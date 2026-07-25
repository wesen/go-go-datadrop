import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  useGetDatasetQuery,
  useGetDatasetVersionQuery,
  useListDatasetsQuery,
  useListDropsQuery,
  useListStreamsQuery,
  readToken,
  writeToken,
} from "../../api/client";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Toolbar } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { Button, SelectInput, SourceChip, TextInput } from "../../components/atoms";

/**
 * The source browser: drops, then their streams and dataset files.
 *
 * Every stream and every file is a `<source>` presentation, so loading one is a
 * left-click and raising the row budget is a menu verb on the same object.
 */
function SourceApp(_props: AppProps) {
  const dispatch = useDispatch();
  const [drop, setDrop] = useState("");
  // Was an uncontrolled `defaultValue={readToken()}` that wrote through on
  // every keystroke. The write-through is kept; the state makes it controlled,
  // which is what TextInput requires and what stops the value and the store
  // silently diverging after a programmatic change.
  const [token, setToken] = useState(() => readToken());
  const [dataset, setDataset] = useState("");
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);
  const limit = useSelector((s: RootState) =>
    s.world.activeDocId ? (s.world.docs[s.world.activeDocId]?.limit ?? 2000) : 2000,
  );

  const drops = useListDropsQuery();
  const chosen = drop || drops.data?.drops?.[0]?.name || "";
  const streams = useListStreamsQuery(chosen, { skip: !chosen });
  const datasets = useListDatasetsQuery(chosen, { skip: !chosen });
  const chosenDataset = dataset || datasets.data?.datasets?.[0]?.name || "";
  const detail = useGetDatasetQuery({ drop: chosen, dataset: chosenDataset }, { skip: !chosenDataset });
  const committed = (detail.data?.versions ?? []).filter((v) => v.state === "committed");
  const version = committed[committed.length - 1];

  // The dataset-detail response lists versions WITHOUT their files: naming
  // every file of every version is expensive and most callers do not want it.
  // The symptom of forgetting this is an empty file list and no error at all.
  const versionDetail = useGetDatasetVersionQuery(
    { drop: chosen, dataset: chosenDataset, version: version?.version ?? 0 },
    { skip: !version },
  );

  return (
    <>
      <Toolbar tight bordered>
        <SectionLabel>Token</SectionLabel>
        <TextInput
          type="password"
          label="bearer token"
          placeholder="bearer token (public-read drops need none)"
          value={token}
          width="fill"
          size="tiny"
          onValueChange={(next) => {
            setToken(next);
            writeToken(next);
          }}
        />
      </Toolbar>

      <AppBody>
        <Stack gap={4}>
          {drops.error != null && (
            <Text size="small" tone="danger">
              Could not list drops. If this server requires a token, enter one above.
            </Text>
          )}

          <Stack gap={2}>
            <SectionLabel>Drop</SectionLabel>
            <SelectInput
              label="drop"
              variant="framed"
              value={chosen}
              onValueChange={(next) => {
                setDrop(next);
                setDataset("");
              }}
              options={(drops.data?.drops ?? []).map((d) => ({
                value: d.name,
                label: d.public_read ? `${d.name} (public)` : d.name,
              }))}
            />
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Row budget — how much of the source is loaded</SectionLabel>
            <Stack direction="row" gap={2} wrap align="center">
              {[500, 2000, 10000, 50000].map((option) => (
                <Button
                  key={option}
                  variant="framed"
                  selected={limit === option}
                  onClick={() =>
                    dispatch(worldActions.setDocLimit({ docId: activeDocId, limit: option }))
                  }
                >
                  {option.toLocaleString()}
                </Button>
              ))}
              <Text size="tiny" tone="faint">
                the pipeline's `limit` step is a different thing
              </Text>
            </Stack>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Streams</SectionLabel>
            <Stack direction="row" gap={2} wrap>
              {(streams.data?.streams ?? []).map((s) => (
                <SourceChip
                  key={s.stream}
                  source={{ kind: "stream", drop: chosen, stream: s.stream }}
                />
              ))}
              {streams.data?.streams?.length === 0 && (
                <Text size="small" tone="faint">
                  no streams in this drop
                </Text>
              )}
            </Stack>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Datasets</SectionLabel>
            <SelectInput
              label="dataset"
              variant="framed"
              value={chosenDataset}
              onValueChange={setDataset}
              options={(datasets.data?.datasets ?? []).map((d) => ({
                value: d.name,
                label: d.name,
              }))}
            />
            <Stack direction="row" gap={2} wrap>
              {(versionDetail.data?.files ?? []).map((file) => (
                <SourceChip
                  key={file.path}
                  source={{
                    kind: "dataset",
                    drop: chosen,
                    dataset: chosenDataset,
                    version: version?.version ?? 1,
                    path: file.path,
                  }}
                />
              ))}
              {version && (versionDetail.data?.files ?? []).length === 0 && (
                <Text size="small" tone="faint">
                  no files in version {version.version}
                </Text>
              )}
            </Stack>
          </Stack>
        </Stack>
      </AppBody>
    </>
  );
}

registerApp({
  id: "sources",
  title: "sources",
  tone: "var(--pbui-tone-source)",
  docBound: false,
  Component: SourceApp,
});
