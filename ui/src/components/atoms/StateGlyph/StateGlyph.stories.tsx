import type { Meta, StoryObj } from "@storybook/react-vite";
import { StateGlyph } from "./StateGlyph";
import type { GlyphState } from "./StateGlyph";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * A state carried by a character rather than by a colour.
 *
 * The upload queue distinguished its six states with a word inside a faint grey
 * span, which fails the rule Chip.module.css states first: meaning is never
 * carried by colour alone. Print this page in greyscale — ✓, ✕ and · are still
 * three different things.
 */
const meta = {
  title: "Design System/Atoms/StateGlyph",
  component: StateGlyph,
  parameters: { tile: false },
  args: { state: "done" },
} satisfies Meta<typeof StateGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

const STATES: [GlyphState, string][] = [
  ["queued", "waiting for a slot — three run at once"],
  ["hashing", "computing the digest, up to 64 MiB"],
  ["mounting", "the server already had these bytes"],
  ["sending", "transferring"],
  ["done", "stored, not yet visible to a reader"],
  ["failed", "see the message beside it"],
];

export const TheUploadLifecycle: Story = {
  render: () => (
    <Stack gap={2}>
      {STATES.map(([state, note]) => (
        <Stack key={state} direction="row" gap={3} align="baseline">
          <StateGlyph state={state} />
          <Text size="small">{state}</Text>
          <Text size="tiny" tone="faint">
            {note}
          </Text>
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * The glyphs form a column, which is the point of the fixed width.
 *
 * A ✓ wider than a · makes the paths beside them ragged, and a queue of thirty
 * files is read by scanning that left edge.
 */
export const AsAColumn: Story = {
  render: () => (
    <Stack gap={1}>
      {(["done", "done", "sending", "queued", "failed", "queued"] as GlyphState[]).map(
        (state, i) => (
          <Stack key={i} direction="row" gap={2} align="baseline">
            <StateGlyph state={state} />
            <Text size="small">readings-{String(i + 1).padStart(3, "0")}.csv</Text>
          </Stack>
        ),
      )}
    </Stack>
  ),
};
