import type { Meta, StoryObj } from "@storybook/react-vite";
import { UploadPanel } from "./UploadPanel";
import type { UploadBatchView } from "./UploadPanel";
import type { UploadItemView } from "../../molecules";

const HASH_LIMIT = 64 * 1024 * 1024;

const item = (
  path: string,
  state: UploadItemView["state"],
  error: string | null = null,
): UploadItemView => ({ path, size: 1_482_112, state, digest: null, error });

const batch = (over: Partial<UploadBatchView>): UploadBatchView => ({
  drop: "lab",
  dataset: "readings",
  version: null,
  phase: "picked",
  items: [item("a.csv", "queued"), item("b.csv", "queued"), item("c.csv", "queued")],
  error: null,
  ...over,
});

const noop = () => {};

const meta = {
  title: "Component Library/Organisms/UploadPanel",
  component: UploadPanel,
  parameters: { tile: { width: 560, height: 640 } },
  args: {
    target: { drop: "lab", dataset: "readings" },
    writableDrops: ["lab", "field-trial"],
    batch: null,
    drafts: null,
    canHash: true,
    hashLimit: HASH_LIMIT,
    onTargetChange: noop,
    onFiles: noop,
    onRun: noop,
    onCommit: noop,
    onRetry: noop,
    onResumeDraft: noop,
    onDiscardDraft: noop,
    onOpenInChart: noop,
  },
} satisfies Meta<typeof UploadPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

/**
 * Nothing chosen yet, so the drop surface says what to do first.
 *
 * A greyed box with no sentence is a puzzle; "choose a drop and name the
 * dataset first" is the entire content of the disabled state.
 */
export const NothingChosen: Story = {
  args: { target: { drop: "", dataset: "" } },
};

/**
 * **The awkward mode** (§18.2): a first-day account with no writable drops.
 *
 * The select is empty, the surface is disabled, and the line beneath says why.
 * Reaching this by clicking needs an account nobody has added to anything.
 */
export const NoWritableDrops: Story = {
  args: { writableDrops: [], target: { drop: "", dataset: "" } },
};

export const FilesPicked: Story = { args: { batch: batch({}) } };

/** Three at a time: the bottleneck is one SQLite writer and the blob store's
 *  atomic-rename publish, so ten is worse rather than better. */
export const Uploading: Story = {
  args: {
    batch: batch({
      phase: "uploading",
      version: 4,
      items: [
        item("a.csv", "done"),
        item("b.csv", "sending"),
        item("c.csv", "hashing"),
        item("d.csv", "queued"),
      ],
    }),
  },
};

/**
 * **The awkward mode**: partial failure with a retry.
 *
 * A five-file upload whose fourth fails is the normal case on a flaky
 * connection, and the useful response is "retry the fourth", not "start again".
 */
export const PartialFailure: Story = {
  args: {
    batch: batch({
      phase: "partial",
      version: 4,
      items: [
        item("a.csv", "done"),
        item("b.csv", "done"),
        item("c.csv", "failed", "connection reset"),
      ],
    }),
  },
};

export const ReadyToCommit: Story = {
  args: {
    batch: batch({
      phase: "ready",
      version: 4,
      items: [item("a.csv", "done"), item("b.csv", "done")],
    }),
  },
};

export const Published: Story = {
  args: {
    batch: batch({
      phase: "done",
      version: 4,
      items: [item("a.csv", "done"), item("b.csv", "done")],
    }),
  },
};

/**
 * **The awkward mode**: a draft is waiting.
 *
 * Dataset version listings are committed-only, so an interrupted upload is
 * invisible to the API — the version number is lost on reload and its blob
 * references keep garbage collection from reclaiming the bytes. This panel and
 * the `drafts` endpoint behind it are the fix, and "discard" is the only way to
 * release them.
 */
export const ADraftIsWaiting: Story = {
  args: {
    drafts: [
      { version: 4, file_count: 3, total_bytes: 860_160 },
      { version: 3, file_count: 1, total_bytes: 402_653_184 },
    ],
  },
};

/**
 * **The awkward mode**: not a secure context.
 *
 * Web Crypto is unavailable outside `localhost`, `127.0.0.1` and HTTPS, so the
 * browser cannot hash and the mount fast path is skipped. The warning is
 * surfaced where it has a consequence rather than left to fail as a TypeError
 * deep in the uploader. Reaching this by clicking needs the workbench served
 * from a non-loopback hostname over plain HTTP.
 */
export const NotASecureContext: Story = { args: { canHash: false } };

export const BatchError: Story = {
  args: { batch: batch({ phase: "partial", error: "413 Payload Too Large" }) },
};
