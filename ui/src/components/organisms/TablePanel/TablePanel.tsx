import { Presentation } from "../../../pbui";
import { asText } from "../../../model/table";
import type { PipelineResult } from "../../../model/pipeline";
import { AppBody } from "../../layout";
import { Text } from "../../foundation";
import { FieldChip } from "../../atoms";
import styles from "./TablePanel.module.css";

/** How many rows reach the DOM. The DOM, not the data, is the constraint. */
export const RENDER_LIMIT = 200;

/**
 * The pipeline's output relation.
 *
 * Headers are `<field>` presentations and row numbers are `<datum>`
 * presentations, so right-clicking a row number offers the same *keep only* /
 * *exclude* verbs as right-clicking a mark in the chart. That equivalence is
 * the point: it is the same presentation type, so it has the same verbs.
 *
 * Wraps its own cells in `Presentation`, for the reason `ChartPanel` does: a
 * table of two hundred rows cannot take a render prop per cell, and a header
 * that is not a live field is not what this table is for. Its stories rely on
 * the global `withPbui` decorator.
 *
 * The row cap is on rendering, never on the data. The footer says so, because
 * "showing 200 of 4 812" and "the chart is drawing 200 points" are very
 * different claims and only the first one is true.
 */
export function TablePanel({
  pipeline,
  docId,
  loading = false,
}: {
  /** Null when there is no source, or while the first table is loading. */
  pipeline: PipelineResult | null;
  docId: string | null;
  loading?: boolean;
}) {
  return (
    <AppBody flush>
      {!pipeline ? (
        <div className={styles.notice}>
          <Text size="small" tone="faint">
            {loading ? "loading…" : "no source — load one from the sources tile"}
          </Text>
        </div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.num}>№</th>
                {pipeline.fields.map((field) => (
                  <th key={field.name}>
                    <FieldChip field={{ docId, name: field.name }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pipeline.rows.slice(0, RENDER_LIMIT).map((row, index) => (
                <tr key={index}>
                  <td className={styles.num}>
                    <Presentation
                      ptype="datum"
                      value={{ docId, row }}
                      doc={`<datum> row ${index + 1}`}
                    >
                      <span className={styles.rowNumber}>{index + 1}</span>
                    </Presentation>
                  </td>
                  {pipeline.fields.map((field) => (
                    <td
                      key={field.name}
                      className={field.type === "q" ? styles.numeric : undefined}
                    >
                      {asText(row[field.name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pipeline.rows.length > RENDER_LIMIT && (
            <div className={styles.notice}>
              <Text size="tiny" tone="faint">
                showing {RENDER_LIMIT} of {pipeline.rows.length.toLocaleString()} pipeline rows —
                the chart uses all of them
              </Text>
            </div>
          )}
          {pipeline.rows.length === 0 && (
            <div className={styles.notice}>
              <Text size="small" tone="faint">
                the pipeline produced no rows — a filter may be too narrow
              </Text>
            </div>
          )}
        </>
      )}
    </AppBody>
  );
}
