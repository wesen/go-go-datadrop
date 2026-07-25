import { AppBody, Stack, Toolbar } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { Button, SelectInput, SourceChip, TextInput } from "../../atoms";
import { EmptyState, ErrorNotice } from "../../molecules";
import type { SourceRef } from "../../../model/table";

export interface DropOption {
  name: string;
  public_read: boolean;
}

/** Row budgets a caller can choose between. */
export const BUDGETS = [500, 2000, 10000, 50000] as const;

/**
 * The source browser: drops, then their streams and dataset files.
 *
 * Every stream and every file is a `<source>` presentation, so loading one is a
 * left-click and raising the row budget is a menu verb on the same object. The
 * chips wrap themselves — that is what `SourceChip` is — so this panel passes
 * refs rather than rendering names.
 *
 * The row budget is *not* the pipeline's `limit` step and the panel says so
 * where the buttons are. One controls how much of the source is fetched; the
 * other controls how many rows survive the transform. Confusing them produces a
 * chart that is wrong in a way neither number explains.
 */
export function SourcePanel({
  token,
  drops,
  chosenDrop,
  streams,
  datasets,
  chosenDataset,
  files,
  latestVersion,
  limit,
  error,
  onTokenChange,
  onDropChange,
  onDatasetChange,
  onLimitChange,
}: {
  token: string;
  drops: readonly DropOption[];
  chosenDrop: string;
  streams: readonly string[];
  datasets: readonly string[];
  chosenDataset: string;
  files: readonly string[];
  /** Null when the dataset has no committed version yet. */
  latestVersion: number | null;
  limit: number;
  /** Set when listing drops failed — almost always a missing credential. */
  error?: boolean;
  onTokenChange(next: string): void;
  onDropChange(next: string): void;
  onDatasetChange(next: string): void;
  onLimitChange(next: number): void;
}) {
  const source = (over: Partial<SourceRef>): SourceRef =>
    ({ kind: "stream", drop: chosenDrop, ...over }) as SourceRef;

  return (
    <>
      <Toolbar tight bordered>
        <SectionLabel>Token</SectionLabel>
        <TextInput
          type="password"
          label="bearer token"
          placeholder="bearer token (public-read drops need none)"
          value={token}
          width="fill"
          size="tiny"
          onValueChange={onTokenChange}
        />
      </Toolbar>

      <AppBody>
        <Stack gap={4}>
          {error && (
            <ErrorNotice message="Could not list drops. If this server requires a token, enter one above." />
          )}

          <Stack gap={2}>
            <SectionLabel>Drop</SectionLabel>
            {drops.length === 0 && !error ? (
              <EmptyState
                message="no drops here yet"
                hint="Create one with `datadrop create`, or sign in if this server has private drops."
              />
            ) : (
              <SelectInput
                label="drop"
                variant="framed"
                value={chosenDrop}
                onValueChange={onDropChange}
                options={drops.map((d) => ({
                  value: d.name,
                  label: d.public_read ? `${d.name} (public)` : d.name,
                }))}
              />
            )}
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Row budget — how much of the source is loaded</SectionLabel>
            <Stack direction="row" gap={2} wrap align="center">
              {BUDGETS.map((option) => (
                <Button
                  key={option}
                  variant="framed"
                  selected={limit === option}
                  onClick={() => onLimitChange(option)}
                >
                  {option.toLocaleString()}
                </Button>
              ))}
              <Text size="tiny" tone="faint">
                the pipeline's `limit` step is a different thing
              </Text>
            </Stack>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Streams</SectionLabel>
            <Stack direction="row" gap={2} wrap>
              {streams.map((stream) => (
                <SourceChip key={stream} source={source({ kind: "stream", stream })} />
              ))}
              {streams.length === 0 && <EmptyState message="no streams in this drop" />}
            </Stack>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Datasets</SectionLabel>
            {datasets.length === 0 ? (
              <EmptyState message="no datasets in this drop" />
            ) : (
              <SelectInput
                label="dataset"
                variant="framed"
                value={chosenDataset}
                onValueChange={onDatasetChange}
                options={datasets.map((d) => ({ value: d, label: d }))}
              />
            )}
            <Stack direction="row" gap={2} wrap>
              {files.map((path) => (
                <SourceChip
                  key={path}
                  source={source({
                    kind: "dataset",
                    dataset: chosenDataset,
                    version: latestVersion ?? 1,
                    path,
                  })}
                />
              ))}
              {latestVersion !== null && files.length === 0 && (
                <EmptyState message={`no files in version ${latestVersion}`} />
              )}
            </Stack>
          </Stack>
        </Stack>
      </AppBody>
    </>
  );
}
