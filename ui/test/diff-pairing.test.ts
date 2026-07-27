import { describe, expect, test } from "bun:test";
import { pairRows } from "../src/components/molecules/DiffHunk/DiffHunk";
import type { DiffRow } from "../src/components/molecules/DiffHunk/DiffHunk";

/**
 * The side-by-side pairing rule, tested with literals and no DOM.
 *
 * This test exists because the obvious implementation is wrong in a way that
 * looks right. Push context rows to both sides, removals to the left and
 * additions to the right, then render to the longer column: it is what the
 * agent-workbench prototype does at `pbui-agent-workbench(1).jsx:2280-2284`,
 * it was the first version here, and it passes every balanced hunk.
 *
 * It fails on an unbalanced one. The two columns advance at different rates
 * through a change with more additions than removals, nothing re-synchronises
 * them, and every context row after that change faces an addition instead of
 * facing itself. Both columns still hold the right rows in the right order, so
 * the output reads as a plausible diff while asserting that unrelated lines
 * correspond — which is the worst thing a diff can do.
 *
 * The pairing was extracted from the component precisely so it could be pinned
 * here. Geometry needs a browser; this does not.
 */

const ctx = (text: string, before: number, after: number): DiffRow => ({
  op: "context",
  text,
  before,
  after,
});
const del = (text: string, before: number): DiffRow => ({
  op: "remove",
  text,
  before,
  after: null,
});
const add = (text: string, after: number): DiffRow => ({
  op: "add",
  text,
  before: null,
  after,
});

describe("split-view pairing keeps the two columns in step", () => {
  test("a context row always faces itself", () => {
    // One removal answered by three additions: the case that breaks the naive
    // version. The closing brace must face the closing brace.
    const rows: DiffRow[] = [
      ctx("export async function loadSession(id: string) {", 41, 41),
      del("  return db.session.find(id);", 42),
      add("  const s = await db.session.find(id);", 42),
      add("  if (!s || s.expiresAt < Date.now()) return null;", 43),
      add("  return s;", 44),
      ctx("}", 43, 45),
    ];

    const pairs = pairRows(rows);
    const misaligned = pairs.filter(
      ([l, r]) => (l?.op === "context" || r?.op === "context") && l?.text !== r?.text,
    );

    expect(
      misaligned.map(([l, r]) => `${l?.text ?? "—"}  ||  ${r?.text ?? "—"}`),
      "a context row faced something other than itself — the columns have drifted",
    ).toEqual([]);
  });

  test("the closing context row is the last pair on both sides", () => {
    const rows: DiffRow[] = [
      ctx("a", 1, 1),
      del("b", 2),
      add("b1", 2),
      add("b2", 3),
      ctx("c", 3, 4),
    ];

    const pairs = pairRows(rows);
    const [lastLeft, lastRight] = pairs[pairs.length - 1] as [DiffRow, DiffRow];

    expect(lastLeft.text).toBe("c");
    expect(lastRight.text).toBe("c");
  });

  test("within a change block the pairing is positional, so a substitution reads as one", () => {
    const rows: DiffRow[] = [
      del("old one", 1),
      del("old two", 2),
      add("new one", 1),
      add("new two", 2),
    ];

    expect(pairRows(rows).map(([l, r]) => [l?.text, r?.text])).toEqual([
      ["old one", "new one"],
      ["old two", "new two"],
    ]);
  });

  test("the shorter side of a block is padded, and the padding is on the correct side", () => {
    // Three removals, one addition: two blanks belong on the RIGHT.
    const rows: DiffRow[] = [del("x", 1), del("y", 2), del("z", 3), add("q", 1)];

    expect(pairRows(rows).map(([l, r]) => [l?.text ?? null, r?.text ?? null])).toEqual([
      ["x", "q"],
      ["y", null],
      ["z", null],
    ]);
  });

  test("every pair has exactly two slots, so the columns cannot differ in length", () => {
    const rows: DiffRow[] = [
      ctx("a", 1, 1),
      add("b", 2),
      ctx("c", 2, 3),
      del("d", 3),
      del("e", 4),
      ctx("f", 5, 4),
    ];

    const pairs = pairRows(rows);
    expect(pairs.every((p) => p.length === 2)).toBe(true);
    expect(pairs.filter(([l]) => l !== null).length).toBe(5); // 3 context + 2 removals
    expect(pairs.filter(([, r]) => r !== null).length).toBe(4); // 3 context + 1 addition
  });

  test("an empty hunk pairs to nothing rather than throwing", () => {
    expect(pairRows([])).toEqual([]);
  });

  test("a hunk of pure context is unchanged on both sides", () => {
    const rows = [ctx("a", 1, 1), ctx("b", 2, 2)];
    expect(pairRows(rows).map(([l, r]) => [l?.text, r?.text])).toEqual([
      ["a", "a"],
      ["b", "b"],
    ]);
  });
});
