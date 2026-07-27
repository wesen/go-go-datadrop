import { MAX_MARKS } from "../../../model/plot";
import type { Mark, Plot } from "../../../model/plot";
import type { Table } from "../../../model/table";
import { Presentation } from "../../../pbui";
import { Text } from "../../foundation";
import { Legend, TruncationNotice } from "../../molecules";

/**
 * The composed plot, fully live.
 *
 * Marks are `<datum>` presentations and legend swatches are `<cat>`
 * presentations, so right-clicking a dot injects a real filter step into the
 * pipeline — visible in the pipeline tile, toggleable, and part of the
 * specification rather than a view-level filter. A chart built from typed
 * objects can be edited by pointing at itself.
 *
 * **This organism wraps its own marks in `Presentation`, which DR-38 otherwise
 * forbids.** It is the same exception the `*Chip` atoms hold, for the same
 * reason: a presentation is what a mark *is* here, not a decoration applied to
 * it. The render-prop seam used by `Legend` and `MemberRow` exists so a caller
 * can make a handful of rows live; a scatter plot has thousands of marks, and a
 * prop per mark would be an absurdity rather than a seam. Its stories rely on
 * the global `withPbui` decorator, exactly as every chip story does.
 *
 * There is **no scale arithmetic in this file**. Every coordinate comes from
 * `buildPlot`, so a mark in the wrong place is a defect in `model/plot.ts` that
 * a unit test finds without a browser — which is also what makes this panel
 * storyable against a literal `Plot`.
 */
export function ChartPanel({
  plot,
  table,
  loading = false,
  docId,
  colorField,
}: {
  /** Null when there is no source, or while the first table is loading. */
  plot: Plot | null;
  /** For the truncation banner. Omit when there is no table yet. */
  table?: Table | null;
  loading?: boolean;
  docId: string | null;
  colorField: string | null;
}) {
  return (
    <>
      {table && <TruncationNotice table={table} />}

      {!plot ? (
        <Text size="small" tone="faint">
          {loading ? "loading…" : "no source — load one from the sources tile"}
        </Text>
      ) : plot.problems.length > 0 ? (
        // A specification that cannot be drawn says which part is missing,
        // rather than rendering empty axes that look like an absence of data.
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
        <>
          {/* The chart WAS drawn; these say what part of the spec could not be
              honoured. Above the plot rather than below it, because a reader who
              scrolls away never learns their reference line is missing. */}
          {plot.notices.length > 0 ? (
            <div role="status">
              {plot.notices.map((notice) => (
                <div key={notice}>
                  <Text size="tiny" tone="faint">
                    ⚠ {notice}
                  </Text>
                </div>
              ))}
            </div>
          ) : null}
          <PlotSvg plot={plot} docId={docId} colorField={colorField} />
          {/* Every place the view is not the whole truth says so. */}
          {(plot.markOverflow > 0 || plot.facetOverflow > 0) && (
            <div role="status" style={{ marginTop: "var(--pbui-space-2)" }}>
              {plot.markOverflow > 0 && (
                <Text size="tiny" tone="danger">
                  {plot.markOverflow.toLocaleString()} rows are not drawn — a panel is capped at{" "}
                  {MAX_MARKS.toLocaleString()} marks. Add a limit or a summarize step, or narrow the
                  source.
                </Text>
              )}
              {plot.facetOverflow > 0 && (
                <Text size="tiny" tone="danger">
                  {plot.facetOverflow} facet panels are not drawn.
                </Text>
              )}
            </div>
          )}
        </>
      )}
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
            <rect
              width={panel.w}
              height={panel.h}
              fill="var(--pbui-pane)"
              stroke="var(--pbui-ink)"
              strokeWidth="1.4"
            />
            {plot.yTicks.map((tick, i) => (
              <line
                key={i}
                x1={0}
                y1={tick.pos}
                x2={panel.w}
                y2={tick.pos}
                stroke={GRID}
                strokeWidth="0.7"
              />
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

      <div style={{ minWidth: 96 }}>
        <Legend
          title={plot.legendTitle}
          entries={plot.legend}
          overflow={plot.legendOverflow}
          // The DR-38 seam: the molecule draws a swatch and a label, and the
          // application makes each entry a live <cat> presentation — so
          // "filter to this category" is a right-click on the legend.
          renderEntry={(entry, body) => (
            <Presentation
              ptype="cat"
              value={{ docId, field: colorField, value: entry.value ?? entry.label }}
              doc={`<cat> ${plot.legendTitle}=${entry.label}`}
            >
              {body}
            </Presentation>
          )}
        />
      </div>
    </div>
  );
}

function MarkView({ mark, docId }: { mark: Mark; docId: string | null }) {
  // A path has no row behind it — it is a line through many — so it is drawn
  // plainly rather than presented.
  if (mark.kind === "path") {
    return (
      <path
        d={mark.d}
        fill={mark.fill ?? "none"}
        fillOpacity={mark.fillOpacity}
        stroke={mark.stroke}
        strokeWidth="2"
      />
    );
  }

  // A reference line is chrome, not data: no row behind it, nothing to act on,
  // so it is never wrapped in a Presentation (DATADROP-13 §4.1).
  if (mark.kind === "rule") {
    const midX = (mark.x1 + mark.x2) / 2;
    return (
      <g>
        <line
          x1={mark.x1}
          y1={mark.y1}
          x2={mark.x2}
          y2={mark.y2}
          stroke={
            mark.intent === "limit"
              ? "var(--pbui-danger)"
              : mark.intent === "target"
                ? "var(--pbui-ok)"
                : "var(--pbui-faint)"
          }
          strokeWidth={mark.intent === "reference" ? 1 : 1.4}
          strokeDasharray={mark.intent === "limit" ? "2 2" : "4 3"}
        />
        {mark.label ? (
          <text
            x={mark.x1 === mark.x2 ? mark.x1 + 3 : midX}
            y={mark.y1 === mark.y2 ? mark.y1 - 3 : 9}
            fontSize="8"
            fontWeight="700"
            fill="var(--pbui-faint)"
            textAnchor={mark.x1 === mark.x2 ? "start" : "middle"}
          >
            {mark.label}
            {/* A clipped rule sits on the panel edge, which otherwise reads as
                "we are exactly at target". The arrow says the real value is
                further out. */}
            {mark.clipped ? (mark.x1 === mark.x2 ? " →" : " ↑") : ""}
          </text>
        ) : null}
      </g>
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
      doc={`<datum> ${Object.entries(mark.row)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" · ")}`}
    >
      {mark.kind === "circle" ? (
        <circle
          cx={mark.x}
          cy={mark.y}
          r={mark.r}
          fill={mark.fill}
          fillOpacity="0.72"
          stroke="var(--pbui-ink)"
          strokeWidth="0.8"
        />
      ) : (
        <rect
          x={mark.x}
          y={mark.y}
          width={mark.w}
          height={mark.h}
          fill={mark.fill}
          fillOpacity="0.75"
          stroke="var(--pbui-ink)"
          strokeWidth="0.8"
        />
      )}
    </Presentation>
  );
}
