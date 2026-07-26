import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextArea, type TextAreaProps } from "./TextArea";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * The only multi-line field in the tree, added by DATADROP-8 for the import
 * dialog — where an empty, focused text area is not the fallback but the path:
 * Firefox does not implement `navigator.clipboard.readText` for web content, so
 * ⌘V into a field is the only import route a large share of users have.
 */
const meta = {
  title: "Design System/Atoms/TextArea",
  component: TextArea,
  parameters: { tile: false },
  args: { label: "bundle", value: "", onValueChange: () => {} },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A controlled field needs a wrapper, or the story cannot be typed into. */
function Live(props: Omit<TextAreaProps, "value" | "onValueChange"> & { initial?: string }) {
  const { initial = "", ...rest } = props;
  const [value, setValue] = useState(initial);
  return <TextArea value={value} onValueChange={setValue} {...rest} />;
}

const BUNDLE = `{
  "format": "datadrop.layout",
  "version": 1,
  "kind": "tile",
  "exportedAt": "2026-07-26T18:04:11.512Z",
  "name": "readings, filtered",
  "payload": { "app": "chart" }
}`;

/** Empty, with the placeholder that says what belongs here. */
export const Empty: Story = {
  render: () => (
    <Live label="tile bundle" code placeholder={'{ "format": "datadrop.layout", … }'} />
  ),
};

/** Holding JSON, which is the only thing this field is ever used for. */
export const WithBundle: Story = {
  render: () => <Live label="tile bundle" code initial={BUNDLE} />,
};

/**
 * Invalid.
 *
 * Dashed as well as red: a field can be invalid on a monochrome display too,
 * and every state has to survive a greyscale screenshot.
 */
export const Invalid: Story = {
  render: () => (
    <Stack gap={3}>
      <Live label="tile bundle" code invalid initial={"site,mean_temp,n\nnorth,21.4,18"} />
      <Text size="tiny" tone="faint" prose>
        The border is dashed, not only red — the state is legible with no colour at all.
      </Text>
    </Stack>
  ),
};

/**
 * The overflow case: one very long line with no spaces.
 *
 * A bundle is one enormous line before it is pretty-printed, and a field that
 * does not wrap shows the user a single character of their own paste. `code`
 * sets `pre-wrap` and `break-word` for exactly this.
 */
export const OneLongLine: Story = {
  render: () => (
    <Live
      label="tile bundle"
      code
      rows={4}
      initial={`{"format":"datadrop.layout","version":1,"kind":"workspace","payload":${"{".repeat(0)}${JSON.stringify(
        { name: "explore", docs: [], tree: { leaf: { app: "sources" } } },
      )}}`}
    />
  ),
};
