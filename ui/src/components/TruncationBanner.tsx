import type { Table } from "../model/table";

/**
 * The truncation notice.
 *
 * Not dismissible, deliberately. A user who dismisses it and then screenshots
 * the chart has produced a misleading artifact, and the whole point of
 * reporting truncation is that the picture should never look complete when it
 * is not.
 *
 * "at least" is also deliberate: a streaming reader that stops at the cap does
 * not know the total, and claiming a number you did not count is worse than
 * saying you did not count it.
 */
export function TruncationBanner({ table }: { table: Table }) {
  if (!table.truncated) return null;

  const which =
    table.strategy === "latest"
      ? "the most recent"
      : "the first";

  return (
    <div className="alert alert-warning py-2 mb-2" role="alert">
      <strong>This chart describes a sample, not the whole source.</strong> Showing{" "}
      {which} {table.row_count.toLocaleString()} of at least{" "}
      {table.row_count.toLocaleString()} rows (strategy: <code>{table.strategy}</code>).
      Narrow the source with a time range or a smaller file, or raise the row limit.
    </div>
  );
}
