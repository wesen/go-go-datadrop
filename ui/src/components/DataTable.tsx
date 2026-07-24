import type { Field, Row } from "../model/table";
import { asText } from "../model/table";

interface Props {
  fields: Field[];
  rows: Row[];
  /** How many rows to render. The DOM, not the data, is the constraint here. */
  limit?: number;
}

export function DataTable({ fields, rows, limit = 200 }: Props) {
  const shown = rows.slice(0, limit);

  return (
    <div>
      <div className="table-responsive" style={{ maxHeight: 320 }}>
        <table className="table table-sm table-striped table-hover font-monospace small mb-0">
          <thead className="sticky-top bg-body">
            <tr>
              {fields.map((field) => (
                <th key={field.name} scope="col" className="text-nowrap">
                  {field.name}
                  <span className="text-body-secondary fw-normal"> ·{field.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index}>
                {fields.map((field) => (
                  <td key={field.name} className="text-nowrap">
                    {asText(row[field.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="small text-body-secondary mt-1">
          showing {shown.length} of {rows.length} pipeline rows — the chart uses all of them
        </div>
      )}
    </div>
  );
}
