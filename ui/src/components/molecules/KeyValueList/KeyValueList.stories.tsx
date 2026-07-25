import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyValueList } from "./KeyValueList";
import { Stack, Surface } from "../../layout";
import { CodeText, Text } from "../../foundation";

/**
 * A real `<dl>`, not a two-column grid of spans.
 *
 * The markup is the semantics: a screen reader announces "issuer,
 * http://zitadel.test:17070" as a pair, which is the entire content of a
 * metadata block and is lost if it is two unrelated runs of text.
 */
const meta = {
  title: "Component Library/Molecules/KeyValueList",
  component: KeyValueList,
  parameters: { tile: false },
  args: { entries: [] },
} satisfies Meta<typeof KeyValueList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  render: () => (
    <Surface border="hair" padding={3}>
      <KeyValueList
        entries={[
          { key: "issuer", value: <CodeText>http://zitadel.test:17070</CodeText> },
          { key: "auth mode", value: "oidc" },
          { key: "kind", value: "session" },
          { key: "scopes", value: "drops:read drops:write admin" },
        ]}
      />
    </Surface>
  ),
};

export const Dense: Story = {
  render: () => (
    <Surface border="hair" padding={2}>
      <KeyValueList
        dense
        entries={[
          { key: "rows", value: "2,000" },
          { key: "columns", value: "5" },
          { key: "source", value: "lab / readings" },
        ]}
      />
    </Surface>
  ),
};

/**
 * A long unbroken value in a narrow container.
 *
 * `minmax(0, 1fr)` rather than `1fr` on the value column: a grid track's floor
 * is `min-content`, so with plain `1fr` a digest would refuse to shrink and
 * push the whole block past its tile. Both boxes below are 220px.
 */
export const LongValues: Story = {
  render: () => (
    <Stack gap={3}>
      <div style={{ width: 220 }}>
        <Surface border="hair" padding={2}>
          <KeyValueList
            dense
            entries={[
              {
                key: "digest",
                value: (
                  <CodeText size="tiny" wrapAnywhere>
                    sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
                  </CodeText>
                ),
              },
              { key: "path", value: "deployment/region/zone/instance.csv" },
            ]}
          />
        </Surface>
      </div>
      <Text size="tiny" tone="faint">
        the block stays 220px wide
      </Text>
    </Stack>
  ),
};

/** No entries. Renders an empty list rather than a box with nothing in it. */
export const Empty: Story = {
  render: () => <KeyValueList entries={[]} />,
};
