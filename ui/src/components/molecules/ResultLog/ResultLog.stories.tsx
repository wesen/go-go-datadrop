import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { ResultLog, type ResultLine, type ResultSegment } from "./ResultLog";
import { Button } from "../../atoms";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * An output history whose entries are objects rather than strings.
 *
 * From the shell prototype's `ListenerApp` (`pbui-shell(1).jsx:376-441`) — the
 * half of a CLIM listener that matters. The reading and evaluating are
 * ordinary; the printing is not. Every result is a live object, so the output
 * history becomes a source of input for the *next* command.
 *
 * The `Chaining` story below is the one to read: it shows a result being
 * produced and then re-used as an argument, which is the entire point and the
 * thing a screenshot of a text log cannot show.
 */
const text = (t: string): ResultSegment => ({ kind: "text", text: t });
const num = (n: number): ResultSegment => ({
  kind: "object",
  ptype: "datum",
  value: n,
  label: String(n),
  tone: "var(--pbui-type-q)",
});

const LINES: ResultLine[] = [
  { id: "1", segments: [text("describe")], echo: true },
  {
    id: "2",
    segments: [
      text("described "),
      {
        kind: "object",
        ptype: "field",
        value: "data.temp_c",
        label: "data.temp_c",
        tone: "var(--pbui-tone-field)",
      },
      text(" → see inspector"),
    ],
  },
  { id: "3", segments: [text("3 + 4")], echo: true },
  { id: "4", segments: [text("3 + 4 = "), num(7)] },
  { id: "5", segments: [text("sum")], echo: true },
  { id: "6", segments: [text("7 + "), num(7), text(" = "), num(14)] },
];

const meta = {
  title: "Component Library/Molecules/ResultLog",
  component: ResultLog,
  parameters: { tile: false },
  args: { lines: LINES, label: "listener output" },
} satisfies Meta<typeof ResultLog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * With no `renderObject`, the objects render as plain chips and do nothing.
 *
 * That is the seam working as intended, and it is why this molecule can be
 * storied with no provider at all. Phase 6 showed what the alternative costs:
 * `TracePanel` grew one presentation and every story in its file began throwing
 * `usePbui outside a PbuiProvider` at render time, while the test suite stayed
 * green because nothing renders a story.
 */
export const NoWrapper: Story = {
  render: () => (
    <Stack gap={3}>
      <ResultLog lines={LINES} label="unwrapped" />
      <Text>
        The chips are inert here. A caller that wants them live passes `renderObject` and wraps each
        one in `&lt;Presentation&gt;` — the log itself never imports it.
      </Text>
    </Stack>
  ),
};

/**
 * The property the whole widget exists for: a result becomes an argument.
 *
 * Click a number to feed it into the pending sum. The second operand in line 6
 * of the default story got there this way — it is the *output* of line 4, not
 * something typed.
 */
export const Chaining: Story = {
  render: function ChainingStory() {
    const [lines, setLines] = useState<ResultLine[]>([
      { id: "seed", segments: [text("Click a number below to use it as an argument.")] },
      { id: "s1", segments: [text("seeded "), num(3), text(" and "), num(4)] },
    ]);
    const [, setPending] = useState<number[]>([]);
    // A ref, not a render-scoped `let`. Ids are React keys, and a counter that
    // resets on every render can hand out one that is already in use — two
    // clicks landing in a single tick were enough to do it.
    const seq = useRef(0);
    const nextId = (prefix: string) => `${prefix}${(seq.current += 1)}`;

    // Both updates are functional. Reading `pending` from the closure means two
    // clicks in one tick both see the value from the render they were created
    // in, so the second operand is discarded and the sum never happens. A real
    // user is unlikely to hit it; a test driving the story synchronously hits it
    // every time, which is how it was found.
    const pick = (n: number) => {
      setPending((current) => {
        if (current.length < 1) {
          setLines((l) => [
            ...l,
            {
              id: nextId("p"),
              segments: [text("SUM — first operand "), num(n), text(", click another")],
            },
          ]);
          return [n];
        }
        const a = current[0] as number;
        setLines((l) => [
          ...l,
          { id: nextId("r"), segments: [text(`${a} + ${n} = `), num(a + n)] },
        ]);
        return [];
      });
    };

    return (
      <Stack gap={3}>
        <SectionLabel>every number below is clickable, including results</SectionLabel>
        <ResultLog
          lines={lines}
          label="chaining"
          renderObject={(segment, body) => (
            <button
              type="button"
              onClick={() => pick(Number(segment.value))}
              style={{ all: "unset", cursor: "pointer" }}
            >
              {body}
            </button>
          )}
        />
        <Button
          variant="framed"
          size="tiny"
          onClick={() => {
            setLines((l) => l.slice(0, 2));
            setPending([]);
          }}
        >
          reset
        </Button>
        <Text>
          A real caller wraps each object in `&lt;Presentation&gt;` instead of a bare button, which
          gives it the object menu, the accept protocol and the mouse-doc line for free. The button
          here keeps the story provider-free.
        </Text>
      </Stack>
    );
  },
};

/** Echoed commands are dimmed and prefixed, so the eye lands on results. */
export const Echo: Story = {
  args: {
    lines: [
      { id: "a", segments: [text("3 + 4")], echo: true },
      { id: "b", segments: [text("3 + 4 = "), num(7)] },
      { id: "c", segments: [text("not-a-command")], echo: true },
      { id: "d", segments: [text("(tip: the buttons above read objects, not strings)")] },
    ],
  },
};

/** Empty, and empty with a caller-supplied message. */
export const Empty: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>default</SectionLabel>
        <ResultLog lines={[]} label="empty" />
      </Stack>
      <Stack gap={2}>
        <SectionLabel>with a message</SectionLabel>
        <ResultLog lines={[]} label="empty with message" empty="No results yet — run a command." />
      </Stack>
    </Stack>
  ),
};

/** A long line of mixed prose and objects wraps rather than scrolling sideways. */
export const Wrapping: Story = {
  args: {
    lines: [
      {
        id: "long",
        segments: [
          text("joined "),
          {
            kind: "object",
            ptype: "source",
            value: "a",
            label: "readings/events",
            tone: "var(--pbui-tone-source)",
          },
          text(" with "),
          {
            kind: "object",
            ptype: "source",
            value: "b",
            label: "census/2026",
            tone: "var(--pbui-tone-source)",
          },
          text(" on "),
          {
            kind: "object",
            ptype: "field",
            value: "c",
            label: "station",
            tone: "var(--pbui-tone-field)",
          },
          text(" producing "),
          num(4820),
          text(" rows, of which "),
          num(112),
          text(" had no match on the right-hand side and were dropped"),
        ],
      },
    ],
  },
};
