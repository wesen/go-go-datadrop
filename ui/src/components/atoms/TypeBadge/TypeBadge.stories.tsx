import type { Meta, StoryObj } from "@storybook/react-vite";
import { TypeBadge } from "./TypeBadge";
import { Chip } from "../Chip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const meta = {
  title: "Design System/Atoms/TypeBadge",
  component: TypeBadge,
  parameters: { tile: false },
  args: { type: "q" },
} satisfies Meta<typeof TypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TheThreeTypes: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="center">
        <TypeBadge type="q" />
        <TypeBadge type="n" />
        <TypeBadge type="t" />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Quantitative, nominal, temporal. Hover for the full word — the letter is
        the compact form and the title is the accessible one.
      </Text>
    </Stack>
  ),
};

/**
 * An override is marked with an asterisk, not only with a different colour.
 *
 * "This chart treats the column as nominal even though the schema says
 * quantitative" is a claim about *this chart*, and losing it is how two tiles on
 * one document come to disagree about what a field is.
 */
export const Overridden: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={4} align="center">
        <TypeBadge type="n" />
        <TypeBadge type="n" overridden />
      </Stack>
      <Stack direction="row" gap={3} align="center">
        <Chip label="station" tone="var(--pbui-tone-field)" badge={<TypeBadge type="n" />} />
        <Chip
          label="station"
          tone="var(--pbui-tone-field)"
          badge={<TypeBadge type="n" overridden />}
        />
      </Stack>
    </Stack>
  ),
};
