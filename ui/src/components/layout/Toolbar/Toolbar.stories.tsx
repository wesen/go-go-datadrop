import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar } from "./Toolbar";
import { Stack } from "../Stack";
import { Surface } from "../Surface";
import { SectionLabel, Text } from "../../foundation";
import { Button, SelectInput } from "../../atoms";

const meta = {
  title: "Design System/Layout/Toolbar",
  component: Toolbar,
  parameters: { tile: false },
  args: { children: null },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Stack gap={4}>
      <Surface border="hair">
        <Toolbar>
          <SectionLabel>default</SectionLabel>
          <Button variant="framed">an action</Button>
        </Toolbar>
      </Surface>
      <Surface border="hair">
        <Toolbar tight>
          <SectionLabel>tight</SectionLabel>
          <Button variant="framed">an action</Button>
        </Toolbar>
      </Surface>
      <Surface border="hair">
        <Toolbar bordered>
          <SectionLabel>bordered</SectionLabel>
          <Button variant="framed">an action</Button>
        </Toolbar>
      </Surface>
    </Stack>
  ),
};

/**
 * The property that matters, and the one a story is the only way to see.
 *
 * `flex-shrink: 0`. A toolbar that shrinks when its tile gets short collapses
 * its controls into each other, and the body — the part that is supposed to
 * scroll — keeps its height instead. The frame below is 90px tall with far more
 * than 90px of content.
 */
export const DoesNotShrink: Story = {
  render: () => (
    <div
      style={{
        height: 90,
        display: "flex",
        flexDirection: "column",
        border: "var(--pbui-border-firm)",
      }}
    >
      <Toolbar bordered tight>
        <SectionLabel>Doc</SectionLabel>
        <SelectInput
          label="document"
          variant="framed"
          size="tiny"
          value="a"
          options={[{ value: "a", label: "α · active" }]}
          onValueChange={() => {}}
        />
        <Button variant="framed" size="tiny">
          ＋
        </Button>
      </Toolbar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pbui-space-3)" }}>
        <Stack gap={2}>
          {Array.from({ length: 12 }, (_, i) => (
            <Text key={i} size="small">
              body row {i + 1} — this region scrolls, the toolbar does not
            </Text>
          ))}
        </Stack>
      </div>
    </div>
  ),
};
