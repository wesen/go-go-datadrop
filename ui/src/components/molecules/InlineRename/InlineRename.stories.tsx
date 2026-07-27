import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { InlineRename } from "./InlineRename";
import { Stack, Toolbar } from "../../layout";
import { Button } from "../../atoms";
import { Text } from "../../foundation";

/**
 * Rename in place: commit on Enter, discard on Escape, cancel on blur.
 *
 * **Uncontrolled, deliberately, and that is why this is not `TextInput`.** The
 * value is read once when Enter is pressed and never tracked; there is no state
 * to keep in sync because the edit either lands whole or does not happen. A
 * controlled field would add a `useState` per rename that exists only to be
 * thrown away, and would make Escape mean "put the old value back" rather than
 * "there was never an edit".
 *
 * The DATADROP-6 phase 2 substitution left this element raw for exactly that
 * reason, and this component is where the reason now lives.
 */
const meta = {
  title: "Component Library/Molecules/InlineRename",
  component: InlineRename,
  parameters: { tile: false },
  args: {
    initial: "explore",
    label: "workspace name",
    fallback: "explore",
    onCommit: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof InlineRename>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Live: type and press Enter, or press Escape. */
export const Live: Story = {
  render: function Render() {
    const [name, setName] = useState("explore");
    const [editing, setEditing] = useState(false);
    const [last, setLast] = useState<string | null>(null);
    return (
      <Stack gap={3}>
        <Toolbar tight>
          {editing ? (
            <InlineRename
              initial={name}
              label="workspace name"
              fallback={name}
              onCommit={(next) => {
                setName(next);
                setLast(`committed "${next}"`);
                setEditing(false);
              }}
              onCancel={() => {
                setLast("cancelled — no change");
                setEditing(false);
              }}
            />
          ) : (
            <Button variant="framed" size="tiny" onClick={() => setEditing(true)}>
              {name}
            </Button>
          )}
        </Toolbar>
        {last && (
          <Text size="tiny" tone="faint">
            {last}
          </Text>
        )}
        <Text size="tiny" tone="faint" prose>
          Enter commits, Escape discards, clicking away cancels. Try committing an empty field: it
          falls back to the current name, because a workspace called "" is unreachable — there is
          nothing to click.
        </Text>
      </Stack>
    );
  },
};

/**
 * In the row it lives in.
 *
 * The field is sized so the strip does not jump when a name becomes an input.
 * A row that reflows on every double-click makes the workspace you were aiming
 * at move out from under the pointer.
 */
export const DoesNotShiftTheRow: Story = {
  render: () => (
    <Toolbar tight>
      <Button variant="framed" size="tiny">
        welcome
      </Button>
      <InlineRename
        initial="explore"
        label="workspace name"
        fallback="explore"
        onCommit={() => {}}
        onCancel={() => {}}
      />
      <Button variant="framed" size="tiny">
        gallery
      </Button>
    </Toolbar>
  ),
};
