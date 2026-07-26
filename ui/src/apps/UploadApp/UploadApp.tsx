import { useCallback, useState } from "react";
import { readToken, useListDropsQuery, useMeQuery } from "../../api/client";
import { registerApp, type AppProps } from "../../appkit/registry";
import { AppBody } from "../../components/layout";
import { Text } from "../../components/foundation";
import { UploadPanel } from "../../components/organisms";
import type { UploadBatchView } from "../../components/organisms";
import { Presentation, usePbui } from "../../pbui";
import {
  canHash,
  digestOf,
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
  const [drafts, setDrafts] = useState<DraftVersion[] | null>(null);

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
    <UploadPanel
      target={{ drop, dataset }}
      writableDrops={writable.map((d) => d.name)}
      batch={
        batch && {
          drop: batch.drop,
          dataset: batch.dataset,
          version: batch.version,
          phase: batch.phase as UploadBatchView["phase"],
          items: batch.items,
          error: batch.error,
        }
      }
      drafts={drafts}
      canHash={canHash()}
      hashLimit={HASH_LIMIT}
      onTargetChange={(next) => {
        setDrop(next.drop);
        setDataset(next.dataset);
        if (next.drop !== drop) setDrafts(null);
        if (next.dataset !== dataset) void checkDrafts(next.drop, next.dataset);
      }}
      onFiles={pick}
      onRun={() => void run()}
      onCommit={() => void commit()}
      onRetry={() => void run(batch?.version ?? undefined)}
      onResumeDraft={(version) => {
        const draft = drafts?.find((d) => d.version === version);
        void run(
          version,
          (draft?.files ?? []).map((file) => file.path),
        );
      }}
      onDiscardDraft={(version) => void discard(version)}
      onOpenInChart={() =>
        batch &&
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
      // The DR-38 seam: the panel draws a plain row, and the application makes
      // each one a live presentation so an upload can be right-clicked.
      renderItem={(item, body) => (
        <Presentation
          ptype="upload"
          value={{
            batchId: batch?.drop ?? "",
            path: item.path,
            size: item.size,
            digest: item.digest,
            state: item.state,
            error: item.error,
          }}
          doc={`<upload> ${item.path} · ${item.state}`}
        >
          {body}
        </Presentation>
      )}
    />
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
  duplicable: false,
  singleton: true,
  Component: UploadApp,
});
