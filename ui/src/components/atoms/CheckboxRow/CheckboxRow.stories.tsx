import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CheckboxRow } from "./CheckboxRow";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const SCOPES = ["drops:read", "drops:write", "datasets:write", "admin"];

const meta = {
  title: "Design System/Atoms/CheckboxRow",
  component: CheckboxRow,
  parameters: { tile: false },
  args: { label: "drops:read", checked: false, onCheckedChange: () => {} },
} satisfies Meta<typeof CheckboxRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function ScopePicker({ disabled = false }: { disabled?: boolean }) {
  const [selected, setSelected] = useState<string[]>(["drops:read"]);
  return (
    <Stack direction="row" gap={3} wrap>
      {SCOPES.map((scope) => (
        <CheckboxRow
          key={scope}
          label={scope}
          disabled={disabled}
          checked={selected.includes(scope)}
          onCheckedChange={(next) =>
            setSelected((current) =>
              next ? [...current, scope] : current.filter((s) => s !== scope),
            )
          }
        />
      ))}
    </Stack>
  );
}

export const TheScopePicker: Story = {
  render: () => (
    <Stack gap={3}>
      <ScopePicker />
      <Text size="tiny" tone="faint" prose>
        Scopes narrow what a token may do. They never grant more than the holder has: remove
        yourself from a drop and every token you hold loses it immediately.
      </Text>
    </Stack>
  ),
};

/**
 * The state a token-authenticated caller sees.
 *
 * A token must not be able to mint another token, or revoking a leaked one
 * leaves its offspring alive with no way to enumerate them. Shown disabled with
 * the reason rather than hidden.
 */
export const Disabled: Story = {
  render: () => (
    <Stack gap={2}>
      <ScopePicker disabled />
      <Text size="tiny" tone="faint" prose>
        Minting requires a browser session. A token cannot mint another token.
      </Text>
    </Stack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Stack gap={2}>
      <CheckboxRow size="tiny" label="show revoked" checked onCheckedChange={() => {}} />
      <CheckboxRow size="small" label="show revoked" checked={false} onCheckedChange={() => {}} />
    </Stack>
  ),
};
