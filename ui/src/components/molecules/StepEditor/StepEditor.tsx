import { AGGREGATES, DERIVE_OPS, FILTER_OPS } from "../../../model/pipeline";
import type { Step } from "../../../model/pipeline";
import { SelectInput, TextInput } from "../../atoms";
import { Text } from "../../foundation";
import { Stack } from "../../layout";

/**
 * The controls for one pipeline step, switched on its kind.
 *
 * Extracted from `PipelineApp` (DATADROP-6 phase 3). It was 130 lines of a
 * five-way switch inside a 293-line application, which meant the only way to
 * see a `derive` editor was to add a derive step to a running pipeline — and
 * the only way to see the `log10` variant, which hides the right operand, was
 * to then pick that operator. Nobody had.
 *
 * A molecule rather than an organism: it holds no store, no pbui and no
 * fetches. It takes a step, the field names available *at that point in the
 * chain*, and one callback.
 *
 * ## The `fields` prop is the schema before this step, not the source schema
 *
 * A filter added after a summarize must offer the summarize's output columns,
 * not the ones the summarize consumed. The caller computes that with
 * `schemaAfter(table, steps, index)` and passes the names down; this component
 * never sees a table. That is what keeps it out of the render path Part I of
 * the phase-2 guide is about.
 *
 * An empty `fields` array renders "(no field)" rather than an empty select,
 * because a select with no options is indistinguishable from a broken one.
 */
export function StepEditor({
  step,
  fields,
  onChange,
}: {
  step: Step;
  /** Field names available to this step — the schema as of just before it. */
  fields: string[];
  onChange: (step: Step) => void;
}) {
  /*
   * `label` is required by SelectInput and none of these had one before the
   * DATADROP-6 substitution: the step editor shipped six unlabelled selects,
   * which a screen reader announces as "combo box" and nothing else.
   */
  const select = (
    label: string,
    value: string,
    options: string[],
    onPick: (v: string) => void,
    compact = false,
  ) => (
    <SelectInput
      label={label}
      variant="framed"
      width={compact ? "compact" : "auto"}
      value={value}
      onValueChange={onPick}
      options={
        options.length === 0
          ? [{ value: "", label: "(no field)" }]
          : options.map((option) => ({ value: option, label: option }))
      }
    />
  );

  switch (step.kind) {
    case "filter":
      return (
        <Stack direction="row" gap={2} wrap>
          {select("field to filter on", step.field, fields, (field) =>
            onChange({ ...step, field }),
          )}
          {select(
            "comparison",
            step.op,
            [...FILTER_OPS],
            (op) => onChange({ ...step, op: op as typeof step.op }),
            true,
          )}
          <TextInput
            label="value to compare against"
            size="small"
            value={step.value}
            placeholder="value (blank passes everything)"
            onValueChange={(value) => onChange({ ...step, value })}
          />
        </Stack>
      );
    case "derive":
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <TextInput
            label="name of the derived field"
            size="small"
            width="compact"
            value={step.name}
            onValueChange={(name) => onChange({ ...step, name })}
          />
          <Text size="small">=</Text>
          {select("left operand", step.a, fields, (a) => onChange({ ...step, a }))}
          {select(
            "operator",
            step.op,
            [...DERIVE_OPS],
            (op) => onChange({ ...step, op: op as typeof step.op }),
            true,
          )}
          {/* log10 is unary: a right operand would be a control that does
              nothing, which is worse than a missing one. */}
          {step.op !== "log10" &&
            select("right operand", step.b, fields, (b) => onChange({ ...step, b }))}
        </Stack>
      );
    case "summarize":
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <Text size="tiny" tone="faint">
            by
          </Text>
          {select("field to group by", step.by, fields, (by) => onChange({ ...step, by }))}
          {select(
            "aggregate",
            step.fn,
            [...AGGREGATES],
            (fn) => onChange({ ...step, fn: fn as typeof step.fn }),
            true,
          )}
          {/* count needs no column: it counts rows. */}
          {step.fn !== "count" &&
            select("field to aggregate", step.field, fields, (field) =>
              onChange({ ...step, field }),
            )}
        </Stack>
      );
    case "sort":
      return (
        <Stack direction="row" gap={2} wrap>
          {select("field to sort on", step.field, fields, (field) => onChange({ ...step, field }))}
          {select(
            "direction",
            step.dir,
            ["asc", "desc"],
            (dir) => onChange({ ...step, dir: dir as "asc" | "desc" }),
            true,
          )}
        </Stack>
      );
    case "limit":
      return (
        <Stack direction="row" gap={2} align="center">
          <TextInput
            label="rows to keep"
            size="small"
            width="compact"
            inputMode="numeric"
            value={String(step.n)}
            onValueChange={(n) => onChange({ ...step, n: Number(n) })}
          />
          {/* Never the bare word "limit": there are two, and the other one is
              the row budget on the source. */}
          <Text size="tiny" tone="faint">
            rows kept after the transform
          </Text>
        </Stack>
      );
  }
}
