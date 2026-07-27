import type { RadarPlot } from "../../../model/radar";
import { Text } from "../../foundation";
import { AppBody, Stack } from "../../layout";
import { Chip } from "../../atoms";
import styles from "./RadarPanel.module.css";

export interface RadarPanelProps {
  plot: RadarPlot;
  /** Rendered at the given box size; the geometry was computed for it. */
  size?: number;
}

/**
 * A radar chart.
 *
 * All geometry comes from `buildRadar` — this draws and nothing else, the same
 * split `ChartPanel` has from `buildPlot`. That is what lets the shape be
 * asserted at exact coordinates in a test with no DOM.
 *
 * The normalisation sentence is **not optional decoration**. Each spoke is
 * scaled against its own maximum, so a shape compares rank *within* a category
 * and says nothing about values *across* categories. A reader who assumes
 * otherwise is misled by the picture rather than by the text, which is why the
 * sentence travels in the plot instead of being left to the caller.
 */
export function RadarPanel({ plot, size = 300 }: RadarPanelProps) {
  if (plot.problems.length > 0) {
    return (
      <AppBody>
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
      </AppBody>
    );
  }

  return (
    <AppBody>
      <Stack gap={2}>
        {plot.notices.map((notice) => (
          <Text key={notice} size="tiny" tone="faint">
            ⚠ {notice}
          </Text>
        ))}

        <div className={styles.row}>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            role="img"
            aria-label={`radar over ${plot.axes.map((a) => a.label).join(", ")}`}
          >
            {plot.rings.map((ring) => (
              <polygon
                key={ring}
                className={styles.ring}
                points={plot.axes
                  .map((a) => {
                    const x = plot.cx + (a.x - plot.cx) * ring;
                    const y = plot.cy + (a.y - plot.cy) * ring;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            ))}

            {plot.axes.map((a) => (
              <g key={a.label}>
                <line className={styles.spoke} x1={plot.cx} y1={plot.cy} x2={a.x} y2={a.y} />
                <text
                  className={styles.axisLabel}
                  x={a.labelX}
                  y={a.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {a.label}
                </text>
              </g>
            ))}

            {plot.polygons.map((poly) => (
              <polygon
                key={poly.key}
                className={styles.series}
                points={poly.points.map((p) => `${p.x},${p.y}`).join(" ")}
                style={{ fill: poly.color, stroke: poly.color }}
              />
            ))}
          </svg>

          <Stack gap={1} className={styles.legend}>
            {plot.polygons.map((poly) => (
              <Chip key={poly.key} label={poly.label} tone={poly.color} />
            ))}
          </Stack>
        </div>

        <Text size="tiny" tone="faint">
          {plot.normalisation}
        </Text>
      </Stack>
    </AppBody>
  );
}
