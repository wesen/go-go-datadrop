import type { UploadRef, UploadState } from "../../pbui";

/**
 * The browser half of the staged upload protocol (guide §15).
 *
 * The server's protocol is already correct and already built; this file's job
 * is to drive it honestly, not to invent one:
 *
 *   POST   …/datasets/{d}/versions                 -> a draft version number
 *   HEAD   /v1/blobs/{digest}                      -> 200 if the bytes are held
 *   PUT    …/versions/{v}/files/{path}?digest=…    -> body, or NO body to mount
 *   POST   …/versions/{v}/commit                   -> visible to readers
 *
 * No React in here. The state machine is a plain object and a set of pure
 * transitions, so the interesting parts — the digest decision, the mount fast
 * path, the diff that makes resuming possible — are testable without a DOM, a
 * server or a file picker.
 */

/**
 * The size above which the browser does not hash.
 *
 * Web Crypto has no streaming digest — SubtleCrypto.digest takes one
 * ArrayBuffer — so hashing means holding the whole file in memory. That is fine
 * for what a person drags onto a tile and not fine for a 4 GB archive.
 *
 * Skipping is honest rather than a degradation: the server hashes while it
 * writes regardless, so the only thing lost above the threshold is the mount
 * fast path (DR-30).
 */
export const HASH_LIMIT = 64 * 1024 * 1024;

/**
 * How many files are in flight at once.
 *
 * One is slow on many small files; ten is worse rather than better, because the
 * bottleneck is a single SQLite writer and the blob store's atomic-rename
 * publish, and the extra sockets only queue with more memory held. Three is
 * empirical.
 */
export const CONCURRENCY = 3;

/** Whether this browser will let us hash at all. */
export function canHash(): boolean {
  // crypto.subtle is undefined outside a secure context. Feature-detected
  // rather than assumed, because the failure is otherwise a TypeError deep in
  // the uploader that names nothing about HTTPS (guide §15.2).
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

/** The digest a file will be stored under, or null when we did not compute one. */
export async function digestOf(file: Blob): Promise<string | null> {
  if (!canHash() || file.size > HASH_LIMIT) return null;
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/**
 * The logical path a file takes inside the dataset.
 *
 * A `webkitRelativePath` from a dropped directory can contain `..`, a leading
 * slash, or Windows separators, and the server's ValidateDatasetPath will
 * reject all three — after the bytes have been sent. Normalising here means the
 * user sees what they are actually publishing before they commit.
 */
export function normalisePath(raw: string): string {
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..");
  return parts.join("/") || "file";
}

export interface UploadItem extends UploadRef {
  file: File;
}

export interface ResumeFile {
  path: string;
  size_bytes: number;
  digest: string;
}

export interface Batch {
  id: string;
  drop: string;
  dataset: string;
  /** Null until the draft version has been opened. */
  version: number | null;
  items: UploadItem[];
  phase: "picked" | "uploading" | "ready" | "partial" | "committing" | "done";
  error: string | null;
}

export function newBatch(id: string, drop: string, dataset: string, files: File[]): Batch {
  return {
    id,
    drop,
    dataset,
    version: null,
    phase: "picked",
    error: null,
    items: files.map((file) => ({
      batchId: id,
      path: normalisePath(webkitPath(file)),
      size: file.size,
      digest: null,
      state: "queued" as UploadState,
      error: null,
      file,
    })),
  };
}

function webkitPath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

/** Replace one item, leaving the rest identical. */
export function withItem(batch: Batch, path: string, patch: Partial<UploadItem>): Batch {
  return {
    ...batch,
    items: batch.items.map((item) => (item.path === path ? { ...item, ...patch } : item)),
  };
}

/**
 * The batch's phase, derived from its items rather than tracked separately.
 *
 * `partial` is a first-class outcome, not an error banner: a five-file upload
 * whose fourth fails is the normal case on a flaky connection, and the useful
 * response is "retry the fourth" rather than "start again". Because uploads are
 * keyed by content digest, retrying costs nothing for what already arrived.
 */
export function phaseOf(items: UploadItem[]): Batch["phase"] {
  if (items.some((item) => item.state === "failed")) {
    return items.some((item) => isInFlight(item.state)) ? "uploading" : "partial";
  }
  if (items.every((item) => item.state === "done")) return "ready";
  return "uploading";
}

function isInFlight(state: UploadState): boolean {
  return state === "hashing" || state === "mounting" || state === "sending" || state === "queued";
}

/**
 * What still needs uploading, given what the draft already holds.
 *
 * This is what makes an interrupted batch resumable rather than restartable,
 * and it is why the server needed a draft listing at all (guide §4.5).
 */
export function pendingAfterResume(items: UploadItem[], alreadyUploaded: ResumeFile[]): UploadItem[] {
  const uploadedByPath = new Map(alreadyUploaded.map((item) => [item.path, item]));
  return items.filter((item) => {
    const uploaded = uploadedByPath.get(item.path);
    if (!uploaded || uploaded.size_bytes !== item.size) return true;
    // A matching path and size are not proof of matching bytes. Only skip a
    // hashable local file when its digest agrees with the draft; unhashable
    // files are uploaded again because that is safer than publishing stale data.
    return item.digest === null || uploaded.digest !== item.digest;
  });
}

/** Encode a validated logical path without turning slashes into data. */
export function encodeLogicalPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Run tasks with a fixed number in flight. */
export async function pooled<T>(
  tasks: Array<() => Promise<T>>,
  limit = CONCURRENCY,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = next++;
      const task = tasks[index];
      if (!task) return;
      await task();
    }
  });
  await Promise.all(workers);
}

// Moved to model/format.ts so molecules can use it — components/molecules may
// not import apps. Re-exported here because upload.ts is where the uploader's
// own tests and callers already look for it.
export { formatBytes } from "../../model/format";
