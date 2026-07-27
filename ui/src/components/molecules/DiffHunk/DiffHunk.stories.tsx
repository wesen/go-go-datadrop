import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DiffHunk, type Hunk } from "./DiffHunk";
import { Button } from "../../atoms";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * One hunk of a text diff, unified or side by side.
 *
 * Distinct from `SpecDiff`, which compares two chart *specifications* — two
 * objects, field by field. They share the word "diff" and little else: one
 * reports that a geom changed from bar to line, the other that line 42 became
 * two lines.
 *
 * Takes an already-computed hunk. Computing one is a different job with
 * different tests, and a renderer that also diffs cannot be exercised with a
 * literal.
 */
const HUNK: Hunk = {
  beforeStart: 41,
  afterStart: 41,
  added: 3,
  removed: 1,
  rows: [
    {
      op: "context",
      text: "export async function loadSession(id: string) {",
      before: 41,
      after: 41,
    },
    { op: "remove", text: "  return db.session.find(id);", before: 42, after: null },
    { op: "add", text: "  const s = await db.session.find(id);", before: null, after: 42 },
    {
      op: "add",
      text: "  if (!s || s.expiresAt < Date.now()) return null;",
      before: null,
      after: 43,
    },
    { op: "add", text: "  return s;", before: null, after: 44 },
    { op: "context", text: "}", before: 43, after: 45 },
  ],
};

const meta = {
  title: "Component Library/Molecules/DiffHunk",
  component: DiffHunk,
  parameters: { tile: false },
  args: { hunk: HUNK },
} satisfies Meta<typeof DiffHunk>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unified: Story = {};

export const Split: Story = { args: { split: true } };

/**
 * The same hunk both ways, so a reviewer can check they agree.
 *
 * They must show the same six rows and the same counts. The split view's only
 * job is to pair them differently: a context row goes to both sides, a removal
 * to the left, an addition to the right, and the shorter column is padded with
 * blanks so the two stay in step.
 */
export const BothViews: Story = {
  render: function BothViewsStory() {
    const [split, setSplit] = useState(false);
    return (
      <Stack gap={3}>
        <Button variant="framed" size="tiny" onClick={() => setSplit(!split)}>
          {split ? "show unified" : "show split"}
        </Button>
        <SectionLabel>{split ? "split" : "unified"}</SectionLabel>
        <DiffHunk hunk={HUNK} split={split} />
        <Text>
          One removal answered by three additions leaves two padded cells on the left in split view.
          Those blanks are information — they are what "the file grew here" looks like.
        </Text>
      </Stack>
    );
  },
};

/**
 * Blank lines inside a hunk, which is the case that silently breaks alignment.
 *
 * Each empty row still occupies a full line, so the gutters stay in step with
 * the text beside them.
 */
export const WithBlankLines: Story = {
  args: {
    hunk: {
      beforeStart: 8,
      afterStart: 8,
      added: 2,
      removed: 0,
      rows: [
        { op: "context", text: "import { db } from '../db';", before: 8, after: 8 },
        { op: "context", text: "", before: 9, after: 9 },
        { op: "add", text: "const TTL_MS = 604_800_000;", before: null, after: 10 },
        { op: "add", text: "", before: null, after: 11 },
        { op: "context", text: "export type Session = {", before: 10, after: 12 },
      ],
    },
  },
};

/**
 * The cap. A generated file produces hunks of thousands of rows, and each row
 * is a flex container with three children.
 *
 * Set low here so the `MoreBar` is visible without scrolling; the default is
 * 160.
 */
export const Capped: Story = {
  args: {
    cap: 6,
    hunk: {
      beforeStart: 1,
      afterStart: 1,
      added: 40,
      removed: 0,
      rows: Array.from({ length: 40 }, (_, i) => ({
        op: "add" as const,
        text: `  generated line ${i + 1} — this file is machine-written`,
        before: null,
        after: i + 1,
      })),
    },
  },
};

/** A hunk with nothing in it renders its header and an empty body. */
export const Empty: Story = {
  args: {
    hunk: { beforeStart: 0, afterStart: 0, added: 0, removed: 0, rows: [] },
  },
};
