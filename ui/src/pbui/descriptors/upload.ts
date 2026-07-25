import type { PresentationDescriptor } from "../registry";
import type { UploadRef } from "../types";
import type { Action } from "../verbs";

/** `<upload>` — one file in an upload batch. */
export const uploadDescriptor: PresentationDescriptor<UploadRef> = {
  ptype: "upload",
  tone: "var(--pbui-tone-datum)",

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
