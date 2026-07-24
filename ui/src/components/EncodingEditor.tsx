import type { ChartSpec, Channel, Geom } from "../model/chart";
import { CHANNELS, CHANNEL_ACCEPTS, GEOMS } from "../model/chart";
import type { Field, FieldType } from "../model/table";
import { TYPE_LABEL, TYPE_SOURCE_LABEL } from "../model/table";

interface Props {
  fields: Field[];
  spec: ChartSpec;
  /** True when the pipeline output has at least one non-positive y value. */
  logUnavailable: boolean;
  onChange: (spec: ChartSpec) => void;
}

const TYPE_BADGE: Record<FieldType, string> = {
  q: "text-bg-primary",
  n: "text-bg-warning",
  t: "text-bg-success",
};

/**
 * Geom, channels, and the y scale.
 *
 * A channel offers only the fields whose type it can accept, so an impossible
 * selection is never presented rather than being presented and then refused.
 */
export function EncodingEditor({ fields, spec, logUnavailable, onChange }: Props) {
  const setMapping = (channel: Channel, name: string) =>
    onChange({ ...spec, mapping: { ...spec.mapping, [channel]: name || null } });

  return (
    <div className="card">
      <div className="card-header py-2 fw-semibold small">Encoding</div>
      <div className="card-body vstack gap-2 py-2">
        <div>
          <label className="form-label small mb-1">geom</label>
          <div className="btn-group btn-group-sm w-100" role="group">
            {GEOMS.map((geom) => (
              <button
                key={geom}
                type="button"
                className={`btn btn-outline-secondary ${spec.geom === geom ? "active" : ""}`}
                onClick={() => onChange({ ...spec, geom: geom as Geom })}
              >
                {geom}
              </button>
            ))}
          </div>
        </div>

        {CHANNELS.map((channel) => {
          const accepts = CHANNEL_ACCEPTS[channel];
          const options = fields.filter((field) => accepts.includes(field.type));
          return (
            <div key={channel}>
              <label className="form-label small mb-1">
                {channel}
                <span className="text-body-secondary">
                  {" "}
                  · {accepts.map((t) => TYPE_LABEL[t]).join(" / ")}
                </span>
              </label>
              <select
                className="form-select form-select-sm"
                value={spec.mapping[channel] ?? ""}
                onChange={(event) => setMapping(channel, event.target.value)}
              >
                <option value="">(none)</option>
                {options.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        <div>
          <label className="form-label small mb-1">y scale</label>
          <div className="btn-group btn-group-sm w-100" role="group">
            {(["linear", "log"] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                disabled={scale === "log" && logUnavailable}
                title={
                  scale === "log" && logUnavailable
                    ? "a log scale needs a strictly positive y domain"
                    : undefined
                }
                className={`btn btn-outline-secondary ${spec.yScale === scale ? "active" : ""}`}
                onClick={() => onChange({ ...spec, yScale: scale })}
              >
                {scale}
              </button>
            ))}
          </div>
        </div>

        <details>
          <summary className="small text-body-secondary">fields ({fields.length})</summary>
          <div className="vstack gap-1 mt-2">
            {fields.map((field) => (
              <div key={field.name} className="d-flex align-items-center gap-2 small">
                <span className={`badge ${TYPE_BADGE[field.type]}`} style={{ width: 20 }}>
                  {field.type}
                </span>
                <code className="flex-grow-1 text-truncate" title={field.name}>
                  {field.name}
                </code>
                <span
                  className="text-body-secondary"
                  title={TYPE_SOURCE_LABEL[field.inferred_from]}
                >
                  {field.inferred_from}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
