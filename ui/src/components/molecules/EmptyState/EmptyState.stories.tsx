import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";
import { Stack, Surface } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * Nine sites wrote a bare "none yet". That answers "is this broken?" and leaves
 * "what do I do about it?" unanswered — which is the only question an empty
 * list actually raises.
 */
const meta = {
  title: "Component Library/Molecules/EmptyState",
  component: EmptyState,
  parameters: { tile: false },
  args: { message: "none yet" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every empty case in the workbench, with the hint each one needs. */
export const TheRealCases: Story = {
  render: () => (
    <Stack gap={4}>
      <Surface border="hair" padding={3}>
        <Stack gap={2}>
          <SectionLabel>Your tokens</SectionLabel>
          <EmptyState message="none yet" hint="Mint one above to use the CLI or CI." />
        </Stack>
      </Surface>
      <Surface border="hair" padding={3}>
        <Stack gap={2}>
          <SectionLabel>Publish a dataset</SectionLabel>
          <EmptyState
            message="you are not a writer on any drop yet"
            hint="Ask an admin of a drop to add you, or claim an unowned one from your profile."
          />
        </Stack>
      </Surface>
      <Surface border="hair" padding={3}>
        <Stack gap={2}>
          <SectionLabel>Streams</SectionLabel>
          <EmptyState message="no streams in this drop" />
        </Stack>
      </Surface>
    </Stack>
  ),
};

/**
 * Without a hint, which is correct only when there is genuinely nothing to do.
 *
 * "no streams in this drop" is a fact about someone else's data. "none yet" for
 * your own tokens is not — you can mint one, and the empty state is the best
 * place to say so.
 */
export const WithAndWithoutAHint: Story = {
  render: () => (
    <Stack gap={4}>
      <EmptyState message="none yet" />
      <EmptyState message="none yet" hint="Mint one above to use the CLI or CI." />
      <Text size="tiny" tone="faint" prose>
        The first is what nine sites did. The second is what they meant.
      </Text>
    </Stack>
  ),
};
