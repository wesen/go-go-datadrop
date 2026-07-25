import { useDispatch, useSelector } from "react-redux";
import { newStep, schemaAfter, stepLabel } from "../../model/pipeline";
import type { Step } from "../../model/pipeline";
import { AGGREGATES, DERIVE_OPS, FILTER_OPS } from "../../model/pipeline";
import { Presentation, usePbui, type FieldRef } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Toolbar } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { DocBar } from "../../components/molecules";
import { Button, FieldChip, SelectInput, TextInput } from "../../components/atoms";
import { StepRow } from "../../components/molecules";

const KINDS: Step["kind"][] = ["filter", "derive", "summarize", "sort", "limit"];

/**
 * The tidyverse chain, each step a live object.
 *
 * The checkbox that disables a step WITHOUT deleting it is not a convenience.
 * It is what makes a pipeline an experiment rather than a recording: you A/B
 * your own transform by toggling it, and the chart, the table and the output
 * schema all answer immediately.
 */
function PipelineApp({ leafId, docId }: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const { doc, table, pipeline } = useDocPipeline(docId);
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);
  const target = doc?.id ?? activeDocId;
  const steps = doc?.spec.steps ?? [];

  const add = async (kind: Step["kind"]) => {
    if (!table || !doc) return;
    const schema = schemaAfter(table, steps, undefined, doc.spec.typeOverrides);

    // filter and summarize ACCEPT their field, so it can be pointed at from any
    // tile — the data browser, a table header, the chart's legend.
    if (kind === "filter" || kind === "summarize") {
      const result = await pbui.accept({
        ptype: "field",
        prompt:
          kind === "filter"
            ? `FILTER (chart ${pbui.environment.nameOf(target)}) — click the FIELD to filter on`
            : `GROUP BY (chart ${pbui.environment.nameOf(target)}) — click a nominal or temporal FIELD`,
        filter: (_p, value) => {
          const field = schema.find((f) => f.name === (value as FieldRef).name);
          if (!field) return false;
          return kind === "filter" ? true : field.type !== "q";
        },
      });
      if (!result) return;
      const name = (result.value as FieldRef).name;
      const step = newStep(kind, schema);
      dispatch(
        worldActions.addStep({
          docId: target,
          step:
            step.kind === "filter"
              ? { ...step, field: name }
              : step.kind === "summarize"
                ? { ...step, by: name }
                : step,
        }),
      );
      return;
    }
    dispatch(worldActions.addStep({ docId: target, step: newStep(kind, schema) }));
  };

  const update = (step: Step) => dispatch(worldActions.updateStep({ docId: target, step }));

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <Toolbar tight>
        {KINDS.map((kind) => (
          <Button key={kind} variant="framed" onClick={() => void add(kind)}>
            + {kind}
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

          {steps.map((step, index) => {
            const available = table
              ? schemaAfter(table, steps, index, doc?.spec.typeOverrides)
              : [];
            const dropped = pipeline?.dropped[step.id];
            return (
              <Stack key={step.id} gap={2}>
                <StepRow
                  kind={step.kind}
                  label={stepLabel(step)}
                  enabled={step.on}
                  canMoveUp={index > 0}
                  onToggle={() =>
                    dispatch(worldActions.toggleStep({ docId: target, stepId: step.id }))
                  }
                  onMoveUp={() =>
                    dispatch(worldActions.moveStep({ docId: target, stepId: step.id, by: -1 }))
                  }
                  onRemove={() =>
                    dispatch(worldActions.removeStep({ docId: target, stepId: step.id }))
                  }
                  // The DR-38 seam: the badge becomes a live <step>
                  // presentation, so its verbs are a right-click away.
                  renderKind={(badge) => (
                    <Presentation ptype="step" value={step.id} doc={`<step> ${stepLabel(step)}`}>
                      {badge}
                    </Presentation>
                  )}
                />

                <StepEditor step={step} fields={available.map((f) => f.name)} onChange={update} />

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
            );
          })}

          <Stack gap={2}>
            <SectionLabel>Out → {pipeline?.rows.length.toLocaleString() ?? 0} rows</SectionLabel>
            <Stack direction="row" gap={2} wrap>
              {(pipeline?.fields ?? []).map((field) => (
                <FieldChip key={field.name} field={{ docId: target, name: field.name }} />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </AppBody>
    </>
  );
}

function StepEditor({
  step,
  fields,
  onChange,
}: {
  step: Step;
  fields: string[];
  onChange: (step: Step) => void;
}) {
  // `label` is required by SelectInput and none of these had one before: the
  // step editor shipped six unlabelled selects, which a screen reader announces
  // as "combo box" and nothing else. Naming them is the one behaviour change in
  // this substitution, and it is a fix.
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
          {select("field to filter on", step.field, fields, (field) => onChange({ ...step, field }))}
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

registerApp({
  id: "pipeline",
  title: "pipeline",
  tone: "var(--pbui-tone-step)",
  docBound: true,
  Component: PipelineApp,
});
