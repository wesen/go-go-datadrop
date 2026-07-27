import type { ReactNode } from "react";
import { Presentation } from "../../../pbui";
import { Text } from "../../foundation";
import { AppBody, Stack } from "../../layout";
import styles from "./BackdropPanel.module.css";

export interface BackdropMark {
  id: string;
  /** In the BACKDROP's coordinate space, not in pixels and not in data units. */
  x: number;
  y: number;
  r?: number;
  /** A CSS variable reference. */
  tone?: string;
  /**
   * Outlined rather than filled.
   *
   * A second channel for a binary, alongside colour. `ui/GUIDELINES.md`
   * requires meaning never to be carried by colour alone, and a shot chart is
   * the clearest case: made and missed differ in fill AND in hue, so the chart
   * survives being printed, screenshotted in greyscale, or read by someone with
   * a colour vision deficiency.
   */
  hollow?: boolean;
  label: string;
  /** Passed to the caller's presentation wrapper. */
  value?: unknown;
}

export interface BackdropPanelProps {
  /** The frame's own coordinate space. */
  width: number;
  height: number;
  /** Drawn beneath the marks. The design system ships none — callers supply it. */
  backdrop: ReactNode;
  marks: BackdropMark[];
  /** The accessible name for the whole figure. */
  label: string;
  /** Presentation type for each mark, when they are objects worth acting on. */
  ptype?: Parameters<typeof Presentation>[0]["ptype"];
  /** Rendered above the figure: zone summaries, a legend, a count. */
  header?: ReactNode;
}

/**
 * Marks on a fixed spatial frame instead of on axes.
 *
 * Some data is positional in a space the reader already knows — a court, a
 * field, a floor plan, a rack elevation, a wafer map. For that data an axis is
 * noise: a position means something because of where the three-point arc is,
 * not because of a number on a scale. The backdrop *is* the coordinate system.
 *
 * There is deliberately no scale computation here. Marks arrive in the
 * backdrop's own coordinates and are drawn there, which is what makes the
 * component trivially correct and pushes the interesting question — how do my
 * data coordinates map onto this frame — to the caller, who is the only one who
 * can answer it.
 */
export function BackdropPanel({
  width,
  height,
  backdrop,
  marks,
  label,
  ptype,
  header,
}: BackdropPanelProps) {
  return (
    <AppBody>
      <Stack gap={2}>
        {header}
        <svg
          className={styles.figure}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
        >
          {backdrop}
          {marks.map((mark) =>
            // `svg` is not optional. Inside an <svg> React silently discards
            // HTML elements, so a <span> wrapper means no marks are drawn at
            // all — no error, no warning, an empty figure.
            ptype ? (
              <Presentation key={mark.id} svg ptype={ptype} value={mark.value} doc={mark.label}>
                <MarkCircle mark={mark} />
              </Presentation>
            ) : (
              <g key={mark.id}>
                <title>{mark.label}</title>
                <MarkCircle mark={mark} />
              </g>
            ),
          )}
        </svg>
        {marks.length === 0 ? (
          <Text size="small" tone="faint">
            nothing to place on this frame yet
          </Text>
        ) : null}
      </Stack>
    </AppBody>
  );
}

/**
 * One mark. Extracted so the wrapper above holds the only key in the iterable —
 * an inline element assigned to a variable inside a `.map` reads to the linter
 * as an unkeyed child even when the wrapper carries the key.
 */
function MarkCircle({ mark }: { mark: BackdropMark }) {
  return (
    <circle
      cx={mark.x}
      cy={mark.y}
      r={mark.r ?? 4}
      fill={mark.hollow ? "none" : (mark.tone ?? "var(--pbui-tone-neutral)")}
      stroke={mark.tone ?? "var(--pbui-ink)"}
      strokeWidth={mark.hollow ? 1.4 : 0.7}
      fillOpacity={mark.hollow ? 1 : 0.9}
    />
  );
}
