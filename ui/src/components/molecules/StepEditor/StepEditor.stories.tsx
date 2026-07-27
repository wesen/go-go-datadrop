import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { StepEditor } from "./StepEditor";
import { READINGS, readings, step as make } from "../../../fixtures";
import type { Step } from "../../../model/pipeline";

const FIELDS = readings.fields.map((f) => f.name);

/**
 * Controlled: the story owns the step and shows what came back.
 *
 * The editor reports a whole new `Step` rather than a patch, which is the same
 * contract `PipelinePanel` gives it, so the JSON underneath is exactly what
 * would reach `worldActions.updateStep`.
 */
function Controlled({ initial, fields }: { initial: Step; fields: string[] }) {
  const [step, setStep] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <StepEditor step={step} fields={fields} onChange={setStep} />
      <pre style={{ fontSize: "var(--pbui-fs-tiny)", color: "var(--pbui-faint)", margin: 0 }}>
        {JSON.stringify(step)}
      </pre>
    </div>
  );
}

/**
 * One step's controls, switched on its kind.
 *
 * **Five kinds, and that is the point of extracting it.** Until DATADROP-6
 * phase 3 this was a switch buried in a 293-line application, so the only route
 * to a `derive` editor was to add a derive step to a running pipeline, and the
 * only route to the `log10` variant — which hides the right operand because the
 * operator is unary — was to then pick that operator from a select nobody had
 * reason to open.
 *
 * `key` is set from the step id so that switching story re-mounts the
 * controlled state rather than editing the previous story's step.
 */
const meta = {
  title: "Component Library/Molecules/StepEditor",
  component: StepEditor,
  parameters: { tile: true, pbui: false },
  args: {
    fields: FIELDS,
    step: make.filter(READINGS.temp, ">", "20"),
    onChange: () => {},
  },
  render: (args) => <Controlled key={args.step.id} initial={args.step} fields={args.fields} />,
} satisfies Meta<typeof StepEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filter: Story = {};

export const Summarize: Story = {
  args: { step: make.summarize(READINGS.station, "mean", READINGS.temp) },
};

/**
 * `count` needs no column to aggregate, so the third select is absent.
 *
 * One of the five aggregates behaves differently from the other four, the
 * difference is one line in the component, and it was previously unreachable
 * without building the step by hand.
 */
export const SummarizeCount: Story = {
  args: { step: make.summarize(READINGS.station, "count", "") },
};

export const Sort: Story = {
  args: { step: make.sort(READINGS.temp, "desc") },
};

export const Limit: Story = {
  args: { step: make.limit(100) },
};

export const Derive: Story = {
  args: { step: make.derive("ratio", READINGS.temp, "/", READINGS.humidity) },
};

/**
 * `log10` is unary, so the right operand disappears.
 *
 * A control that did nothing would be worse than a missing one — the same
 * argument the encoding panel makes about a log scale on a domain that cannot
 * take one.
 */
export const DeriveLog10: Story = {
  args: { step: make.derive("log_temp", READINGS.temp, "log10", "") },
};

/**
 * No fields available — the state a step lands in when it follows a summarize
 * that dropped every column it names.
 *
 * The select reads "(no field)" rather than rendering empty, because an empty
 * select is indistinguishable from a broken one.
 */
export const NoFieldsAvailable: Story = {
  args: { step: make.filter("", "=", ""), fields: [] },
};
