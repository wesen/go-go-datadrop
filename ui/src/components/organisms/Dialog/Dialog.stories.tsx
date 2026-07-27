import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "./Dialog";
import { Button, TextInput } from "../../atoms";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * The only modal in the tree.
 *
 * Deliberately not `<dialog showModal()>`: the native element renders in the
 * **top layer**, above everything, and the object menu — a positioned `div` at
 * `z-index: 100` — would then render behind it. That breaks right-clicking
 * inside a dialog, and it breaks the pending-accept flow, where an accept
 * started from a dialog must be satisfiable by clicking a presentation in a
 * tile. The top layer is not a z-index you can out-bid.
 */
const meta = {
  title: "Component Library/Organisms/Dialog",
  component: Dialog,
  parameters: { tile: false, layout: "fullscreen" },
  args: { title: "A dialog", onClose: () => {}, children: null },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A dialog with something to read and two ways out. */
export const Default: Story = {
  render: () => (
    <Dialog
      title="Copied to the clipboard"
      onClose={() => {}}
      footer={
        <Button variant="raised" fill="var(--pbui-tone-source)">
          OK
        </Button>
      }
    >
      <Text size="small" prose>
        A workspace “explore”: 3 tiles, 1 document, reading sensors / readings. 2 kB. It names the
        sources these tiles read and the filters you set on them. It contains no rows and no
        credentials.
      </Text>
    </Dialog>
  ),
};

/**
 * The invariant, not the appearance: **the backdrop does not dismiss.**
 *
 * Click-away is the usual affordance and it is wrong here. This dialog holds
 * text the user has pasted, and a stray click on the backdrop would discard it
 * with no undo. Two explicit routes out — Escape and the ✕ — both of which the
 * user aimed at. Type into the field and click the grey area to see nothing
 * happen.
 */
export const BackdropDoesNotDismiss: Story = {
  render: () => {
    function Live() {
      const [open, setOpen] = useState(true);
      const [text, setText] = useState("something you would hate to lose");
      if (!open) {
        return <Button onClick={() => setOpen(true)}>Re-open</Button>;
      }
      return (
        <Dialog
          title="Click the backdrop"
          onClose={() => setOpen(false)}
          footer={<Button onClick={() => setOpen(false)}>Close</Button>}
        >
          <Stack gap={3}>
            <TextInput label="something typed" value={text} onValueChange={setText} width="fill" />
            <Text size="tiny" tone="faint" prose>
              Escape and ✕ close this. The backdrop does not.
            </Text>
          </Stack>
        </Dialog>
      );
    }
    return <Live />;
  },
};

/**
 * The awkward mode: more content than the viewport.
 *
 * The PANEL scrolls, not the backdrop. A backdrop that scrolls moves the panel
 * out from under the cursor while the user is reaching for a button in it.
 */
export const Overflowing: Story = {
  render: () => (
    <Dialog title="A long dialog" onClose={() => {}} footer={<Button>Close</Button>}>
      <Stack gap={2}>
        {Array.from({ length: 40 }, (_, i) => (
          <Text key={i} size="small" prose>
            Line {i + 1} — the panel is capped at the viewport height and scrolls inside itself.
          </Text>
        ))}
      </Stack>
    </Dialog>
  ),
};
