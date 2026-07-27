import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeLine } from "./CodeLine";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * One line of source, with the two line-number gutters a diff needs.
 *
 * Built for `DiffHunk` but usable on its own for any numbered listing. Dumb, as
 * every atom here is: it knows nothing about diffs, hunks or files, and it does
 * not decide which lines to show.
 */
const meta = {
  title: "Design System/Atoms/CodeLine",
  component: CodeLine,
  parameters: { tile: false },
  args: { text: "  const ttl = 1000 * 60 * 60 * 24 * 7;", before: 12, after: 12 },
} satisfies Meta<typeof CodeLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The three ops, as they appear in sequence.
 *
 * A removed line has no "after" number and an added line has no "before" one.
 * That asymmetry is the whole reason there are two gutters rather than one.
 */
export const Ops: Story = {
  render: () => (
    <Stack gap={0}>
      <CodeLine before={41} after={41} text="export async function loadSession(id: string) {" />
      <CodeLine before={42} after={null} op="remove" text="  return db.session.find(id);" />
      <CodeLine before={null} after={42} op="add" text="  const s = await db.session.find(id);" />
      <CodeLine
        before={null}
        after={43}
        op="add"
        text="  if (!s || s.expiresAt < Date.now()) return null;"
      />
      <CodeLine before={null} after={44} op="add" text="  return s;" />
      <CodeLine before={43} after={45} text="}" />
    </Stack>
  ),
};

/**
 * The blank-line case — the one that is easy to miss and expensive to get wrong.
 *
 * An empty string renders as a non-breaking space so the row keeps its height.
 * Without it, every blank line in a hunk collapses to zero height and the two
 * gutters drift out of alignment with the text beside them. The diff still
 * *looks* like a diff; it is just a wrong one, which is the worst failure mode
 * available to a rendering component.
 */
export const BlankLines: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack gap={2}>
        <SectionLabel>a hunk containing blank lines</SectionLabel>
        <Stack gap={0}>
          <CodeLine before={8} after={8} text="import { db } from '../db';" />
          <CodeLine before={9} after={9} text="" />
          <CodeLine before={null} after={10} op="add" text="const TTL_MS = 604_800_000;" />
          <CodeLine before={null} after={11} op="add" text="" />
          <CodeLine before={10} after={12} text="export type Session = {" />
        </Stack>
      </Stack>
      <Text>
        Rows 9 and 11 are empty and still occupy a full line. Compare the gutter numbers down the
        left edge — they stay in step with the text.
      </Text>
    </Stack>
  ),
};

/**
 * `ownerTone` is the blame edge: who last wrote this line.
 *
 * Rendered as a 4px left border and nothing else, because blame is secondary
 * information. A background colour here would compete with the add/remove
 * tones, which are the primary signal in the same rows.
 */
export const Blame: Story = {
  render: () => (
    <Stack gap={0}>
      <CodeLine
        before={1}
        after={1}
        text="function verify(token: string) {"
        ownerTone="var(--pbui-tone-field)"
      />
      <CodeLine
        before={2}
        after={2}
        text="  const claims = decode(token);"
        ownerTone="var(--pbui-tone-field)"
      />
      <CodeLine
        before={3}
        after={3}
        text="  if (!claims) return null;"
        ownerTone="var(--pbui-tone-step)"
      />
      <CodeLine before={4} after={4} text="  return claims;" ownerTone="var(--pbui-tone-source)" />
      <CodeLine before={5} after={5} text="}" />
    </Stack>
  ),
};

/**
 * `bare` drops both gutters, for a plain listing that is not a diff.
 *
 * Long lines wrap rather than forcing the container to scroll sideways; the
 * last row here has no spaces at all, which is the case `word-break` exists for.
 */
export const Bare: Story = {
  render: () => (
    <Stack gap={0}>
      <CodeLine bare text="{" />
      <CodeLine bare text='  "specversion": "1.0",' />
      <CodeLine bare text='  "id": "01KYGJWGGTYSKJ8SE9NJMYXCN5",' />
      <CodeLine
        bare
        text="  aVeryLongUnbrokenIdentifierWithNoSpacesAtAllWhichMustWrapSomewhereOrItPushesTheContainerWider"
      />
    </Stack>
  ),
};
