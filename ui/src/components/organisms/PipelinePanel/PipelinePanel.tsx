import { stepLabel } from "../../../model/pipeline";
import type { Step } from "../../../model/pipeline";
import { Presentation } from "../../../pbui";
import { Button, FieldChip } from "../../atoms";
import { SectionLabel, Text } from "../../foundation";
import { AppBody, Stack, Toolbar } from "../../layout";
import { StepEditor, StepRow } from "../../molecules";

/** The verbs the toolbar offers, in the order a chain is usually built. */
export const STEP_KINDS: Step["kind"][] = ["filter", "derive", "summarize", "sort", "limit"];

/**
 * One step, with everything the panel needs to draw it.
 *
 * `available` is the schema *as of just before this step*, so a filter added
 * after a summarize offers the summarize's output columns. The container
 * computes it with `schemaAfter(table, steps, index)`; the panel never sees a
 * table, which is what keeps it out of the render path.
 */
export interface PipelineStepView {
  step: Step;
  /** Field names this step may name. */
  available: string[];
  /** Rows this step removed because the result was not a finite number. */
  dropped?: number;
}

/**
 * The tidyverse chain, each step a live object.
 *
 * The checkbox that disables a step WITHOUT deleting it is not a convenience.
 * It is what makes a pipeline an experiment rather than a recording: you A/B
 * your own transform by toggling it, and the chart, the table and the output
 * schema all answer immediately.
 *
 * ## Why the panel supplies the `<step>` presentation
 *
 * `StepRow` takes a `renderKind` render prop so that the caller decides whether
 * a step badge is a live object (DR-38). Before DATADROP-6 phase 3 that caller
 * was `PipelineApp`; it is this panel now, and the change is deliberate rather
 * than incidental. DR-38 forbids a component wrapping *itself* in a
 * presentation — it must not decide that it is an object — but deciding that
 * the rows it draws are objects is exactly an organism's job, and it is what
 * `TablePanel` already does with its headers.
 *
 * The consequence is that this panel's stories need the `pbui` decorator, which
 * is global.
 *
 * ## The two warnings under a step
 *
 * `dropped` reports rows a derive step removed because the arithmetic produced
 * a non-finite result, and it is per-step rather than per-pipeline because
 * "something dropped 40 rows" is not actionable and "this step did" is.
 *
 * The summarize note is unconditional rather than conditional on having lost a
 * column, because the loss is a property of the verb rather than of this
 * chain — a user who learns it once here does not have to rediscover it when a
 * later summarize eats a column they wanted.
 */
export function PipelinePanel({
  steps,
  outputFields,
  outputRows,
  docId,
  onAdd,
  onToggle,
  onMoveUp,
  onRemove,
  onChange,
}: {
  steps: PipelineStepView[];
  /** The names the chain finally produces, drawn as live field chips. */
  outputFields: string[];
  outputRows: number;
  /** Which document the output chips belong to. Null falls back to the active one. */
  docId: string | null;
  /** Filter and summarize open an accept, so this is async at the call site. */
  onAdd: (kind: Step["kind"]) => void;
  onToggle: (stepId: string) => void;
  onMoveUp: (stepId: string) => void;
  onRemove: (stepId: string) => void;
  onChange: (step: Step) => void;
}) {
  return (
    <>
      <Toolbar tight>
        {STEP_KINDS.map((kind) => (
          <Button key={kind} variant="framed" onClick={() => onAdd(kind)}>
            {/* The ellipsis marks the two that ask you to point at a field
                before they exist, so a click that opens an accept banner is not
                a surprise. */}+ {kind}
            {kind === "filter" || kind === "summarize" ? "…" : ""}
          </Button>
        ))}
      </Toolbar>

      <AppBody>
        <Stack gap={3}>
          {steps.length === 0 && (
            <Text size="small" tone="faint">
              No steps — the chart draws the table as loaded. Add a verb above.
            </Text>
          )}

          {steps.map(({ step, available, dropped }, index) => (
            <Stack key={step.id} gap={2}>
              <StepRow
                kind={step.kind}
                label={stepLabel(step)}
                enabled={step.on}
                canMoveUp={index > 0}
                onToggle={() => onToggle(step.id)}
                onMoveUp={() => onMoveUp(step.id)}
                onRemove={() => onRemove(step.id)}
                renderKind={(badge) => (
                  <Presentation ptype="step" value={step.id} doc={`<step> ${stepLabel(step)}`}>
                    {badge}
                  </Presentation>
                )}
              />

              <StepEditor step={step} fields={available} onChange={onChange} />

              {dropped ? (
                <Text size="tiny" tone="danger">
                  removed {dropped} rows whose result was not a finite number
                </Text>
              ) : null}
              {step.kind === "summarize" && (
                <Text size="tiny" tone="faint">
                  summarize keeps only the group key and the aggregate — every other column is
                  dropped
                </Text>
              )}
            </Stack>
          ))}

          <Stack gap={2}>
            <SectionLabel>Out → {outputRows.toLocaleString()} rows</SectionLabel>
            <Stack direction="row" gap={2} wrap>
              {outputFields.map((name) => (
                <FieldChip key={name} field={{ docId, name }} />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </AppBody>
    </>
  );
}
