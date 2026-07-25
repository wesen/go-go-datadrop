import type { Meta, StoryObj } from "@storybook/react-vite";
import { UploadQueueList } from "./UploadQueueList";
import type { UploadItemView } from "../UploadItemRow";
import { Button } from "../../atoms";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const item = (path: string, state: UploadItemView["state"], error: string | null = null): UploadItemView => ({
  path,
  size: 1_482_112,
  state,
  digest: null,
  error,
  ...(error ? {} : {}),
});

const meta = {
  title: "Component Library/Molecules/UploadQueueList",
  component: UploadQueueList,
  parameters: { tile: false },
  args: { dataset: "readings", phase: "picked", version: null, items: [] },
} satisfies Meta<typeof UploadQueueList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Files chosen, nothing sent yet. */
export const Picked: Story = {
  render: () => (
    <UploadQueueList
      dataset="readings"
      phase="picked"
      version={null}
      items={[item("a.csv", "queued"), item("b.csv", "queued"), item("c.csv", "queued")]}
      actions={<Button>Upload 3 files</Button>}
    />
  ),
};

/** Three at a time: the bottleneck is a single SQLite writer, so ten is worse
 *  rather than better. */
export const Uploading: Story = {
  render: () => (
    <UploadQueueList
      dataset="readings"
      phase="uploading"
      version={4}
      items={[
        item("a.csv", "done"),
        item("b.csv", "sending"),
        item("c.csv", "hashing"),
        item("d.csv", "queued"),
        item("e.csv", "queued"),
      ]}
    />
  ),
};

/**
 * The state the whole design turns on.
 *
 * A five-file upload whose fourth fails is the normal case on a flaky
 * connection, and the useful response is "retry the fourth", not "start again".
 * `partial` is therefore a first-class phase with its own action, and it is
 * only reported once nothing is still in flight — reporting it early would
 * offer a retry that races the uploads still running.
 */
export const PartialFailure: Story = {
  render: () => (
    <Stack gap={3}>
      <UploadQueueList
        dataset="readings"
        phase="partial"
        version={4}
        items={[
          item("a.csv", "done"),
          item("b.csv", "done"),
          item("c.csv", "failed", "connection reset"),
          item("d.csv", "done"),
        ]}
        actions={<Button>Retry failed</Button>}
      />
      <Text size="tiny" tone="faint" prose>
        Nothing is committed yet, so a reader sees none of this.
      </Text>
    </Stack>
  ),
};

export const ReadyToCommit: Story = {
  render: () => (
    <UploadQueueList
      dataset="readings"
      phase="ready"
      version={4}
      items={[item("a.csv", "done"), item("b.csv", "done")]}
      actions={<Button>Commit</Button>}
    />
  ),
};

/** No files, which happens between choosing a dataset and choosing files. */
export const Empty: Story = {
  render: () => (
    <UploadQueueList dataset="readings" phase="picked" version={null} items={[]} />
  ),
};
