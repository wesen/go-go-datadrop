import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChannelRow } from "./ChannelRow";
import { CHANNELS } from "../../../model/chart";
import type { Channel } from "../../../model/chart";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { FieldChip } from "../../atoms";
import { readings } from "../../../fixtures";

/**
 * One encoding channel, and the field mapped into it.
 *
 * This component existed **twice** before it existed once: in `EncodingApp`,
 * and again in `pbui/Pbui.stories.tsx`, which needed a channel row to
 * demonstrate the accept protocol, had nothing to import, and wrote its own.
 * The two had been drifting since. That is the same failure as the six copies
 * of the button style in a different costume, and it is the cleanest argument
 * that "a component with no story" and "a story with no component" are one
 * problem.
 */
const meta = {
  title: "Component Library/Molecules/ChannelRow",
  component: ChannelRow,
  parameters: { tile: false, pbui: { table: readings } },
  args: { channel: "x", mapped: null, onAcceptRequest: () => {}, onClear: () => {} },
} satisfies Meta<typeof ChannelRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every channel, and what each will accept. */
export const EveryChannel: Story = {
  render: () => (
    <Stack gap={2}>
      {CHANNELS.map((channel) => (
        <ChannelRow
          key={channel}
          channel={channel}
          mapped={null}
          onAcceptRequest={() => {}}
          onClear={() => {}}
        />
      ))}
    </Stack>
  ),
};

export const Mapped: Story = {
  render: () => (
    <Stack gap={2}>
      <ChannelRow channel="x" mapped="ts" onAcceptRequest={() => {}} onClear={() => {}} />
      <ChannelRow channel="y" mapped="temp_c" onAcceptRequest={() => {}} onClear={() => {}} />
    </Stack>
  ),
};

/**
 * A mapping whose field the pipeline no longer produces.
 *
 * This is the defect `EncodingEditor.tsx` shipped: the select read as *unset*
 * while the spec still held the dead name, so the plot refused and nothing on
 * screen said why. STALE plus the sentence is the fix, and neither is carried
 * by colour alone.
 */
export const Stale: Story = {
  render: () => (
    <ChannelRow
      channel="y"
      mapped="a_field_a_step_removed"
      stale
      onAcceptRequest={() => {}}
      onClear={() => {}}
    />
  ),
};

/**
 * The seam, with a live chip in it.
 *
 * EncodingApp passes `renderMapped` so the field is a real presentation —
 * right-click it and you get the field's verbs. The default renders its name,
 * which is why the stories above need no provider.
 */
export const WithLivePresentations: Story = {
  render: function Render() {
    const [mapping, setMapping] = useState<Partial<Record<Channel, string>>>({
      x: "ts",
      y: "temp_c",
    });
    return (
      <Stack gap={2}>
        {CHANNELS.map((channel) => (
          <ChannelRow
            key={channel}
            channel={channel}
            mapped={mapping[channel] ?? null}
            onAcceptRequest={() => setMapping((m) => ({ ...m, [channel]: "temp_c" }))}
            onClear={() => setMapping((m) => ({ ...m, [channel]: undefined }))}
            renderMapped={(name) => <FieldChip field={{ docId: "d1", name }} />}
          />
        ))}
        <Text size="tiny" tone="faint" prose>
          ⌖ maps a field; × clears it. Right-click a chip for the field's verbs.
        </Text>
      </Stack>
    );
  },
};
