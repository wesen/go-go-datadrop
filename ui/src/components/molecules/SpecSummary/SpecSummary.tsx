import { specFacts } from "../../../model/chart";
import type { ChartSpec } from "../../../model/chart";
import { Text } from "../../foundation";

/**
 * A chart specification in one line.
 *
 * `source ⊳ 2 steps ⊳ geom_bar · x↦station y↦mean_temp`, which is the sentence
 * the snapshot gallery and the document manager both wanted and both used to
 * build for themselves out of the same six fields.
 *
 * The content comes from `specFacts`, so this component decides only *which*
 * facts fit on a line and how they are punctuated. That split is the point: a
 * fact added to a spec appears in the compare view automatically and here only
 * if someone decides it earns the width.
 *
 * `⊳` separates the stages of the composition — source, then transform, then
 * drawing — and `·` separates the drawing's parts. Two separators rather than
 * one because the reader is scanning for a stage, not parsing a list.
 */
export function SpecSummary({
  spec,
  /** Shown as "N row budget" when given. Omitted for a bare specification. */
  limit,
}: {
  spec: ChartSpec;
  limit?: number;
}) {
  const facts = new Map(specFacts(spec, limit));
  const get = (key: string) => facts.get(key) ?? "—";
  // Counted here rather than read from the facts, because the fact carries the
  // step LABELS — the form the diff needs, and far too long for one line.
  const steps = spec.steps.filter((s) => s.on).length;

  return (
    <Text size="tiny" tone="faint">
      {get("source")} ⊳ {steps} steps ⊳ geom_{get("geom")} · x↦{get("x")} y↦{get("y")}
      {limit !== undefined ? ` · ${get("row budget")} row budget` : ""}
    </Text>
  );
}
