import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TextInput } from "./TextInput";
import type { TextInputProps } from "./TextInput";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * A live field, because a controlled input rendered with a fixed `value` and no
 * handler cannot be typed into — and a story you cannot type into does not tell
 * you whether the component works.
 */
function Live({ initial = "", ...props }: Omit<TextInputProps, "value" | "onValueChange"> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TextInput value={value} onValueChange={setValue} {...props} />;
}

const meta = {
  title: "Design System/Atoms/TextInput",
  component: TextInput,
  parameters: { tile: false },
  // Required because every prop below is required on the component. Each story
  // renders `Live` instead, so these are the control-panel defaults rather than
  // what any story shows.
  args: { label: "dataset name", value: "", onValueChange: () => {} },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The four call sites this component replaced, as they appear in the app. */
export const TheFourItReplaced: Story = {
  render: () => (
    <Stack gap={3}>
      <Live label="dataset name" placeholder="readings" />
      <Live label="token name" placeholder="ci ingest" />
      <Live label="add a member to lab" placeholder="colleague@example.org" type="email" width="wide" />
      <Live label="bearer token" type="password" initial="hunter2hunter2" />
      <Text size="tiny" tone="faint" prose>
        UploadApp, TokensApp, MemberList and SignInApp each wrote the same four
        style properties inline, character for character (guide §7.3).
      </Text>
    </Stack>
  ),
};

export const Empty: Story = {
  render: () => (
    <Stack gap={2}>
      <Live label="dataset name" placeholder="readings" />
      <Text size="tiny" tone="faint">
        The placeholder is faint, not the value colour — an empty field must not
        read as a filled one.
      </Text>
    </Stack>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Stack gap={2}>
      <Live label="add a member" initial="not-an-address" invalid width="wide" />
      <Text size="tiny" tone="danger">
        no datadrop account has that address yet
      </Text>
      <Text size="tiny" tone="faint" prose>
        Dashed as well as red. The border style carries the state on a
        monochrome display, which is the rule Chip.module.css named first.
      </Text>
    </Stack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Stack gap={2}>
      <Live label="token name" placeholder="ci ingest" disabled />
      <Text size="tiny" tone="faint" prose>
        TokensApp shows the mint form disabled with the reason beside it, rather
        than hiding it: a rule you cannot see is a rule you cannot learn.
      </Text>
    </Stack>
  ),
};

export const Widths: Story = {
  render: () => (
    <Stack gap={2}>
      <Live label="narrow" width="narrow" initial="90" />
      <Live label="normal" width="normal" initial="readings" />
      <Live label="wide" width="wide" initial="colleague@example.org" />
    </Stack>
  ),
};
