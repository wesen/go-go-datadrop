import { useEffect, useRef, useState } from "react";
import { Presentation } from "../../pbui";
import type { Mark, Plot } from "../../model/plot";
import { registerApp, type AppProps } from "../registry";
import { useDocPlot } from "../useTable";
import { AppBody } from "../../components/layout";
import { Text } from "../../components/foundation";
import { DocBar } from "../../components/molecules";
import { TruncationNotice } from "../../components/molecules";

/**
 * The composed plot, fully live.
 *
 * Marks are `<datum>` presentations and legend swatches are `<cat>`
 * presentations, so right-clicking a dot injects a real filter step into the
 * pipeline — visible in the pipeline tile, toggleable, and part of the
 * specification rather than a view-level filter. That is the thesis of the whole
 * ticket: a chart built from typed objects can be edited by pointing at itself.
 *
 * There is NO scale arithmetic in this file. Every coordinate comes from
 * buildPlot, so a mark in the wrong place is a bug in model/plot.ts that a unit
 * test can find without a browser.
 */
function ChartApp({ leafId, docId }: AppProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 360 });

  // Debounced, because a divider drag would otherwise re-run buildPlot twenty
  // times a second over the whole table.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          setSize({
            width: Math.max(280, Math.floor(box.width)),
            height: Math.max(200, Math.floor(box.height)),
          }),
        80,
      );
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const { doc, table, plot, loading } = useDocPlot(docId, size.width, size.height);

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <AppBody>
        {table && <TruncationNotice table={table} />}
        <div ref={container} style={{ flex: 1, minHeight: 220, marginTop: "var(--pbui-space-3)" }}>
          {!plot ? (
            <Text size="small" tone="faint">
              {loading ? "loading…" : "no source — load one from the sources tile"}
            </Text>
          ) : plot.problems.length > 0 ? (
            <div role="status">
              <Text size="small" strong>
                Nothing to draw yet
              </Text>
              {plot.problems.map((problem) => (
                <div key={problem}>
                  <Text size="small" tone="faint">
                    · {problem}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <PlotSvg plot={plot} docId={doc?.id ?? null} colorField={doc?.spec.mapping.color ?? null} />
          )}
        </div>
      </AppBody>
    </>
  );
}

const AXIS = "var(--pbui-faint)";
const GRID = "var(--pbui-line)";

function PlotSvg({
  plot,
  docId,
  colorField,
}: {
  plot: Plot;
  docId: string | null;
  colorField: string | null;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--pbui-space-3)", alignItems: "flex-start" }}>
      <svg
        width={plot.width - plot.legendW}
        height={plot.height}
        role="img"
        // A text alternative built from the specification, not the word "chart".
        aria-label={`chart of ${plot.rowsOut} rows in ${plot.panels.length} panel${
          plot.panels.length === 1 ? "" : "s"
        }`}
        // So the PNG exporter can find the right chart when several are on
        // screen (pbui-gog.jsx:1368).
        data-chart-doc={docId ?? undefined}
        style={{ maxWidth: "100%" }}
      >
        {plot.panels.map((panel, index) => (
          <g key={index} transform={`translate(${panel.x0}, ${panel.y0})`}>
            <rect width={panel.w} height={panel.h} fill="var(--pbui-pane)" stroke="var(--pbui-ink)" strokeWidth="1.4" />
            {plot.yTicks.map((tick, i) => (
              <line key={i} x1={0} y1={tick.pos} x2={panel.w} y2={tick.pos} stroke={GRID} strokeWidth="0.7" />
            ))}
            {panel.title !== null && (
              <text x={3} y={-3} fontSize="9" fontWeight="700" fill="var(--pbui-ink)">
                {panel.title}
              </text>
            )}
            {panel.marks.map((mark, i) => (
              <MarkView key={i} mark={mark} docId={docId} />
            ))}
          </g>
        ))}

        {plot.panels[0] &&
          plot.yTicks.map((tick, i) => (
            <text
              key={`y${i}`}
              x={plot.panels[0]!.x0 - 4}
              y={plot.panels[0]!.y0 + tick.pos + 3}
              fontSize="8.5"
              fill={AXIS}
              textAnchor="end"
            >
              {tick.label}
            </text>
          ))}

        {plot.panels.map((panel, pi) =>
          plot.xTicks.map((tick, i) => (
            <text
              key={`${pi}x${i}`}
              x={panel.x0 + tick.pos}
              y={panel.y0 + panel.h + 12}
              fontSize="8.5"
              fill={AXIS}
              textAnchor="middle"
            >
              {tick.label}
            </text>
          )),
        )}
      </svg>

      {plot.legend.length > 0 && (
        <div style={{ minWidth: 96 }}>
          <div style={{ fontSize: "var(--pbui-fs-tiny)", color: "var(--pbui-faint)", fontWeight: 700 }}>
            {plot.legendTitle}
          </div>
          {plot.legend.map((entry) => (
            <Presentation
              key={entry.label}
              ptype="cat"
              value={{ docId, field: colorField, value: entry.value ?? entry.label }}
              doc={`<cat> ${plot.legendTitle}=${entry.label}`}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--pbui-space-2)",
                  fontSize: "var(--pbui-fs-small)",
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    background: entry.color,
                    border: "var(--pbui-border-hair)",
                    flexShrink: 0,
                  }}
                />
                {entry.label}
              </span>
            </Presentation>
          ))}
          {plot.legendOverflow > 0 && (
            <Text size="tiny" tone="faint">
              + {plot.legendOverflow} more, not coloured
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

function MarkView({ mark, docId }: { mark: Mark; docId: string | null }) {
  // A path has no row behind it — it is a line through many — so it is drawn
  // plainly rather than presented.
  if (mark.kind === "path") {
    return (
      <path d={mark.d} fill={mark.fill ?? "none"} fillOpacity={mark.fillOpacity} stroke={mark.stroke} strokeWidth="2" />
    );
  }

  // `svg` is not optional here. Inside an <svg> the renderer silently discards
  // HTML elements, so a <span> wrapper means no marks are drawn at all — no
  // error, no warning, an empty chart.
  return (
    <Presentation
      svg
      ptype="datum"
      value={{ docId, row: mark.row }}
      doc={`<datum> ${Object.entries(mark.row).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}`}
    >
      {mark.kind === "circle" ? (
        <circle cx={mark.x} cy={mark.y} r={mark.r} fill={mark.fill} fillOpacity="0.72" stroke="var(--pbui-ink)" strokeWidth="0.8" />
      ) : (
        <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill={mark.fill} fillOpacity="0.75" stroke="var(--pbui-ink)" strokeWidth="0.8" />
      )}
    </Presentation>
  );
}

registerApp({
  id: "chart",
  title: "chart",
  tone: "var(--pbui-tone-cat)",
  docBound: true,
  Component: ChartApp,
});
