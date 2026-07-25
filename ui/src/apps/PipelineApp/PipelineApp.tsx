import { useDispatch, useSelector } from "react-redux";
import { newStep, schemaAfter, stepLabel } from "../../model/pipeline";
import type { Step } from "../../model/pipeline";
import { AGGREGATES, DERIVE_OPS, FILTER_OPS } from "../../model/pipeline";
import { Presentation, usePbui, type FieldRef } from "../../pbui";
import { registerApp, type AppProps } from "../registry";
import { useDocPipeline } from "../useTable";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Toolbar } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { DocBar } from "../../components/molecules";
import { FieldChip } from "../../components/atoms";

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
          <button key={kind} type="button" onClick={() => void add(kind)} style={btn}>
            + {kind}
            {kind === "filter" || kind === "summarize" ? "…" : ""}
          </button>
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
                <Stack direction="row" gap={2} align="center" wrap>
                  <input
                    type="checkbox"
                    checked={step.on}
                    aria-label={`enable ${step.kind}`}
                    title="disable this step without deleting it"
                    onChange={() =>
                      dispatch(worldActions.toggleStep({ docId: target, stepId: step.id }))
                    }
                  />
                  <Presentation
                    ptype="step"
                    value={step.id}
                    doc={`<step> ${stepLabel(step)}`}
                  >
                    <span
                      style={{
                        border: "var(--pbui-border-hair)",
                        borderLeft: "var(--pbui-tone-edge) solid var(--pbui-tone-step)",
                        background: "var(--pbui-pane)",
                        padding: "0 var(--pbui-space-3)",
                        fontSize: "var(--pbui-fs-tiny)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        opacity: step.on ? 1 : 0.5,
                      }}
                    >
                      {step.kind}
                    </span>
                  </Presentation>
                  <Text size="tiny" tone="faint">
                    {stepLabel(step)}
                  </Text>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    aria-label="move up"
                    disabled={index === 0}
                    onClick={() =>
                      dispatch(worldActions.moveStep({ docId: target, stepId: step.id, by: -1 }))
                    }
                    style={{ ...btn, opacity: index === 0 ? 0.4 : 1 }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="remove step"
                    onClick={() =>
                      dispatch(worldActions.removeStep({ docId: target, stepId: step.id }))
                    }
                    style={{ ...btn, color: "var(--pbui-danger)" }}
                  >
                    ✕
                  </button>
                </Stack>

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
  const select = (value: string, options: string[], onPick: (v: string) => void, width?: number) => (
    <select
      value={value}
      onChange={(event) => onPick(event.target.value)}
      style={{ ...input, maxWidth: width }}
    >
      {options.length === 0 && <option value="">(no field)</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );

  switch (step.kind) {
    case "filter":
      return (
        <Stack direction="row" gap={2} wrap>
          {select(step.field, fields, (field) => onChange({ ...step, field }))}
          {select(step.op, [...FILTER_OPS], (op) => onChange({ ...step, op: op as typeof step.op }), 60)}
          <input
            value={step.value}
            placeholder="value (blank passes everything)"
            onChange={(event) => onChange({ ...step, value: event.target.value })}
            style={input}
          />
        </Stack>
      );
    case "derive":
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <input
            value={step.name}
            onChange={(event) => onChange({ ...step, name: event.target.value })}
            style={{ ...input, maxWidth: 110 }}
          />
          <Text size="small">=</Text>
          {select(step.a, fields, (a) => onChange({ ...step, a }))}
          {select(step.op, [...DERIVE_OPS], (op) => onChange({ ...step, op: op as typeof step.op }), 70)}
          {step.op !== "log10" && select(step.b, fields, (b) => onChange({ ...step, b }))}
        </Stack>
      );
    case "summarize":
      return (
        <Stack direction="row" gap={2} wrap align="center">
          <Text size="tiny" tone="faint">
            by
          </Text>
          {select(step.by, fields, (by) => onChange({ ...step, by }))}
          {select(step.fn, [...AGGREGATES], (fn) => onChange({ ...step, fn: fn as typeof step.fn }), 90)}
          {step.fn !== "count" && select(step.field, fields, (field) => onChange({ ...step, field }))}
        </Stack>
      );
    case "sort":
      return (
        <Stack direction="row" gap={2} wrap>
          {select(step.field, fields, (field) => onChange({ ...step, field }))}
          {select(step.dir, ["asc", "desc"], (dir) => onChange({ ...step, dir: dir as "asc" | "desc" }), 90)}
        </Stack>
      );
    case "limit":
      return (
        <Stack direction="row" gap={2} align="center">
          <input
            type="number"
            min={1}
            value={step.n}
            onChange={(event) => onChange({ ...step, n: Number(event.target.value) })}
            style={{ ...input, maxWidth: 90 }}
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

const btn: React.CSSProperties = {
  border: "var(--pbui-border-hair)",
  background: "var(--pbui-pane-alt)",
  padding: "0 var(--pbui-space-3)",
  fontSize: "var(--pbui-fs-small)",
  fontWeight: 700,
};

const input: React.CSSProperties = {
  border: "var(--pbui-border-hair)",
  background: "var(--pbui-pane)",
  fontSize: "var(--pbui-fs-small)",
  padding: "0 var(--pbui-space-2)",
};

registerApp({
  id: "pipeline",
  title: "pipeline",
  tone: "var(--pbui-tone-step)",
  docBound: true,
  Component: PipelineApp,
});
