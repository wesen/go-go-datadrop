import type { Field } from "../model/table";
import type { Step } from "../model/pipeline";
import {
  AGGREGATES,
  DERIVE_OPS,
  FILTER_OPS,
  newStep,
  schemaAfter,
  stepLabel,
} from "../model/pipeline";
import type { Table } from "../model/table";

interface Props {
  table: Table;
  steps: Step[];
  dropped: Record<string, number>;
  onChange: (steps: Step[]) => void;
}

const KINDS: Step["kind"][] = ["filter", "derive", "summarize", "sort", "limit"];

function FieldSelect({
  value,
  fields,
  onChange,
  filter,
}: {
  value: string;
  fields: Field[];
  onChange: (name: string) => void;
  filter?: (field: Field) => boolean;
}) {
  const options = filter ? fields.filter(filter) : fields;
  return (
    <select
      className="form-select form-select-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.length === 0 && <option value="">(no field)</option>}
      {options.map((field) => (
        <option key={field.name} value={field.name}>
          {field.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The step stack.
 *
 * Each editor is offered the schema *as of that step*, so step 3's dropdown
 * lists `mean_mass_g` if step 2 produced it. Offering the source columns
 * everywhere would let a user build a pipeline that cannot run and only find
 * out from the chart's problem list.
 */
export function PipelineEditor({ table, steps, dropped, onChange }: Props) {
  const replace = (index: number, step: Step) => {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  };

  return (
    <div className="card">
      <div className="card-header py-2 d-flex align-items-center justify-content-between">
        <span className="fw-semibold small">Pipeline</span>
        <div className="btn-group btn-group-sm">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn btn-outline-secondary"
              onClick={() =>
                onChange([...steps, newStep(kind, schemaAfter(table, steps))])
              }
            >
              + {kind}
            </button>
          ))}
        </div>
      </div>

      <div className="card-body vstack gap-2 py-2">
        {steps.length === 0 && (
          <div className="text-body-secondary small">
            No steps. The chart is drawn from the table as loaded.
          </div>
        )}

        {steps.map((step, index) => {
          const available = schemaAfter(table, steps, index);
          const quantitative = (field: Field) => field.type === "q";
          const categorical = (field: Field) => field.type !== "q";

          return (
            <div key={step.id} className="border rounded p-2">
              <div className="d-flex align-items-center gap-2 mb-2">
                <input
                  className="form-check-input mt-0"
                  type="checkbox"
                  checked={step.on}
                  title="disable this step without deleting it"
                  onChange={(event) => replace(index, { ...step, on: event.target.checked })}
                />
                <code className="small flex-grow-1">{stepLabel(step)}</code>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary py-0 px-1"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...steps];
                    const previous = next[index - 1]!;
                    next[index - 1] = step;
                    next[index] = previous;
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger py-0 px-1"
                  onClick={() => onChange(steps.filter((s) => s.id !== step.id))}
                >
                  ✕
                </button>
              </div>

              {step.kind === "filter" && (
                <div className="d-flex gap-1">
                  <FieldSelect
                    value={step.field}
                    fields={available}
                    onChange={(field) => replace(index, { ...step, field })}
                  />
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: 70 }}
                    value={step.op}
                    onChange={(event) =>
                      replace(index, { ...step, op: event.target.value as typeof step.op })
                    }
                  >
                    {FILTER_OPS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <input
                    className="form-control form-control-sm"
                    placeholder="value (blank passes everything)"
                    value={step.value}
                    onChange={(event) => replace(index, { ...step, value: event.target.value })}
                  />
                </div>
              )}

              {step.kind === "derive" && (
                <>
                  <div className="d-flex gap-1">
                    <input
                      className="form-control form-control-sm"
                      style={{ maxWidth: 120 }}
                      value={step.name}
                      onChange={(event) => replace(index, { ...step, name: event.target.value })}
                    />
                    <span className="align-self-center small">=</span>
                    <FieldSelect
                      value={step.a}
                      fields={available}
                      filter={quantitative}
                      onChange={(a) => replace(index, { ...step, a })}
                    />
                    <select
                      className="form-select form-select-sm"
                      style={{ maxWidth: 80 }}
                      value={step.op}
                      onChange={(event) =>
                        replace(index, { ...step, op: event.target.value as typeof step.op })
                      }
                    >
                      {DERIVE_OPS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    {step.op !== "log10" && (
                      <FieldSelect
                        value={step.b}
                        fields={available}
                        filter={quantitative}
                        onChange={(b) => replace(index, { ...step, b })}
                      />
                    )}
                  </div>
                  {dropped[step.id] ? (
                    <div className="form-text text-warning-emphasis">
                      removed {dropped[step.id]} rows whose result was not a finite number
                    </div>
                  ) : null}
                </>
              )}

              {step.kind === "summarize" && (
                <>
                  <div className="d-flex gap-1">
                    <FieldSelect
                      value={step.by}
                      fields={available}
                      filter={categorical}
                      onChange={(by) => replace(index, { ...step, by })}
                    />
                    <select
                      className="form-select form-select-sm"
                      style={{ maxWidth: 100 }}
                      value={step.fn}
                      onChange={(event) =>
                        replace(index, { ...step, fn: event.target.value as typeof step.fn })
                      }
                    >
                      {AGGREGATES.map((fn) => (
                        <option key={fn} value={fn}>
                          {fn}
                        </option>
                      ))}
                    </select>
                    {step.fn !== "count" && (
                      <FieldSelect
                        value={step.field}
                        fields={available}
                        filter={quantitative}
                        onChange={(field) => replace(index, { ...step, field })}
                      />
                    )}
                  </div>
                  <div className="form-text">
                    summarize keeps only the group key and the aggregate — every other
                    column is dropped
                  </div>
                </>
              )}

              {step.kind === "sort" && (
                <div className="d-flex gap-1">
                  <FieldSelect
                    value={step.field}
                    fields={available}
                    onChange={(field) => replace(index, { ...step, field })}
                  />
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: 110 }}
                    value={step.dir}
                    onChange={(event) =>
                      replace(index, { ...step, dir: event.target.value as "asc" | "desc" })
                    }
                  >
                    <option value="asc">ascending</option>
                    <option value="desc">descending</option>
                  </select>
                </div>
              )}

              {step.kind === "limit" && (
                <input
                  type="number"
                  min={1}
                  className="form-control form-control-sm"
                  style={{ maxWidth: 120 }}
                  value={step.n}
                  onChange={(event) => replace(index, { ...step, n: Number(event.target.value) })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
