import { Presentation } from "../../pbui";
import { asText } from "../../model/table";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import { AppBody } from "../../components/layout";
import { Text } from "../../components/foundation";
import { DocBar } from "../../components/molecules/DocBar";
import { FieldChip } from "../../components/atoms";
import styles from "./TableApp.module.css";

/** How many rows reach the DOM. The DOM, not the data, is the constraint. */
const RENDER_LIMIT = 200;

/**
 * The pipeline's output relation.
 *
 * Headers are `<field>` presentations and row numbers are `<datum>`
 * presentations, so right-clicking a row number offers the same *keep only* /
 * *exclude* verbs as right-clicking a mark in the chart. That equivalence is
 * the point: it is the same presentation type, so it has the same verbs.
 */
function TableApp({ leafId, docId }: AppProps) {
  const { doc, pipeline, loading } = useDocPipeline(docId);

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <AppBody flush>
        {!pipeline ? (
          <div style={{ padding: "var(--pbui-space-4)" }}>
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
                      <FieldChip field={{ docId: doc?.id ?? null, name: field.name }} />
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
                        value={{ docId: doc?.id ?? null, row }}
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
              <div style={{ padding: "var(--pbui-space-3)" }}>
                <Text size="tiny" tone="faint">
                  showing {RENDER_LIMIT} of {pipeline.rows.length.toLocaleString()} pipeline rows —
                  the chart uses all of them
                </Text>
              </div>
            )}
          </>
        )}
      </AppBody>
    </>
  );
}

registerApp({
  id: "table",
  title: "table",
  tone: "var(--pbui-tone-source)",
  docBound: true,
  Component: TableApp,
});
