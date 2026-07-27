import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScopeChip } from "./ScopeChip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * One scope on a token.
 *
 * TokensApp rendered these as `scopes.join(" ")` — four separate facts as one
 * long word, with nothing to point at.
 */
const meta = {
  title: "Design System/Atoms/ScopeChip",
  component: ScopeChip,
  parameters: { tile: false },
  args: { scope: "drops:read" },
} satisfies Meta<typeof ScopeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryScope: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={2} wrap>
        <ScopeChip scope="drops:read" />
        <ScopeChip scope="drops:write" />
        <ScopeChip scope="datasets:write" />
        <ScopeChip scope="admin" />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        `admin` is bolder and hairline-bordered rather than coloured: the tone scale already carries
        presentation type, and a red scope would read as an error rather than as a privilege.
      </Text>
    </Stack>
  ),
};

/** The comparison that motivated the atom. */
export const AgainstTheOldRendering: Story = {
  render: () => (
    <Stack gap={3}>
      <Text size="tiny" tone="faint">
        before
      </Text>
      <Text size="tiny" tone="faint">
        drops:read drops:write datasets:write admin
      </Text>
      <Text size="tiny" tone="faint">
        after
      </Text>
      <Stack direction="row" gap={2} wrap>
        {["drops:read", "drops:write", "datasets:write", "admin"].map((s) => (
          <ScopeChip key={s} scope={s} />
        ))}
      </Stack>
    </Stack>
  ),
};
