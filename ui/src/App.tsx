import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDatasetTableQuery, useStreamTableQuery } from "./api/client";
import { DataTable } from "./components/DataTable";
import { EncodingEditor } from "./components/EncodingEditor";
import { LiveToggle } from "./components/LiveToggle";
import { PipelineEditor } from "./components/PipelineEditor";
import { PlotSvg } from "./components/PlotSvg";
import { SourcePicker } from "./components/SourcePicker";
import { TokenBar } from "./components/TokenBar";
import { TruncationBanner } from "./components/TruncationBanner";
import { downloadCSV } from "./export/csv";
import { downloadPNG } from "./export/png";
import type { ChartSpec } from "./model/chart";
import { defaultChart, describeSource, sameSource } from "./model/chart";
import type { Envelope } from "./model/live";
import { appendEnvelope } from "./model/live";
import { buildPlot } from "./model/plot";
import { evaluate } from "./model/pipeline";
import { hashForSpec, specFromHash, syncHash } from "./model/permalink";
import type { SourceRef, Table } from "./model/table";
import { asNumber } from "./model/table";

const DEFAULT_LIMIT = 2000;
const PLOT_WIDTH = 720;
const PLOT_HEIGHT = 380;

export default function App() {
  // A permalink opens the workbench on the chart it encodes. A malformed one
  // opens an empty workbench rather than a blank screen.
  const initialSpec = useMemo(() => specFromHash(window.location.hash), []);
  const [source, setSource] = useState<SourceRef | null>(initialSpec?.source ?? null);
  const [spec, setSpec] = useState<ChartSpec | null>(initialSpec);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [liveTable, setLiveTable] = useState<Table | null>(null);
  const [gaps, setGaps] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const streamQuery = useStreamTableQuery(
    {
      drop: source?.drop ?? "",
      stream: source?.stream ?? "events",
      limit,
      order: "desc",
    },
    { skip: source?.kind !== "stream" },
  );

  const datasetQuery = useDatasetTableQuery(
    {
      drop: source?.drop ?? "",
      dataset: source?.dataset ?? "",
      version: source?.version ?? "latest",
      path: source?.path ?? "",
      limit,
    },
    { skip: source?.kind !== "dataset" },
  );

  const query = source?.kind === "dataset" ? datasetQuery : streamQuery;
  const fetched = source ? query.data : undefined;

  // A live tail edits the table in place, so the tailed copy wins once it
  // exists — but only while it still describes the source being viewed.
  const table =
    liveTable && source && sameSource(liveTable.source, source) ? liveTable : fetched;

  // A new source needs a new default chart. Keep the existing spec when it
  // already refers to this source, which is what makes a permalink survive the
  // table arriving after the page does.
  useEffect(() => {
    if (!fetched) return;
    setLiveTable(null);
    setGaps(0);
    setSpec((current) =>
      current && sameSource(current.source, fetched.source) ? current : defaultChart(fetched),
    );
  }, [fetched]);

  useEffect(() => {
    if (spec) syncHash(spec);
  }, [spec]);

  const onEnvelope = useCallback(
    (envelope: Envelope) => {
      setLiveTable((current) => {
        const base = current ?? fetched;
        if (!base) return current;
        const { table: next, gap } = appendEnvelope(base, envelope, limit);
        if (gap) setGaps((n) => n + 1);
        return next;
      });
    },
    [fetched, limit],
  );

  const pipeline = useMemo(
    () => (table && spec ? evaluate(table, spec.steps, spec.typeOverrides) : null),
    [table, spec],
  );

  const plot = useMemo(
    () => (table && spec ? buildPlot(table, spec, PLOT_WIDTH, PLOT_HEIGHT) : null),
    [table, spec],
  );

  // A log y scale needs a strictly positive domain; the toggle is disabled
  // rather than silently ignored.
  const logUnavailable = useMemo(() => {
    if (!pipeline || !spec?.mapping.y) return true;
    const values = pipeline.rows
      .map((row) => asNumber(row[spec.mapping.y as string]))
      .filter(Number.isFinite);
    return values.length === 0 || Math.min(...values) <= 0;
  }, [pipeline, spec?.mapping.y]);

  const baseName = source
    ? source.kind === "stream"
      ? `${source.drop}-${source.stream}`
      : `${source.drop}-${source.dataset}-v${source.version}`
    : "chart";

  return (
    <div className="container-fluid py-3">
      <header className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h5 mb-0">datadrop — visualization workbench</h1>
          <div className="small text-body-secondary">
            {source ? describeSource(source) : "pick a source to begin"}
          </div>
        </div>
        <TokenBar />
      </header>

      <div className="row g-3">
        <div className="col-12 col-xl-3 vstack gap-3">
          <SourcePicker
            limit={limit}
            pending={query.isFetching}
            onLoad={(next, rows) => {
              setLimit(rows);
              setSource(next);
            }}
          />
          {table && spec && (
            <EncodingEditor
              fields={pipeline?.fields ?? table.fields}
              spec={spec}
              logUnavailable={logUnavailable}
              onChange={setSpec}
            />
          )}
        </div>

        <div className="col-12 col-xl-6">
          {query.error != null && (
            <div className="alert alert-danger py-2">
              The server refused this request. If the drop is not public-read, enter a
              token above.
            </div>
          )}

          {!table && !query.isFetching && (
            <div className="alert alert-secondary py-2 mb-0">
              Choose a drop and a stream or dataset file, then press <em>Load table</em>.
            </div>
          )}

          {table && <TruncationBanner table={table} />}

          {gaps > 0 && (
            <div className="alert alert-warning py-2">
              {gaps} gap{gaps === 1 ? "" : "s"} in the live sequence. The event hub drops
              a subscriber that falls behind rather than queueing without bound, so some
              events were never delivered here. Reload the table for a complete window.
            </div>
          )}

          {table && plot && (
            <div className="card">
              <div className="card-header py-2 d-flex align-items-center justify-content-between">
                <span className="fw-semibold small">
                  Chart · {plot.rowsOut.toLocaleString()} rows
                </span>
                <div className="d-flex align-items-center gap-3">
                  <LiveToggle table={table} onEnvelope={onEnvelope} />
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="fonts may render slightly differently from the screen"
                      disabled={!svgRef.current}
                      onClick={() => {
                        if (svgRef.current) void downloadPNG(svgRef.current, `${baseName}.png`);
                      }}
                    >
                      PNG
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="the rows behind this chart, after the pipeline"
                      onClick={() => {
                        if (pipeline) downloadCSV(pipeline.fields, pipeline.rows, `${baseName}.csv`);
                      }}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      title="copy a link that reopens this exact chart"
                      onClick={() => {
                        if (!spec) return;
                        const url = window.location.origin + window.location.pathname + hashForSpec(spec);
                        void navigator.clipboard?.writeText(url);
                      }}
                    >
                      link
                    </button>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <PlotSvg ref={svgRef} plot={plot} />
              </div>
            </div>
          )}

          {table && pipeline && (
            <div className="card mt-3">
              <div className="card-header py-2 fw-semibold small">Rows</div>
              <div className="card-body p-0">
                <DataTable fields={pipeline.fields} rows={pipeline.rows} />
              </div>
            </div>
          )}
        </div>

        <div className="col-12 col-xl-3">
          {table && spec && (
            <PipelineEditor
              table={table}
              steps={spec.steps}
              dropped={pipeline?.dropped ?? {}}
              onChange={(steps) => setSpec({ ...spec, steps })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
