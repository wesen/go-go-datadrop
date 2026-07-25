import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "./Divider";
import { Stack, Surface } from "../../layout";
import { SectionLabel, Text } from "..";

/**
 * The distinction this component exists to keep visible (§10.3 rule 9): a solid
 * rule *bounds* something and is therefore a border on the thing it bounds; a
 * dashed or dotted rule *separates* things and is this component. Blur the two
 * and the interface turns into a grid of boxes.
 */
const meta = {
  title: "Design System/Foundation/Divider",
  component: Divider,
  parameters: { tile: false },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <Stack gap={2}>
      <Text size="small">above</Text>
      <Divider variant="dashed" />
      <Text size="small">dashed separates sections inside one surface</Text>
      <Divider variant="dotted" />
      <Text size="small">dotted separates rows within a section</Text>
    </Stack>
  ),
};

/** Beside a bordered surface, which is the comparison that makes the rule land. */
export const AgainstABorder: Story = {
  render: () => (
    <Stack gap={3}>
      <Surface border="hair" padding={3}>
        <Stack gap={2}>
          <SectionLabel>a bounded thing</SectionLabel>
          <Text size="small">solid, because the border belongs to this surface</Text>
          <Divider />
          <Text size="small">dashed, because this only separates two parts of it</Text>
        </Stack>
      </Surface>
    </Stack>
  ),
};

export const Spacing: Story = {
  render: () => (
    <Stack gap={0}>
      {(["none", "space-2", "space-3", "space-4"] as const).map((spacing) => (
        <div key={spacing}>
          <Text size="tiny" tone="faint">
            {spacing}
          </Text>
          <Divider spacing={spacing} />
        </div>
      ))}
    </Stack>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Stack direction="row" gap={3} align="center">
      <Text size="small">left</Text>
      <div style={{ height: 24 }}>
        <Divider orientation="vertical" />
      </div>
      <Text size="small">right</Text>
    </Stack>
  ),
};
