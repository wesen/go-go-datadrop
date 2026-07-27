import type { Meta, StoryObj } from "@storybook/react-vite";
import { DraftResumeList } from "./DraftResumeList";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * An upload that was interrupted, and is still holding its bytes.
 *
 * This exists because of a defect the design analysis predicted by reading the
 * server and the uploader, and that building the uploader then confirmed
 * exactly: dataset version listings are committed-only, so an interrupted
 * upload is invisible to the API. The version number is lost on reload, the
 * draft cannot be found, and its blob references keep garbage collection from
 * reclaiming the bytes — an abandoned 400 MB upload costs 400 MB forever and
 * nothing in the interface admits it exists.
 *
 * "Discard" is therefore not a tidiness affordance. It is the only way to
 * release the bytes.
 */
const meta = {
  title: "Component Library/Molecules/DraftResumeList",
  component: DraftResumeList,
  parameters: { tile: false },
  args: { drafts: [], onResume: () => {}, onDiscard: () => {} },
} satisfies Meta<typeof DraftResumeList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneDraft: Story = {
  render: () => (
    <DraftResumeList
      drafts={[{ version: 4, file_count: 3, total_bytes: 860_160 }]}
      onResume={() => {}}
      onDiscard={() => {}}
    />
  ),
};

/** Several, which is what an unlucky week looks like. */
export const SeveralDrafts: Story = {
  render: () => (
    <DraftResumeList
      drafts={[
        { version: 6, file_count: 1, total_bytes: 402_653_184 },
        { version: 5, file_count: 12, total_bytes: 8_912_896 },
        { version: 4, file_count: 3, total_bytes: 860_160 },
      ]}
      onResume={() => {}}
      onDiscard={() => {}}
    />
  ),
};

/**
 * Resuming needs the files again, so the button says so.
 *
 * The browser cannot re-read a file it no longer has a handle for, and a page
 * reload loses every handle. Greying the button without the sentence would make
 * that look like a bug.
 */
export const CannotResumeYet: Story = {
  render: () => (
    <Stack gap={3}>
      <DraftResumeList
        drafts={[{ version: 4, file_count: 3, total_bytes: 860_160 }]}
        resumeDisabledReason="choose the files again first"
        onResume={() => {}}
        onDiscard={() => {}}
      />
      <Text size="tiny" tone="faint" prose>
        Hover the disabled resume button for the reason.
      </Text>
    </Stack>
  ),
};

/** None waiting — renders nothing, which is the common case. */
export const NoDrafts: Story = {
  render: () => (
    <Stack gap={2}>
      <DraftResumeList drafts={[]} onResume={() => {}} onDiscard={() => {}} />
      <Text size="tiny" tone="faint">
        nothing above this line
      </Text>
    </Stack>
  ),
};
