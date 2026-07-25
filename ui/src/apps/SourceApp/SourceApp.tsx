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
import { SourceChip } from "../../components/atoms";

/**
 * The source browser: drops, then their streams and dataset files.
 *
 * Every stream and every file is a `<source>` presentation, so loading one is a
 * left-click and raising the row budget is a menu verb on the same object.
 */
function SourceApp(_props: AppProps) {
  const dispatch = useDispatch();
  const [drop, setDrop] = useState("");
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
        <input
          type="password"
          defaultValue={readToken()}
          placeholder="bearer token (public-read drops need none)"
          aria-label="bearer token"
          onChange={(event) => writeToken(event.target.value)}
          style={{
            border: "var(--pbui-border-hair)",
            background: "var(--pbui-pane)",
            fontSize: "var(--pbui-fs-tiny)",
            flex: 1,
            minWidth: 120,
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
            <select
              value={chosen}
              aria-label="drop"
              onChange={(event) => {
                setDrop(event.target.value);
                setDataset("");
              }}
              style={input}
            >
              {(drops.data?.drops ?? []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                  {d.public_read ? " (public)" : ""}
                </option>
              ))}
            </select>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Row budget — how much of the source is loaded</SectionLabel>
            <Stack direction="row" gap={2} wrap align="center">
              {[500, 2000, 10000, 50000].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    dispatch(worldActions.setDocLimit({ docId: activeDocId, limit: option }))
                  }
                  style={{
                    ...btn,
                    background: limit === option ? "var(--pbui-selected)" : "var(--pbui-pane-alt)",
                  }}
                >
                  {option.toLocaleString()}
                </button>
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
            <select
              value={chosenDataset}
              aria-label="dataset"
              onChange={(event) => setDataset(event.target.value)}
              style={input}
            >
              {(datasets.data?.datasets ?? []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
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

const btn: React.CSSProperties = {
  border: "var(--pbui-border-hair)",
  background: "var(--pbui-pane-alt)",
  padding: "0 var(--pbui-space-3)",
  fontSize: "var(--pbui-fs-small)",
  fontWeight: 700,
};

const input: React.CSSProperties = {
  border: "var(--pbui-border-hair)",
  background: "var(--pbui-pane)",
  fontSize: "var(--pbui-fs-small)",
  padding: "0 var(--pbui-space-2)",
};

registerApp({
  id: "sources",
  title: "sources",
  tone: "var(--pbui-tone-source)",
  docBound: false,
  Component: SourceApp,
});
