import type { ReactNode } from "react";
import { AppBody, Stack, Toolbar } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { Button, SelectInput, TextInput } from "../../atoms";
import {
  Callout,
  DraftResumeList,
  FileDropZone,
  UploadQueueList,
} from "../../molecules";
import type { DraftSummary, UploadItemView } from "../../molecules";
import { formatBytes } from "../../../model/format";

export interface UploadTarget {
  drop: string;
  dataset: string;
}

export interface UploadBatchView {
  drop: string;
  dataset: string;
  version: number | null;
  phase: "picked" | "uploading" | "ready" | "partial" | "done";
  items: readonly UploadItemView[];
  error: string | null;
}

/**
 * Publishing a dataset, as a screen.
 *
 * The staged protocol behind it — open a draft, hash, skip the bytes the server
 * already holds, upload the rest, commit — lives in the container and in
 * `apps/UploadApp/upload.ts`, which is a pure state machine with its own tests
 * and no DOM. This panel renders whatever phase that machine reports and calls
 * back; it performs no request itself, which is why every phase below is a
 * story rather than a server configuration.
 */
export function UploadPanel({
  target,
  writableDrops,
  batch,
  drafts,
  canHash,
  hashLimit,
  onTargetChange,
  onFiles,
  onRun,
  onCommit,
  onRetry,
  onResumeDraft,
  onDiscardDraft,
  onOpenInChart,
  renderItem,
}: {
  target: UploadTarget;
  writableDrops: readonly string[];
  batch: UploadBatchView | null;
  drafts: readonly DraftSummary[] | null;
  /** False outside a secure context: Web Crypto is unavailable. */
  canHash: boolean;
  hashLimit: number;
  onTargetChange(next: UploadTarget): void;
  onFiles(files: FileList): void;
  onRun(): void;
  onCommit(): void;
  onRetry(): void;
  onResumeDraft(version: number): void;
  onDiscardDraft(version: number): void;
  onOpenInChart(): void;
  renderItem?: (item: UploadItemView, body: ReactNode) => ReactNode;
}) {
  const ready = Boolean(target.drop && target.dataset);

  return (
    <AppBody>
      <Stack gap={3}>
        <Stack gap={2}>
          <SectionLabel>Publish a dataset</SectionLabel>
          <Toolbar tight>
            <SelectInput
              label="drop"
              value={target.drop}
              placeholder="choose a drop…"
              options={writableDrops.map((drop) => ({ value: drop, label: drop }))}
              onValueChange={(drop) => onTargetChange({ ...target, drop })}
            />
            <TextInput
              label="dataset name"
              placeholder="readings"
              value={target.dataset}
              onValueChange={(dataset) => onTargetChange({ ...target, dataset })}
            />
          </Toolbar>
          {/* Only drops the caller may write to are offered. Listing the rest
              would be offering a guaranteed 403 — the same reason `your_role`
              is on the wire at all. */}
          {writableDrops.length === 0 && (
            <Text size="tiny" tone="faint">
              you are not a writer on any drop yet
            </Text>
          )}
        </Stack>

        {drafts && drafts.length > 0 && (
          <DraftResumeList
            drafts={drafts}
            resumeDisabledReason={batch ? undefined : "choose the files again first"}
            onResume={onResumeDraft}
            onDiscard={onDiscardDraft}
          />
        )}

        <FileDropZone
          disabled={!ready}
          disabledReason="choose a drop and name the dataset first"
          buttonLabel="Choose CSV files…"
          // CSV first, because that is what the table projection reads and what
          // a chart can be made of — but not exclusively: a dataset is a body of
          // files with a manifest, and a README beside the data is ordinary.
          accept=".csv,text/csv,.tsv,.json,.ndjson,.md,.txt"
          onFiles={onFiles}
        />

        {!canHash && (
          // The secure-context boundary, surfaced where it has a consequence
          // rather than left to fail as a TypeError deep in the uploader.
          <Callout variant="warning">
            <Text size="small" prose>
              This page is not a secure context, so the browser cannot compute
              digests. Files will be uploaded in full and the server will hash
              them as it writes.
            </Text>
          </Callout>
        )}

        {batch && (
          <Stack gap={2}>
            <UploadQueueList
              dataset={batch.dataset}
              phase={batch.phase}
              version={batch.version}
              items={batch.items}
              renderItem={renderItem}
              actions={
                <>
                  {batch.phase === "picked" && (
                    <Button onClick={onRun} data-testid="upload">
                      Upload {batch.items.length} files
                    </Button>
                  )}
                  {batch.phase === "ready" && (
                    <Button onClick={onCommit} data-testid="commit">
                      Commit
                    </Button>
                  )}
                  {batch.phase === "partial" && <Button onClick={onRetry}>Retry failed</Button>}
                </>
              }
            />

            {batch.error && (
              <Text size="small" tone="danger">
                {batch.error}
              </Text>
            )}

            {batch.phase === "done" && (
              <Callout
                variant="ok"
                title={`Published — version ${batch.version}`}
                actions={<Button onClick={onOpenInChart}>Open in a chart</Button>}
              >
                <Text size="small">Readers can see it now.</Text>
              </Callout>
            )}
          </Stack>
        )}

        <Text size="tiny" tone="faint" prose>
          Files are hashed here first, up to {formatBytes(hashLimit)}, so bytes
          the server already holds are never sent twice. Nothing is visible to a
          reader until you commit.
        </Text>
      </Stack>
    </AppBody>
  );
}
