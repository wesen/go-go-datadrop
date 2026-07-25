import type { UploadState } from "../../../pbui";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { StateGlyph } from "../../atoms";
import { formatBytes } from "../../../model/format";

export interface UploadItemView {
  path: string;
  size: number;
  state: UploadState;
  digest: string | null;
  error: string | null;
}

/**
 * One file, mid-flight.
 *
 * The state used to be a faint grey word. It is now a glyph plus that word, so
 * the column reads down the left edge and survives greyscale — which is the
 * rule `Chip.module.css` states and this row was quietly breaking.
 *
 * Does not wrap itself in `Presentation` (DR-38). `UploadQueueList` does that,
 * so this row renders in a story with no provider and no server.
 */
export function UploadItemRow({ item }: { item: UploadItemView }) {
  return (
    <Stack direction="row" gap={2} align="baseline" data-part="upload-item">
      <StateGlyph state={item.state} label={item.state} />
      <Text size="small" truncate title={item.path}>
        {item.path}
      </Text>
      <Text size="tiny" tone="faint">
        {formatBytes(item.size)} · {item.state}
      </Text>
      {item.error && (
        <Text size="tiny" tone="danger">
          — {item.error}
        </Text>
      )}
    </Stack>
  );
}
