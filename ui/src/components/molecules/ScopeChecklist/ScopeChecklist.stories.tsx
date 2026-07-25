import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ScopeChecklist } from "./ScopeChecklist";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const SCOPES = ["drops:read", "drops:write", "datasets:write", "admin"];

function Live({ disabled = false, initial = ["drops:read"] }: { disabled?: boolean; initial?: string[] }) {
  const [selected, setSelected] = useState(initial);
  return (
    <ScopeChecklist
      available={SCOPES}
      selected={selected}
      onSelectedChange={setSelected}
      disabled={disabled}
    />
  );
}

/**
 * A checklist rather than a multi-select, because the whole point is to see all
 * four at once — including the ones you are *not* granting. A collapsed control
 * reading "2 selected" hides the question the user is answering.
 */
const meta = {
  title: "Component Library/Molecules/ScopeChecklist",
  component: ScopeChecklist,
  parameters: { tile: false },
  args: { available: SCOPES, selected: [], onSelectedChange: () => {} },
} satisfies Meta<typeof ScopeChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <Live /> };

export const AllSelected: Story = { render: () => <Live initial={SCOPES} /> };

/** None selected — the mint button above is disabled until at least one is. */
export const NoneSelected: Story = { render: () => <Live initial={[]} /> };

/**
 * The state a token-authenticated caller sees.
 *
 * A token must not be able to mint another token, or revoking a leaked one
 * leaves its offspring alive with no way to enumerate them. The form is shown
 * disabled with the reason rather than hidden: a rule you cannot see is a rule
 * you cannot learn.
 */
export const Disabled: Story = {
  render: () => (
    <Stack gap={3}>
      <Live disabled />
      <Text size="tiny" tone="faint" prose>
        Minting requires a signed-in browser session.
      </Text>
    </Stack>
  ),
};
