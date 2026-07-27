import type { Meta, StoryObj } from "@storybook/react-vite";
import { Callout } from "./Callout";
import { Stack } from "../../layout";
import { CodeText, Text } from "../../foundation";
import { Button } from "../../atoms";

/**
 * Three of these existed inline, all as `<Surface tone="alt" role="status">`,
 * and none of them announced itself the same way.
 */
const meta = {
  title: "Component Library/Molecules/Callout",
  component: Callout,
  parameters: { tile: false },
  args: { children: null },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TheThreeItReplaced: Story = {
  render: () => (
    <Stack gap={4}>
      <Callout
        variant="ok"
        title="Published — version 3"
        actions={<Button>Open in a chart</Button>}
      >
        <Text size="small">Four files, 1.2 MB. Readers can see it now.</Text>
      </Callout>

      <Callout variant="warning" title="An unfinished upload is waiting">
        <Text size="small">version 2 · 3 files · 840 kB</Text>
      </Callout>

      <Callout variant="info">
        <Text size="small" prose>
          This page is not a secure context, so the browser cannot compute digests. Files will be
          uploaded in full and the server will hash them as it writes.
        </Text>
      </Callout>
    </Stack>
  ),
};

/**
 * The one-time secret panel.
 *
 * The secret exists in component state and in one HTTP response. It is never in
 * Redux, never in a presentation value and never in a verb (DR-28), so it
 * cannot reach the inspector, the watchlist, the trace or localStorage. The
 * value below is not a real token shape.
 */
export const TheOneTimeSecret: Story = {
  render: () => (
    <Callout
      variant="ok"
      title="Copy this now — it is shown once"
      actions={
        <>
          <Button>Copy</Button>
          <Button>Done</Button>
        </>
      }
    >
      <Stack gap={2}>
        <CodeText wrapAnywhere selectable>
          ddp_exampleexampl_exampleexampleexampleexampleexam
        </CodeText>
        <Text size="tiny" tone="faint" prose>
          datadrop stores only a hash of this. Dismissing the panel is irreversible; if you lose it,
          revoke the token and mint another.
        </Text>
      </Stack>
    </Callout>
  ),
};

/**
 * Why there is no `danger` variant.
 *
 * A Callout reports a state worth knowing. A *failure* is `ErrorNotice`, which
 * announces as an alert. Merging them would mean either announcing every
 * informational panel as an alert, or announcing no failure as one.
 */
export const VariantsSurviveGreyscale: Story = {
  render: () => (
    <Stack gap={3}>
      <Callout variant="info" title="Info">
        <Text size="small">no glyph</Text>
      </Callout>
      <Callout variant="ok" title="Done">
        <Text size="small">✓ prefix</Text>
      </Callout>
      <Callout variant="warning" title="Waiting">
        <Text size="small">⚠ prefix</Text>
      </Callout>
    </Stack>
  ),
};
