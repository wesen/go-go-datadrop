import { Stack, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { Button } from "../../atoms";
import { Callout } from "../Callout";
import { formatBytes } from "../../../model/format";

export interface DraftSummary {
  version: number;
  file_count: number;
  total_bytes: number;
}

/**
 * An upload that was interrupted, and is still holding its bytes.
 *
 * This component exists because of a defect the design analysis predicted from
 * reading the server and the uploader then confirmed exactly: dataset version
 * listings are committed-only, so an interrupted upload is invisible to the
 * API. The version number is lost on reload, the draft cannot be found, and its
 * blob references keep garbage collection from reclaiming the bytes — so an
 * abandoned 400 MB upload costs 400 MB forever and nothing in the interface
 * admits it exists.
 *
 * `GET /v1/drops/{d}/datasets/{ds}/drafts` is the endpoint added to fix that,
 * and this is what it is for. "Discard" is therefore not a tidiness affordance;
 * it is the only way to release the bytes.
 */
export function DraftResumeList({
  drafts,
  onResume,
  onDiscard,
  resumeDisabledReason,
}: {
  drafts: readonly DraftSummary[];
  onResume(version: number): void;
  onDiscard(version: number): void;
  /** Resuming needs the files again; say so rather than greying a button. */
  resumeDisabledReason?: string;
}) {
  if (drafts.length === 0) return null;

  return (
    <Callout variant="warning" title="An unfinished upload is waiting">
      <Stack gap={2}>
        {drafts.map((draft) => (
          <Toolbar key={draft.version} tight>
            <Text size="small">
              version {draft.version} · {draft.file_count} files ·{" "}
              {formatBytes(draft.total_bytes)}
            </Text>
            <Button
              size="tiny"
              disabled={resumeDisabledReason !== undefined}
              title={resumeDisabledReason}
              onClick={() => onResume(draft.version)}
            >
              resume
            </Button>
            <Button size="tiny" tone="danger" onClick={() => onDiscard(draft.version)}>
              discard
            </Button>
          </Toolbar>
        ))}
        <Text size="tiny" tone="faint" prose>
          A draft holds its bytes but is invisible to readers. Discarding it
          releases them for the next garbage-collection sweep.
        </Text>
      </Stack>
    </Callout>
  );
}
