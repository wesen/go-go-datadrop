import type { ReactNode } from "react";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { Swatch } from "../../atoms";

export interface LegendEntry {
  label: string;
  color: string;
  /** The underlying value, for the caller's presentation wrapper. */
  value?: string | number | null;
}

/**
 * What the colours mean.
 *
 * `renderEntry` is the seam that keeps this molecule provider-free (DR-38).
 * In ChartApp each entry is a live `<cat>` presentation — right-click it and
 * you get "filter to this category" — but a molecule that wrapped itself in
 * `Presentation` would need a PbuiProvider in every story and could no longer
 * be rendered in isolation, which is the property the extraction buys. So the
 * default renders a plain swatch and label, and the application passes a
 * function that wraps it.
 *
 * `overflow` is a count, not a list. A categorical palette has eight colours;
 * a field with sixty distinct values gets eight coloured and the rest
 * neutral, and saying so is the difference between "the chart is wrong" and
 * "the chart is showing you eight of sixty".
 */
export function Legend({
  title,
  entries,
  overflow = 0,
  renderEntry,
}: {
  /**
   * Null when the plot has no colour channel to name.
   *
   * `string | null` rather than `string` because that is what `buildPlot`
   * produces, and coercing it to `""` at the call site would render an empty
   * section label above the entries — a heading with nothing in it, which is
   * the defect shape this design system has now been bitten by twice.
   */
  title: string | null;
  entries: readonly LegendEntry[];
  overflow?: number;
  renderEntry?: (entry: LegendEntry, body: ReactNode) => ReactNode;
}) {
  if (entries.length === 0) return null;

  return (
    <Stack gap={1} data-part="legend">
      {title && <SectionLabel>{title}</SectionLabel>}
      {entries.map((entry) => {
        const body = (
          <Stack direction="row" gap={2} align="center" as="span">
            <Swatch color={entry.color} label={entry.label} />
            <Text size="small">{entry.label}</Text>
          </Stack>
        );
        return (
          <span key={entry.label}>{renderEntry ? renderEntry(entry, body) : body}</span>
        );
      })}
      {overflow > 0 && (
        <Text size="tiny" tone="faint">
          + {overflow} more, not coloured
        </Text>
      )}
    </Stack>
  );
}
