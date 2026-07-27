import type { Meta, StoryObj } from "@storybook/react-vite";
import { JsonBlock } from "./JsonBlock";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * A JSON value, pretty-printed.
 *
 * Extracted from `InspectorPanel`, which inlined the `<pre>`. One component
 * rather than a copied element because it is where the stringify guard belongs
 * — and an inspector that throws takes down the tile you opened to find out
 * what was wrong.
 */
const meta = {
  title: "Component Library/Molecules/JsonBlock",
  component: JsonBlock,
  parameters: { tile: false },
  args: {
    value: {
      presentationType: "field",
      docId: "alpha",
      name: "data.temp_c",
      type: "q",
      distinct: 47,
    },
  },
} satisfies Meta<typeof JsonBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The values a `describe()` is not supposed to return, and sometimes does.
 *
 * `pbui/types.ts` requires `describe()` to be JSON-serialisable. A circular
 * reference and a BigInt both make `JSON.stringify` throw, and "supposed to" is
 * not "does" — so the block reports the failure in place instead of unmounting
 * the panel around it.
 */
export const Unserialisable: Story = {
  render: () => {
    const circular: Record<string, unknown> = { name: "a step" };
    circular.self = circular;
    return (
      <Stack gap={4}>
        <Stack gap={2}>
          <SectionLabel>a circular reference</SectionLabel>
          <JsonBlock value={circular} />
        </Stack>
        <Stack gap={2}>
          <SectionLabel>a BigInt</SectionLabel>
          <JsonBlock value={{ seq: BigInt("12345678901234567890") }} />
        </Stack>
        <Text>
          Both render an error inside the block. Neither throws, which is the entire point: the tile
          that shows you what an object is must survive objects that are wrong.
        </Text>
      </Stack>
    );
  },
};

/** `undefined` stringifies to `undefined`, not to a string — hence the fallback. */
export const Edges: Story = {
  render: () => (
    <Stack gap={3}>
      {[
        ["undefined", undefined],
        ["null", null],
        ["a bare string", "not an object"],
        ["an empty object", {}],
        ["an empty array", []],
      ].map(([caption, v]) => (
        <Stack key={caption as string} gap={1}>
          <SectionLabel>{caption as string}</SectionLabel>
          <JsonBlock value={v} />
        </Stack>
      ))}
    </Stack>
  ),
};

/** Long values wrap rather than forcing the panel to scroll sideways. */
export const LongValues: Story = {
  args: {
    value: {
      id: "01KYGJWGGTYSKJ8SE9NJMYXCN5",
      digest: "sha256:e5eda277eacc6bf36c4bac9d986b44256d5d3063184b3934f8931935833c738e",
      note: "a long single-line string value that has no convenient break opportunities in it at all",
    },
    maxHeight: 120,
  },
};
