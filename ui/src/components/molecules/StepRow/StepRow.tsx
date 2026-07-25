import type { ReactNode } from "react";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { CheckboxRow, IconButton } from "../../atoms";
import styles from "./StepRow.module.css";

/**
 * One pipeline verb: its kind, what it does, and the three things you can do to it.
 *
 * The order of the row is the order of the questions a reader has: is this step
 * running, what kind is it, what does it do, and can I move or remove it. The
 * `flex: 1` spacer between the label and the buttons is what keeps the controls
 * aligned down a column of steps whose labels are all different lengths.
 *
 * A disabled step is dimmed rather than hidden. `filter` steps that are toggled
 * off are how the pipeline is debugged — the point is to see the step you have
 * just switched off, next to its neighbours, and switch it back on.
 *
 * `renderKind` is the DR-38 seam: PipelineApp makes the kind badge a live
 * `<step>` presentation, so right-clicking it offers the step's verbs. The
 * default draws the badge, so this row renders in a story with no provider.
 */
export function StepRow({
  kind,
  label,
  enabled,
  canMoveUp,
  onToggle,
  onMoveUp,
  onRemove,
  renderKind,
}: {
  kind: string;
  /** One line describing what the step does, from `stepLabel`. */
  label: string;
  enabled: boolean;
  canMoveUp: boolean;
  onToggle(): void;
  onMoveUp(): void;
  onRemove(): void;
  renderKind?: (badge: ReactNode) => ReactNode;
}) {
  const badge = (
    <span className={[styles.kind, enabled ? "" : styles.off].filter(Boolean).join(" ")}>
      {kind}
    </span>
  );

  return (
    <Stack direction="row" gap={2} align="center" wrap data-part="step-row">
      <CheckboxRow
        checked={enabled}
        label={`enable ${kind}`}
        hideLabel
        title="disable this step without deleting it"
        onCheckedChange={onToggle}
      />
      {renderKind ? renderKind(badge) : badge}
      <Text size="tiny" tone="faint">
        {label}
      </Text>
      <span className={styles.spacer} />
      <IconButton
        variant="framed"
        glyph="↑"
        label="move up"
        disabled={!canMoveUp}
        onClick={onMoveUp}
      />
      <IconButton
        variant="framed"
        tone="danger"
        glyph="✕"
        label="remove step"
        onClick={onRemove}
      />
    </Stack>
  );
}
