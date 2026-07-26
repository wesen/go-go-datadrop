import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldChip } from "./FieldChip";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { readings } from "../../../fixtures";

/**
 * A field, as a live presentation.
 *
 * Unlike `Chip`, this one wraps itself in `Presentation` — right-click opens
 * the verbs that apply to a field, hover writes the mouse-doc line — so it
 * needs the PBUI provider the global decorator supplies.
 */
const meta = {
  title: "Design System/Atoms/FieldChip",
  component: FieldChip,
  parameters: { tile: false, pbui: { table: readings } },
  args: { field: { docId: "d1", name: "temp_c" } },
} satisfies Meta<typeof FieldChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every column of the readings fixture, with its type and provenance badges. */
export const EveryFieldInAFixture: Story = {
  render: () => (
    <Stack direction="row" gap={3} wrap align="center">
      {readings.fields.map((field) => (
        <FieldChip key={field.name} field={{ docId: "d1", name: field.name }} />
      ))}
    </Stack>
  ),
};

/**
 * A field the pipeline no longer produces.
 *
 * This is the state EncodingEditor.tsx got wrong: it rendered as an empty
 * select while the spec still held the dead name and the plot silently refused.
 * The warning glyph and the dashed border carry it; hover for the sentence.
 */
export const Stale: Story = {
  render: () => (
    <Stack gap={3}>
      <FieldChip field={{ docId: "d1", name: "a_field_a_step_removed" }} />
      <Text size="tiny" tone="faint" prose>
        Not in the pipeline output. Distinguishable without colour: dashed border, ⚠ appended to the
        label.
      </Text>
    </Stack>
  ),
};

/** An ambient field — one that names no document, so verbs land on the active one. */
export const Ambient: Story = {
  render: () => <FieldChip field={{ docId: null, name: "temp_c" }} />,
};
