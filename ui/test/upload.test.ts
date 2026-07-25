import { describe, expect, test } from "bun:test";
import {
  HASH_LIMIT,
  digestOf,
  formatBytes,
  newBatch,
  normalisePath,
  pendingAfterResume,
  phaseOf,
  pooled,
  withItem,
} from "../src/apps/UploadApp/upload";
import type { UploadState } from "../src/pbui";

/**
 * The uploader's state machine, tested with no DOM, no server and no file
 * picker.
 *
 * That is the point of keeping it in a plain module: the interesting parts —
 * the digest threshold, the path normalisation, the resume diff, the phase
 * derivation — are exactly the parts a UI test would have the hardest time
 * reaching and the most to lose from getting wrong.
 */

function file(name: string, size = 10, relative?: string): File {
  const blob = new File([new Uint8Array(size)], name);
  if (relative) {
    Object.defineProperty(blob, "webkitRelativePath", { value: relative });
  }
  return blob;
}

describe("logical paths", () => {
  test("a dropped directory's path is normalised before it is shown", () => {
    // webkitRelativePath from a dropped directory can carry all of these, and
    // the server's ValidateDatasetPath rejects them — AFTER the bytes have been
    // sent. Normalising here means the user sees what they are publishing.
    expect(normalisePath("data/readings.csv")).toBe("data/readings.csv");
    expect(normalisePath("/data/readings.csv")).toBe("data/readings.csv");
    expect(normalisePath("../../etc/passwd")).toBe("etc/passwd");
    expect(normalisePath("data\\windows\\file.csv")).toBe("data/windows/file.csv");
    expect(normalisePath("./a/./b.csv")).toBe("a/b.csv");
  });

  test("a path that normalises to nothing still has a name", () => {
    // "" as a logical path would be rejected by the server, and a file with no
    // visible name in the list is worse than one called "file".
    expect(normalisePath("../..")).toBe("file");
    expect(normalisePath("/")).toBe("file");
  });

  test("a batch takes each file's relative path when it has one", () => {
    const batch = newBatch("b1", "lab", "readings", [
      file("a.csv"),
      file("b.csv", 10, "sub/dir/b.csv"),
    ]);
    expect(batch.items.map((item) => item.path)).toEqual(["a.csv", "sub/dir/b.csv"]);
    expect(batch.items.every((item) => item.state === "queued")).toBe(true);
    expect(batch.version).toBeNull();
  });
});

describe("hashing", () => {
  test("a small file gets a sha256 digest in the server's format", async () => {
    const digest = await digestOf(new Blob(["hello"]));
    // The exact hash of "hello", so this fails if the algorithm or the hex
    // encoding ever changes — the server verifies what we assert.
    expect(digest).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("a file over the threshold is not hashed, and that is not a failure", async () => {
    // Web Crypto has no streaming digest, so hashing means holding the whole
    // file in memory. Above the limit the server hashes while writing and the
    // only thing lost is the mount fast path (DR-30).
    const huge = { size: HASH_LIMIT + 1, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    expect(await digestOf(huge as unknown as Blob)).toBeNull();
  });
});

describe("the batch state machine", () => {
  const items = (...states: UploadState[]) =>
    states.map((state, index) => ({
      batchId: "b1",
      path: `f${index}.csv`,
      size: 1,
      digest: null,
      state,
      error: null,
      file: file(`f${index}.csv`),
    }));

  test("all done is ready to commit", () => {
    expect(phaseOf(items("done", "done"))).toBe("ready");
  });

  test("a failure while others are still moving is not yet partial", () => {
    // Reporting `partial` early would offer a retry button that races the
    // uploads still in flight.
    expect(phaseOf(items("failed", "sending"))).toBe("uploading");
  });

  test("a failure with nothing in flight is partial, not an error", () => {
    // `partial` is a first-class state with a retry. A five-file upload whose
    // fourth fails is the normal case on a flaky connection, and the useful
    // response is "retry the fourth", not "start again".
    expect(phaseOf(items("done", "failed"))).toBe("partial");
  });

  test("withItem touches exactly one item", () => {
    const batch = newBatch("b1", "lab", "readings", [file("a.csv"), file("b.csv")]);
    const next = withItem(batch, "a.csv", { state: "done" });
    expect(next.items[0]?.state).toBe("done");
    expect(next.items[1]).toBe(batch.items[1]);
  });
});

describe("resuming", () => {
  test("files the draft already holds are skipped", () => {
    // This is what the server's draft listing exists for. Without it the
    // version number is lost on reload, the API will not admit the draft
    // exists, and its blob references keep garbage collection from reclaiming
    // the bytes (guide §4.5).
    const batch = newBatch("b1", "lab", "readings", [
      file("a.csv"),
      file("b.csv"),
      file("c.csv"),
    ]);
    const pending = pendingAfterResume(batch.items, ["a.csv", "c.csv"]);
    expect(pending.map((item) => item.path)).toEqual(["b.csv"]);
  });

  test("an empty draft means everything is pending", () => {
    const batch = newBatch("b1", "lab", "readings", [file("a.csv")]);
    expect(pendingAfterResume(batch.items, [])).toHaveLength(1);
  });
});

describe("the concurrency pool", () => {
  test("never runs more than the limit at once, and runs everything", async () => {
    // Three, because one is slow on many small files and ten is worse rather
    // than better: the bottleneck is a single SQLite writer and the blob
    // store's atomic-rename publish.
    let inFlight = 0;
    let peak = 0;
    let completed = 0;

    const tasks = Array.from({ length: 12 }, () => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      completed++;
    });

    await pooled(tasks, 3);
    expect(completed).toBe(12);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  test("fewer tasks than the limit still all run", async () => {
    let completed = 0;
    await pooled(
      Array.from({ length: 2 }, () => async () => {
        completed++;
      }),
      8,
    );
    expect(completed).toBe(2);
  });
});

describe("byte formatting", () => {
  test("reads at a glance at every scale", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 kB");
    expect(formatBytes(64 * 1024 * 1024)).toBe("64 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });
});
