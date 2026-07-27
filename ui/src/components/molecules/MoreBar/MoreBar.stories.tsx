import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MoreBar } from "./MoreBar";
import { CodeLine } from "../../atoms";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * The bounded-list control.
 *
 * Distinct from `TruncationNotice`, which is the other half of the same problem
 * and is deliberately not interactive. A truncation notice says the data is a
 * sample of something the client never received — there is nothing to reveal,
 * and the fix is to raise the row budget. A MoreBar says the client has
 * everything and is choosing not to paint it, which the reader may overrule.
 */
const meta = {
  title: "Component Library/Molecules/MoreBar",
  component: MoreBar,
  parameters: { tile: false },
  args: { hidden: 1240, what: "lines", onReveal: () => {} },
} satisfies Meta<typeof MoreBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Counts go through the shared short-number formatter. */
export const Counts: Story = {
  render: () => (
    <Stack gap={2}>
      {[3, 42, 900, 1240, 18_400, 2_100_000].map((n) => (
        <MoreBar key={n} hidden={n} what="rows" onReveal={() => {}} />
      ))}
    </Stack>
  ),
};

/**
 * Nothing hidden renders nothing at all.
 *
 * That is what lets a caller place it unconditionally at the foot of a list
 * instead of guarding every call site — and guards at call sites are where the
 * "0 more rows — click to show" bugs come from.
 */
export const Empty: Story = {
  render: () => (
    <Stack gap={2}>
      <SectionLabel>hidden = 0, and hidden = −5</SectionLabel>
      <div style={{ border: "var(--pbui-border-hair)", padding: "var(--pbui-space-2)" }}>
        <MoreBar hidden={0} what="rows" onReveal={() => {}} />
        <MoreBar hidden={-5} what="rows" onReveal={() => {}} />
        <Text size="tiny" tone="faint">
          the bordered box is empty — both rendered null
        </Text>
      </div>
    </Stack>
  ),
};

/** In its actual habitat: the foot of a capped list. */
export const InAList: Story = {
  render: function InAListStory() {
    const [shown, setShown] = useState(4);
    const all = Array.from({ length: 40 }, (_, i) => `  line number ${i + 1} of the file`);
    const visible = all.slice(0, shown);
    return (
      <Stack gap={0}>
        {visible.map((text, i) => (
          <CodeLine key={text} before={i + 1} after={i + 1} text={text} />
        ))}
        <MoreBar
          hidden={all.length - visible.length}
          what="lines"
          onReveal={() => setShown(all.length)}
        />
      </Stack>
    );
  },
};
