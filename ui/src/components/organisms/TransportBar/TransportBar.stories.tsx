import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TransportBar } from "./TransportBar";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * A cursor into a history.
 *
 * The design system had no such control before DATADROP-11. The trace was a
 * write-only log — rendered top to bottom, with no way to ask about any single
 * entry — and this is the only thing that was missing to make it navigable.
 *
 * The `note` is not decoration. This transport selects and explains an entry;
 * it does not roll the workbench back. An interface that looks like time travel
 * and is not is worse than one that says plainly what it is.
 */
const meta = {
  title: "Component Library/Organisms/TransportBar",
  component: TransportBar,
  parameters: { tile: false },
  args: { length: 31, cursor: 13, onCursor: () => {} },
} satisfies Meta<typeof TransportBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Driven, so the buttons and the scrubber can be exercised. */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [cursor, setCursor] = useState(4);
    const verbs = [
      "newDoc",
      "setSource data/readings",
      "setMapping x ← time",
      "setMapping y ← data.temp_c",
      "addFilter data.temp_c > 20",
      "setGeom line",
      "addSummarize by station",
      "snapshot",
    ];
    return (
      <Stack gap={3}>
        <TransportBar
          length={verbs.length}
          cursor={cursor}
          onCursor={setCursor}
          currentLabel={<strong>{verbs[cursor]}</strong>}
          note="Reviewing this entry — it shows what the verb did; it does not roll the workbench back."
        />
        <Text>
          Arrow keys work on the scrubber, and so do Home and End, because it is a real `input
          type=range` rather than a hand-rolled slider.
        </Text>
      </Stack>
    );
  },
};

/**
 * The bounds, which are enforced in the handler rather than by the buttons.
 *
 * At either end the corresponding pair disables, but the arithmetic that would
 * have corrected an out-of-range value runs anyway — so a caller passing a
 * cursor of 99 into a 31-entry trace gets the last entry, not a crash and not a
 * blank panel.
 */
export const Bounds: Story = {
  render: () => (
    <Stack gap={4}>
      {[
        ["at the start", 0, 31],
        ["at the end", 30, 31],
        ["out of range — cursor 99 of 31", 99, 31],
        ["negative — cursor −4", -4, 31],
      ].map(([caption, cur, len]) => (
        <Stack key={caption as string} gap={1}>
          <SectionLabel>{caption as string}</SectionLabel>
          <TransportBar length={len as number} cursor={cur as number} onCursor={() => {}} />
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * An empty history.
 *
 * Every control disables and the position reads "—" rather than "1 / 0", which
 * is a sentence that describes no possible state.
 */
export const Empty: Story = {
  args: { length: 0, cursor: 0 },
};

/** A single entry: there is nowhere to go, and every control says so. */
export const Single: Story = {
  args: { length: 1, cursor: 0, currentLabel: "newDoc" },
};
