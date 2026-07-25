import type { Meta, StoryObj } from "@storybook/react-vite";
import { UploadItemRow } from "./UploadItemRow";
import type { UploadItemView } from "./UploadItemRow";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const item = (over: Partial<UploadItemView>): UploadItemView => ({
  path: "readings.csv",
  size: 1_482_112,
  state: "queued",
  digest: null,
  error: null,
  ...over,
});

const meta = {
  title: "Component Library/Molecules/UploadItemRow",
  component: UploadItemRow,
  parameters: { tile: false },
  args: { item: item({}) },
} satisfies Meta<typeof UploadItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every state a file passes through.
 *
 * The state used to be a faint grey word and nothing else. It is now a glyph
 * plus that word, so the column reads down the left edge and survives
 * greyscale — the rule Chip.module.css states and this row was quietly
 * breaking.
 */
export const EveryState: Story = {
  render: () => (
    <Stack gap={2}>
      <UploadItemRow item={item({ path: "queued.csv", state: "queued" })} />
      <UploadItemRow item={item({ path: "hashing.csv", state: "hashing" })} />
      <UploadItemRow item={item({ path: "mounted.csv", state: "mounting", size: 402_653_184 })} />
      <UploadItemRow item={item({ path: "sending.csv", state: "sending" })} />
      <UploadItemRow item={item({ path: "done.csv", state: "done" })} />
      <UploadItemRow
        item={item({ path: "failed.csv", state: "failed", error: "413 Payload Too Large" })}
      />
    </Stack>
  ),
};

/** A path long enough to need truncating, in a narrow tile. */
export const LongPath: Story = {
  render: () => (
    <div style={{ width: 240, border: "var(--pbui-border-hair)", padding: 4 }}>
      <UploadItemRow
        item={item({
          path: "deployment/region/availability-zone/instance/readings-2026-07.csv",
          state: "done",
        })}
      />
    </div>
  ),
};

/**
 * Sizes at every scale.
 *
 * One decimal below ten and none above, so a column of them has a stable width:
 * "9.4 MB" and "412 MB" are both six characters.
 */
export const Sizes: Story = {
  render: () => (
    <Stack gap={2}>
      <UploadItemRow item={item({ path: "tiny.csv", size: 512, state: "done" })} />
      <UploadItemRow item={item({ path: "small.csv", size: 2048, state: "done" })} />
      <UploadItemRow item={item({ path: "at-the-hash-limit.csv", size: 67_108_864, state: "done" })} />
      <UploadItemRow item={item({ path: "huge.csv", size: 5_368_709_120, state: "sending" })} />
      <Text size="tiny" tone="faint" prose>
        Above 64 MiB the browser stops hashing — Web Crypto has no streaming
        digest — so the mount fast path is skipped and the server hashes while
        it writes.
      </Text>
    </Stack>
  ),
};
