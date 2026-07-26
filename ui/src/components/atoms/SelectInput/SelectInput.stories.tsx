import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SelectInput } from "./SelectInput";
import type { SelectInputProps } from "./SelectInput";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

function Live({
  initial = "",
  ...props
}: Omit<SelectInputProps, "value" | "onValueChange"> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SelectInput value={value} onValueChange={setValue} {...props} />;
}

const ROLES = [
  { value: "reader", label: "reader" },
  { value: "writer", label: "writer" },
  { value: "admin", label: "admin" },
];

const meta = {
  title: "Design System/Atoms/SelectInput",
  component: SelectInput,
  parameters: { tile: false },
  // See TextInput.stories: control-panel defaults, not what the stories render.
  args: { label: "role", value: "reader", options: ROLES, onValueChange: () => {} },
} satisfies Meta<typeof SelectInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  render: () => (
    <Stack gap={3}>
      <Live label="role for the new member" options={ROLES} initial="reader" size="tiny" />
      <Live
        label="expires in"
        initial="90d"
        options={[
          { value: "90d", label: "90 days" },
          { value: "1y", label: "1 year" },
          { value: "", label: "never" },
        ]}
      />
    </Stack>
  ),
};

/**
 * The state UploadApp spends most of its life in.
 *
 * "choose a drop…" is a real value, not decoration: until it is replaced the
 * drop surface below is disabled and says why. The placeholder option stays
 * selectable so that state is reachable again after a wrong choice.
 */
export const WithPlaceholder: Story = {
  render: () => (
    <Stack gap={2}>
      <Live
        label="drop"
        placeholder="choose a drop…"
        options={[
          { value: "lab", label: "lab" },
          { value: "field-trial", label: "field-trial" },
        ]}
      />
      <Text size="tiny" tone="faint" prose>
        Only drops the caller may write to are offered. Listing the rest would be offering a
        guaranteed 403.
      </Text>
    </Stack>
  ),
};

/** No writable drops at all — a first-day account sees exactly this. */
export const Empty: Story = {
  render: () => (
    <Stack gap={2}>
      <Live label="drop" placeholder="choose a drop…" options={[]} />
      <Text size="tiny" tone="faint">
        you are not a writer on any drop yet
      </Text>
    </Stack>
  ),
};

export const Disabled: Story = {
  render: () => <Live label="expires in" options={ROLES} initial="reader" disabled />,
};
