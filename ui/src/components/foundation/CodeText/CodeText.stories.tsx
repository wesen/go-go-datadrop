import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeText } from "./CodeText";
import { Stack, Surface } from "../../layout";
import { Text } from "..";

const meta = {
  title: "Design System/Foundation/CodeText",
  component: CodeText,
  parameters: { tile: false },
  args: { children: "kf83nd02mzq4x" },
} satisfies Meta<typeof CodeText>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The whole interface is already monospace, so this is not about the family.
 * It is about the claim: `kf83nd02mzq4x` is a token id, not a word.
 */
export const TheValuesItMarks: Story = {
  render: () => (
    <Stack gap={2}>
      <Text size="small">
        token id <CodeText>kf83nd02mzq4x</CodeText>
      </Text>
      <Text size="small">
        issuer <CodeText>http://zitadel.test:17070</CodeText>
      </Text>
      <Text size="small">
        path <CodeText>data/2026/readings.csv</CodeText>
      </Text>
      <Text size="small">
        geom <CodeText>scale_y_log10</CodeText>
      </Text>
    </Stack>
  ),
};

/**
 * The case `wrapAnywhere` exists for.
 *
 * A sha256 digest is 64 hex characters with no break opportunity, so a browser
 * will push the container wider rather than wrap it. In a 200px tile that means
 * the panel overflows its split. Both boxes below are 200px.
 */
export const LongUnbreakableValues: Story = {
  render: () => (
    <Stack gap={3}>
      <div style={{ width: 200 }}>
        <Surface border="hair" padding={2}>
          <CodeText size="tiny" wrapAnywhere>
            sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
          </CodeText>
        </Surface>
      </div>
      <Text size="tiny" tone="faint" prose>
        Without wrapAnywhere the same string forces the surface past 200px and the tile scrolls
        sideways.
      </Text>
    </Stack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Stack gap={2}>
      <CodeText size="tiny">tiny — beside a chip</CodeText>
      <CodeText size="small">small — in a row of controls</CodeText>
      <CodeText size="base">base — inside prose</CodeText>
    </Stack>
  ),
};
