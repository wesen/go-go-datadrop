import type { ReactNode } from "react";
import { Stack, Toolbar } from "../../layout";
import { SectionLabel } from "../../foundation";
import { UploadItemRow } from "../UploadItemRow";
import type { UploadItemView } from "../UploadItemRow";
import { EmptyState } from "../EmptyState";

/**
 * A batch, mid-flight, with whatever action its phase allows.
 *
 * The phase-to-action mapping is the caller's, passed as `actions`, because
 * each action is a call into the uploader's protocol driver — open a draft,
 * retry the failures, commit — and a molecule that knew about those would be an
 * organism with a fetch in it.
 *
 * `renderItem` is the DR-38 seam: UploadApp wraps each row in a `Presentation`
 * so an upload is right-clickable, and this component renders a plain row by
 * default so its story needs no provider.
 */
export function UploadQueueList({
  dataset,
  phase,
  version,
  items,
  actions,
  renderItem,
}: {
  dataset: string;
  phase: string;
  version: number | null;
  items: readonly UploadItemView[];
  actions?: ReactNode;
  renderItem?: (item: UploadItemView, body: ReactNode) => ReactNode;
}) {
  return (
    <Stack gap={2} data-part="upload-queue">
      <Toolbar tight>
        <SectionLabel>
          {dataset} · {phase}
          {version !== null ? ` · version ${version}` : ""}
        </SectionLabel>
        {actions}
      </Toolbar>

      {items.length === 0 ? (
        <EmptyState message="no files in this batch" />
      ) : (
        items.map((item) => {
          const body = <UploadItemRow item={item} />;
          return <span key={item.path}>{renderItem ? renderItem(item, body) : body}</span>;
        })
      )}
    </Stack>
  );
}
