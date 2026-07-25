import { useCallback, useRef, useState } from "react";
import { readToken, useListDropsQuery, useMeQuery } from "../../api/client";
import { registerApp, type AppProps } from "../registry";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { Button, SelectInput, TextInput } from "../../components/atoms";
import { Presentation, usePbui } from "../../pbui";
import {
  canHash,
  digestOf,
  formatBytes,
  HASH_LIMIT,
  newBatch,
  pendingAfterResume,
  phaseOf,
  pooled,
  withItem,
  type Batch,
} from "./upload";

/**
 * Publishing a dataset from the browser.
 *
 * Drives the staged protocol the server already implements (guide §15.3): open
 * a draft, hash, skip the transfer for bytes the server already holds, upload
 * the rest, commit. Nothing is visible to a reader until the commit succeeds.
 *
 * `fetch` rather than RTK Query for the transfers: the payload is a File, the
 * response is discarded, and caching a 400 MB upload would be actively harmful.
 * The three account mutations that DO belong in the cache are in api/client.ts.
 */
function UploadApp(_props: AppProps) {
  const { data: me } = useMeQuery();
  const { data: drops } = useListDropsQuery();
  const pbui = usePbui();

  const [drop, setDrop] = useState("");
  const [dataset, setDataset] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [dragging, setDragging] = useState(false);
  const [drafts, setDrafts] = useState<DraftVersion[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Only drops the caller may write to. Offering the rest would be offering a
  // guaranteed 403 — the same reason `your_role` is on the wire at all.
  const writable = (drops?.drops ?? []).filter(
    (d) => d.your_role === "writer" || d.your_role === "admin",
  );

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = readToken();
    const response = await fetch(`/v1${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(problem?.detail ?? `${response.status} ${response.statusText}`);
    }
    return response;
  }, []);

  const checkDrafts = useCallback(
    async (nextDrop: string, nextDataset: string) => {
      if (!nextDrop || !nextDataset) return;
      try {
        const response = await request(
          `/drops/${encodeURIComponent(nextDrop)}/datasets/${encodeURIComponent(nextDataset)}/drafts`,
        );
        const body = (await response.json()) as { versions: DraftVersion[] };
        setDrafts(body.versions.length ? body.versions : null);
      } catch {
        // A dataset that does not exist yet 404s, which is the ordinary case
        // for a first upload and not worth reporting.
        setDrafts(null);
      }
    },
    [request],
  );

  async function run(resumeVersion?: number, alreadyUploaded: string[] = []) {
    if (!batch) return;
    // A non-nullable local, because TypeScript cannot keep the narrowing from
    // the guard above across the closures below — `current` is reassigned
    // inside them, so it widens back to `Batch | null` at every use.
    let current: Batch = batch;

    try {
      // Opening the draft is a separate step from uploading because everything
      // downstream needs the version number. Folding the two together means
      // discovering at the first PUT that you never had one.
      let version = resumeVersion ?? current.version;
      if (version === null || version === undefined) {
        const response = await request(
          `/drops/${encodeURIComponent(current.drop)}/datasets/${encodeURIComponent(current.dataset)}/versions`,
          { method: "POST" },
        );
        version = ((await response.json()) as { version: number }).version;
      }
      current = { ...current, version, phase: "uploading" };
      setBatch(current);

      // Anything the draft already holds is done before we start.
      const pending = pendingAfterResume(current.items, alreadyUploaded);
      const pendingPaths = new Set(pending.map((item) => item.path));
      for (const item of current.items) {
        if (!pendingPaths.has(item.path)) current = withItem(current, item.path, { state: "done" });
      }
      setBatch({ ...current });

      const settled = version;
      await pooled(
        pending
          .filter((item) => item.state !== "done")
          .map((item) => async () => {
            try {
              current = withItem(current, item.path, { state: "hashing", error: null });
              setBatch({ ...current });

              const digest = await digestOf(item.file);
              current = withItem(current, item.path, { digest, state: "mounting" });
              setBatch({ ...current });

              const query = digest ? `?digest=${encodeURIComponent(digest)}` : "";
              const target =
                `/drops/${encodeURIComponent(current.drop)}` +
                `/datasets/${encodeURIComponent(current.dataset)}` +
                `/versions/${settled}/files/${item.path}${query}`;

              // The mount fast path. If the server already holds these bytes it
              // records the metadata row and we transfer nothing, so
              // re-publishing a 400 MB dataset with one changed file costs the
              // changed file.
              //
              // A 404 here is the ANSWER, not a failure — it means "send the
              // bytes". The browser logs it as a console error regardless,
              // which is worth knowing before someone tries to make it go away
              // by changing the endpoint's status code.
              let mounted = false;
              if (digest) {
                const token = readToken();
                const head = await fetch(`/v1/blobs/${encodeURIComponent(digest)}`, {
                  method: "HEAD",
                  credentials: "same-origin",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (head.ok) {
                  await request(target, { method: "PUT" });
                  mounted = true;
                }
              }

              if (!mounted) {
                current = withItem(current, item.path, { state: "sending" });
                setBatch({ ...current });
                await request(target, { method: "PUT", body: item.file });
              }

              current = withItem(current, item.path, { state: "done", error: null });
            } catch (caught) {
              // A failed file does not fail the batch. `partial` is a state
              // with a retry, not an error banner: one failure in five on a
              // flaky connection is the normal case.
              current = withItem(current, item.path, {
                state: "failed",
                error: caught instanceof Error ? caught.message : String(caught),
              });
            }
            setBatch({ ...current, phase: phaseOf(current.items) });
          }),
      );

      setBatch({ ...current, phase: phaseOf(current.items) });
      setDrafts(null);
    } catch (caught) {
      setBatch({
        ...current,
        phase: "partial",
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  async function commit() {
    if (!batch || batch.version === null) return;
    setBatch({ ...batch, phase: "committing" });
    try {
      await request(
        `/drops/${encodeURIComponent(batch.drop)}/datasets/${encodeURIComponent(batch.dataset)}` +
          `/versions/${batch.version}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A title only. row_count is deliberately not guessed: it is
          // extracted into a column that listings display, and a wrong number
          // there is worse than an absent one.
          body: JSON.stringify({ manifest: { title: batch.dataset } }),
        },
      );
      setBatch({ ...batch, phase: "done" });
    } catch (caught) {
      setBatch({
        ...batch,
        phase: "partial",
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  async function discard(version: number) {
    if (!drop || !dataset) return;
    await request(
      `/drops/${encodeURIComponent(drop)}/datasets/${encodeURIComponent(dataset)}/versions/${version}`,
      { method: "DELETE" },
    ).catch(() => undefined);
    setDrafts(null);
  }

  function pick(files: FileList | null) {
    if (!files?.length || !drop || !dataset) return;
    setBatch(newBatch(`b-${dataset}-${files.length}`, drop, dataset, [...files]));
  }

  if (!me?.authenticated) {
    return (
      <AppBody>
        <Text size="small" tone="faint">
          sign in to publish a dataset
        </Text>
      </AppBody>
    );
  }

  return (
    <AppBody>
      <Stack gap={3}>
        <Stack gap={2}>
          <SectionLabel>Publish a dataset</SectionLabel>
          <Toolbar tight>
            <SelectInput
              label="drop"
              value={drop}
              placeholder="choose a drop…"
              onValueChange={(next) => {
                setDrop(next);
                void checkDrafts(next, dataset);
              }}
              options={writable.map((d) => ({ value: d.name, label: d.name }))}
            />
            <TextInput
              label="dataset name"
              placeholder="readings"
              value={dataset}
              onValueChange={setDataset}
              onBlur={() => void checkDrafts(drop, dataset)}
            />
          </Toolbar>
          {writable.length === 0 && (
            <Text size="tiny" tone="faint">
              you are not a writer on any drop yet
            </Text>
          )}
        </Stack>

        {drafts && (
          <Surface tone="alt" role="status">
            <Stack gap={2}>
              <Text size="small" strong>
                An unfinished upload is waiting
              </Text>
              {drafts.map((draft) => (
                <Toolbar key={draft.version} tight>
                  <Text size="small">
                    version {draft.version} · {draft.file_count} files ·{" "}
                    {formatBytes(draft.total_bytes)}
                  </Text>
                  <Button
                    size="tiny"
                    disabled={!batch}
                    title={batch ? undefined : "choose the files again first"}
                    onClick={() =>
                      void run(
                        draft.version,
                        (draft.files ?? []).map((file) => file.path),
                      )
                    }
                  >
                    resume
                  </Button>
                  <Button size="tiny" onClick={() => void discard(draft.version)}>
                    discard
                  </Button>
                </Toolbar>
              ))}
              <Text size="tiny" tone="faint" prose>
                A draft holds its bytes but is invisible to readers. Discarding
                it releases them for the next garbage-collection sweep.
              </Text>
            </Stack>
          </Surface>
        )}

        {/* An explicit button as well as the drop surface.
            A drop target alone assumes a mouse, a window arrangement that lets
            you see both the file manager and the browser, and the knowledge
            that the surface is droppable at all. The button assumes none of
            those, and it is what a keyboard reaches. */}
        <Toolbar tight>
          <Button
            disabled={!drop || !dataset}
            onClick={() => fileInput.current?.click()}
            data-testid="choose-files"
          >
            Choose CSV files…
          </Button>
          <Text size="tiny" tone="faint">
            or drop them below
          </Text>
        </Toolbar>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          style={{
            border: dragging ? "var(--pbui-border-firm)" : "var(--pbui-border-hair)",
            background: dragging ? "var(--pbui-selected)" : "var(--pbui-pane-alt)",
            padding: "var(--pbui-space-4)",
            textAlign: "center",
            cursor: drop && dataset ? "pointer" : "not-allowed",
          }}
          data-testid="drop-zone"
        >
          <Text size="small" tone={drop && dataset ? undefined : "faint"}>
            {drop && dataset
              ? "drop files here, or click to choose"
              : "choose a drop and name the dataset first"}
          </Text>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            aria-label="files to upload"
            // CSV first, because that is what the table projection reads and
            // what a chart can be made of — but not exclusively: a dataset is
            // a body of files with a manifest, and a README beside the data is
            // ordinary rather than exceptional.
            accept=".csv,text/csv,.tsv,.json,.ndjson,.md,.txt"
            onChange={(event) => pick(event.target.files)}
          />
        </div>

        {!canHash() && (
          // The secure-context boundary, surfaced where it has a consequence
          // rather than left to fail as a TypeError deep in the uploader.
          <Text size="tiny" tone="faint" prose>
            This page is not a secure context, so the browser cannot compute
            digests. Files will be uploaded in full and the server will hash them
            as it writes.
          </Text>
        )}

        {batch && (
          <Stack gap={2}>
            <Toolbar tight>
              <SectionLabel>
                {batch.dataset} · {batch.phase}
                {batch.version !== null ? ` · version ${batch.version}` : ""}
              </SectionLabel>
              {batch.phase === "picked" && (
                <Button onClick={() => void run()} data-testid="upload">
                  Upload {batch.items.length} files
                </Button>
              )}
              {batch.phase === "ready" && (
                <Button onClick={() => void commit()} data-testid="commit">
                  Commit
                </Button>
              )}
              {batch.phase === "partial" && (
                <Button onClick={() => void run(batch.version ?? undefined)}>
                  Retry failed
                </Button>
              )}
            </Toolbar>

            {batch.error && (
              <Text size="small" tone="danger">
                {batch.error}
              </Text>
            )}

            {batch.items.map((item) => (
              <Presentation
                key={item.path}
                ptype="upload"
                value={{
                  batchId: item.batchId,
                  path: item.path,
                  size: item.size,
                  digest: item.digest,
                  state: item.state,
                  error: item.error,
                }}
                doc={`<upload> ${item.path} · ${item.state}`}
              >
                <span style={{ fontSize: "var(--pbui-fs-small)" }}>
                  {item.state === "done" ? "✓" : item.state === "failed" ? "✕" : "·"} {item.path}{" "}
                  <span style={{ color: "var(--pbui-faint)" }}>
                    {formatBytes(item.size)} · {item.state}
                    {item.error ? ` — ${item.error}` : ""}
                  </span>
                </span>
              </Presentation>
            ))}

            {batch.phase === "done" && (
              <Surface tone="alt" role="status">
                <Stack gap={2}>
                  <Text size="small" strong>
                    Published — version {batch.version}
                  </Text>
                  <Toolbar tight>
                    <Button
                      onClick={() =>
                        pbui.perform({
                          kind: "newDoc",
                          source: {
                            kind: "dataset",
                            drop: batch.drop,
                            dataset: batch.dataset,
                            ...(batch.version !== null ? { version: batch.version } : {}),
                            ...(batch.items[0] ? { path: batch.items[0].path } : {}),
                          },
                        })
                      }
                    >
                      Open in a chart
                    </Button>
                  </Toolbar>
                </Stack>
              </Surface>
            )}
          </Stack>
        )}

        <Text size="tiny" tone="faint" prose>
          Files are hashed here first, up to {formatBytes(HASH_LIMIT)}, so bytes
          the server already holds are never sent twice. Nothing is visible to a
          reader until you commit.
        </Text>
      </Stack>
    </AppBody>
  );
}

interface DraftVersion {
  version: number;
  file_count: number;
  total_bytes: number;
  files?: Array<{ path: string }>;
}

registerApp({
  id: "upload",
  title: "upload",
  tone: "var(--pbui-tone-datum)",
  docBound: false,
  Component: UploadApp,
});
