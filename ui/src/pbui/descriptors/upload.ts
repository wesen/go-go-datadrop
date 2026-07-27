import type { PresentationDescriptor } from "../registry";
import type { UploadRef } from "../types";
import type { Action } from "../verbs";

/** `<upload>` — one file in an upload batch. */
export const uploadDescriptor: PresentationDescriptor<UploadRef> = {
  ptype: "upload",
  // --pbui-tone-datum has never existed. This said so from DATADROP-5 until
  // DATADROP-11's descriptor-coverage test found it, and every upload chip
  // rendered with no tone at all in the meantime -- var() with no fallback and
  // no declaration resolves to nothing, silently. `datum` itself is neutral,
  // which is plainly what was meant.
  tone: "var(--pbui-tone-neutral)",

  label: (upload) => `${upload.path} · ${upload.state}`,

  describe: (upload) => ({
    presentationType: "upload",
    path: upload.path,
    bytes: upload.size,
    // A null digest is not a failure: files above the hashing threshold are
    // uploaded whole and the server hashes while it writes. Saying so here
    // stops it reading as a bug (DR-30).
    digest: upload.digest ?? "not computed — the server will hash while writing",
    state: upload.state,
    error: upload.error,
  }),

  actions: (upload): Action[] => [
    {
      label: "Retry",
      verb: { kind: "retryUpload", batchId: upload.batchId, path: upload.path },
      disabledBecause:
        upload.state === "done"
          ? "already uploaded"
          : upload.state === "failed"
            ? undefined
            : "still in progress",
    },
    { label: "Inspect", verb: { kind: "inspect", ptype: "upload", value: upload } },
  ],
};
