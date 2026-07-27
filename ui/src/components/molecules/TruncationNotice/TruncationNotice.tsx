import { SourceChip } from "../../atoms";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import type { Table } from "../../../model/table";

/**
 * The truncation notice.
 *
 * Not dismissible, deliberately: a user who dismisses it and screenshots the
 * chart has produced a misleading artifact, and the whole point of reporting
 * truncation is that the picture must never look complete when it is not.
 *
 * "at least N+1", NOT "at least N". When a table is truncated the server has
 * proved a further row exists — it asks for `limit + 1` and discards the extra.
 * TruncationBanner.tsx printed row_count twice and therefore rendered "showing
 * the most recent 2,000 of at least 2,000 rows", a sentence asserting the sample
 * IS the whole source inside the banner whose only job is to deny that.
 *
 * The source is presented, so *raise the row budget* is reachable from where the
 * advice is read. Advice you cannot act on where you read it is worse than none.
 */
export function TruncationNotice({ table }: { table: Table }) {
  if (!table.truncated) return null;

  const which = table.strategy === "latest" ? "the most recent" : "the first";

  return (
    <div
      role="status"
      data-state="truncated"
      style={{
        border: "var(--pbui-border-hair)",
        borderLeft: "var(--pbui-tone-edge) solid var(--pbui-danger)",
        background: "var(--pbui-pane-alt)",
        padding: "var(--pbui-space-2) var(--pbui-space-3)",
      }}
    >
      <Stack direction="row" gap={3} align="center" wrap>
        <Text size="small" strong>
          This chart describes a sample, not the whole source.
        </Text>
        <Text size="small">
          Showing {which} {table.row_count.toLocaleString()} of at least{" "}
          {(table.row_count + 1).toLocaleString()} rows.
        </Text>
        <SourceChip source={table.source} />
        <Text size="tiny" tone="faint">
          right-click to raise the row budget, or narrow the source
        </Text>
      </Stack>
    </div>
  );
}
