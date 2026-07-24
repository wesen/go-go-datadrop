import { forwardRef, useState } from "react";
import type { Mark, Plot } from "../model/plot";
import type { Row } from "../model/table";
import { asText } from "../model/table";

// Rendering is a straight walk over the geometry buildPlot produced. There is
// no scale arithmetic in this file — if a mark is in the wrong place, the bug
// is in plot.ts and a unit test can find it without a browser.

const AXIS = "#8a93a5";
const GRID = "#e6e9ef";
const TEXT = "#3c4351";

interface Props {
  plot: Plot;
  /** Every mark that came from a single row reports it on hover. */
  onHoverRow?: (row: Row | null) => void;
}

function markKey(mark: Mark, index: number): string {
  return `${mark.kind}-${index}`;
}

export const PlotSvg = forwardRef<SVGSVGElement, Props>(function PlotSvg(
  { plot, onHoverRow },
  ref,
) {
  const [hovered, setHovered] = useState<Row | null>(null);

  const hover = (row: Row | null) => {
    setHovered(row);
    onHoverRow?.(row);
  };

  if (plot.problems.length > 0) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        <div className="fw-semibold mb-1">Nothing to draw yet</div>
        <ul className="mb-0 ps-3">
          {plot.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <svg
        ref={ref}
        width={plot.width}
        height={plot.height}
        role="img"
        aria-label="chart"
        style={{ maxWidth: "100%", fontFamily: "system-ui, sans-serif" }}
      >
        {plot.panels.map((panel, panelIndex) => (
          <g key={panelIndex} transform={`translate(${panel.x0}, ${panel.y0})`}>
            {panel.title !== null && (
              <text x={0} y={-4} fontSize={11} fill={TEXT}>
                {panel.title}
              </text>
            )}

            {/* Grid lines first, so marks sit on top of them. */}
            {plot.yTicks.map((tick) => (
              <line
                key={`gy-${tick.label}`}
                x1={0}
                x2={panel.w}
                y1={tick.pos}
                y2={tick.pos}
                stroke={GRID}
                strokeWidth={1}
              />
            ))}

            <line x1={0} x2={0} y1={0} y2={panel.h} stroke={AXIS} strokeWidth={1} />
            <line x1={0} x2={panel.w} y1={panel.h} y2={panel.h} stroke={AXIS} strokeWidth={1} />

            {panel.marks.map((mark, index) => {
              if (mark.kind === "circle") {
                return (
                  <circle
                    key={markKey(mark, index)}
                    cx={mark.x}
                    cy={mark.y}
                    r={mark.r}
                    fill={mark.fill}
                    fillOpacity={hovered && hovered !== mark.row ? 0.25 : 0.85}
                    onMouseEnter={() => hover(mark.row)}
                    onMouseLeave={() => hover(null)}
                  />
                );
              }
              if (mark.kind === "rect") {
                return (
                  <rect
                    key={markKey(mark, index)}
                    x={mark.x}
                    y={mark.y}
                    width={mark.w}
                    height={mark.h}
                    fill={mark.fill}
                    fillOpacity={hovered && hovered !== mark.row ? 0.3 : 0.85}
                    onMouseEnter={() => hover(mark.row)}
                    onMouseLeave={() => hover(null)}
                  />
                );
              }
              return (
                <path
                  key={markKey(mark, index)}
                  d={mark.d}
                  stroke={mark.stroke ?? "none"}
                  strokeWidth={1.6}
                  fill={mark.fill ?? "none"}
                  fillOpacity={mark.fillOpacity ?? 1}
                />
              );
            })}

            {/* Only the first panel of a row carries y labels, and only the
                bottom row carries x labels — repeating them on shared scales is
                noise. */}
            {panelIndex % Math.max(1, Math.round(plot.width / (panel.w + 14))) === 0 &&
              plot.yTicks.map((tick) => (
                <text
                  key={`ly-${tick.label}`}
                  x={-6}
                  y={tick.pos + 3}
                  fontSize={10}
                  fill={TEXT}
                  textAnchor="end"
                >
                  {tick.label}
                </text>
              ))}

            {plot.xTicks.map((tick) => (
              <text
                key={`lx-${tick.label}`}
                x={tick.pos}
                y={panel.h + 14}
                fontSize={10}
                fill={TEXT}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            ))}
          </g>
        ))}

        {plot.legend.length > 0 && (
          <g transform={`translate(${plot.width - plot.legendW + 8}, 14)`}>
            {plot.legendTitle && (
              <text x={0} y={0} fontSize={10} fill={TEXT} fontWeight={600}>
                {plot.legendTitle}
              </text>
            )}
            {plot.legend.map((entry, index) => (
              <g key={entry.label} transform={`translate(0, ${14 + index * 15})`}>
                <rect width={9} height={9} y={-8} fill={entry.color} rx={2} />
                <text x={14} y={0} fontSize={10} fill={TEXT}>
                  {entry.label.length > 14 ? entry.label.slice(0, 13) + "…" : entry.label}
                </text>
              </g>
            ))}
            {plot.legendOverflow > 0 && (
              <text
                x={0}
                y={14 + plot.legend.length * 15}
                fontSize={10}
                fill={AXIS}
              >
                + {plot.legendOverflow} more
              </text>
            )}
          </g>
        )}
      </svg>

      {plot.facetOverflow > 0 && (
        <div className="small text-warning-emphasis mt-1">
          {plot.facetOverflow} further facet {plot.facetOverflow === 1 ? "value is" : "values are"}{" "}
          not shown — filter or summarize to bring them into range.
        </div>
      )}

      {hovered && (
        <div className="small text-body-secondary mt-2 font-monospace">
          {Object.entries(hovered)
            .slice(0, 8)
            .map(([key, value]) => `${key}=${asText(value)}`)
            .join("  ")}
        </div>
      )}
    </div>
  );
});
