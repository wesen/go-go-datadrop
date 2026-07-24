import { useEffect, useState } from "react";
import {
  useGetDatasetQuery,
  useGetDatasetVersionQuery,
  useListDatasetsQuery,
  useListDropsQuery,
  useListStreamsQuery,
} from "../api/client";
import type { SourceRef } from "../model/table";

interface Props {
  onLoad: (source: SourceRef, limit: number) => void;
  pending: boolean;
  limit: number;
}

/**
 * Row-budget choices, up to the server's MaxTableRows.
 *
 * A control rather than a constant because the truncation banner tells the user
 * to raise the limit, and advice you cannot act on is worse than no advice.
 */
const LIMITS = [500, 2000, 10000, 50000];

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ago(iso?: string): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/**
 * Three cascading selects and a load button.
 *
 * Loading is explicit rather than an effect on every change: each load is a
 * request that can be expensive, and a picker that fires on every keystroke is
 * a way to denial-of-service your own server from the front end.
 */
export function SourcePicker({ onLoad, pending, limit: initialLimit }: Props) {
  const [limit, setLimit] = useState(initialLimit);
  const [drop, setDrop] = useState("");
  const [kind, setKind] = useState<"stream" | "dataset">("stream");
  const [stream, setStream] = useState("");
  const [dataset, setDataset] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [path, setPath] = useState("");

  const drops = useListDropsQuery();
  const streams = useListStreamsQuery(drop, { skip: !drop });
  const datasets = useListDatasetsQuery(drop, { skip: !drop || kind !== "dataset" });
  const datasetDetail = useGetDatasetQuery(
    { drop, dataset },
    { skip: !drop || !dataset || kind !== "dataset" },
  );

  // Default to the first option at every level, so the picker is usable
  // without five deliberate selections.
  useEffect(() => {
    if (!drop && drops.data?.drops?.length) setDrop(drops.data.drops[0]!.name);
  }, [drop, drops.data]);

  useEffect(() => {
    const first = streams.data?.streams?.[0]?.stream;
    if (kind === "stream" && first && !streams.data?.streams?.some((s) => s.stream === stream)) {
      setStream(first);
    }
  }, [kind, stream, streams.data]);

  useEffect(() => {
    const first = datasets.data?.datasets?.[0]?.name;
    if (kind === "dataset" && first && !datasets.data?.datasets?.some((d) => d.name === dataset)) {
      setDataset(first);
    }
  }, [kind, dataset, datasets.data]);

  const versions = (datasetDetail.data?.versions ?? []).filter((v) => v.state === "committed");
  const selectedVersion = versions.find((v) => v.version === version) ?? versions[0];

  useEffect(() => {
    if (selectedVersion && selectedVersion.version !== version) {
      setVersion(selectedVersion.version);
    }
  }, [selectedVersion, version]);

  // The dataset-detail endpoint lists versions without their file lists: naming
  // every file of every version is expensive and most callers do not want it.
  // The file picker therefore asks for the one version it is about to read.
  const versionDetail = useGetDatasetVersionQuery(
    { drop, dataset, version: selectedVersion?.version ?? 0 },
    { skip: !drop || !dataset || kind !== "dataset" || !selectedVersion },
  );

  const files = versionDetail.data?.files ?? [];
  useEffect(() => {
    if (files.length > 0 && !files.some((f) => f.path === path)) {
      setPath(files[0]!.path);
    }
  }, [files, path]);

  const ready =
    kind === "stream" ? Boolean(drop && stream) : Boolean(drop && dataset && selectedVersion && path);

  const load = () => {
    if (!ready) return;
    if (kind === "stream") {
      onLoad({ kind: "stream", drop, stream }, limit);
    } else {
      onLoad(
        {
          kind: "dataset",
          drop,
          dataset,
          version: selectedVersion!.version,
          path,
        },
        limit,
      );
    }
  };

  return (
    <div className="card">
      <div className="card-header py-2 fw-semibold small">Source</div>
      <div className="card-body vstack gap-2 py-2">
        {drops.error != null && (
          <div className="alert alert-warning py-2 mb-0 small">
            Could not list drops. If this server requires a token, enter one above.
          </div>
        )}

        <div>
          <label className="form-label small mb-1">drop</label>
          <select
            className="form-select form-select-sm"
            value={drop}
            onChange={(event) => setDrop(event.target.value)}
          >
            {(drops.data?.drops ?? []).map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
                {d.public_read ? " (public)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="btn-group btn-group-sm w-100" role="group">
          {(["stream", "dataset"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`btn btn-outline-secondary ${kind === option ? "active" : ""}`}
              onClick={() => setKind(option)}
            >
              {option}
            </button>
          ))}
        </div>

        {kind === "stream" ? (
          <div>
            <label className="form-label small mb-1">stream</label>
            <select
              className="form-select form-select-sm"
              value={stream}
              onChange={(event) => setStream(event.target.value)}
            >
              {(streams.data?.streams ?? []).map((s) => (
                <option key={s.stream} value={s.stream}>
                  {s.stream} — {s.event_count} events, last {ago(s.last_received_at)}
                </option>
              ))}
            </select>
            {streams.data?.streams?.length === 0 && (
              <div className="form-text">This drop has no streams yet.</div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="form-label small mb-1">dataset</label>
              <select
                className="form-select form-select-sm"
                value={dataset}
                onChange={(event) => setDataset(event.target.value)}
              >
                {(datasets.data?.datasets ?? []).map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label small mb-1">version</label>
              <select
                className="form-select form-select-sm"
                value={selectedVersion?.version ?? ""}
                onChange={(event) => setVersion(Number(event.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} — {v.file_count} files, {bytes(v.total_bytes)}
                  </option>
                ))}
              </select>
              {versions.length === 0 && datasetDetail.data && (
                <div className="form-text">
                  This dataset has no committed versions. Drafts are never readable.
                </div>
              )}
            </div>

            <div>
              <label className="form-label small mb-1">file</label>
              <select
                className="form-select form-select-sm"
                value={path}
                onChange={(event) => setPath(event.target.value)}
              >
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path} — {bytes(f.size_bytes)}
                    {f.media_type ? ` (${f.media_type})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="form-label small mb-1">rows</label>
          <select
            className="form-select form-select-sm"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                up to {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={!ready || pending}
          onClick={load}
        >
          {pending ? "loading…" : "Load table"}
        </button>
      </div>
    </div>
  );
}
