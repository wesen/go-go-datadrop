import { useState } from "react";
import { CodeLine } from "../../atoms";
import { MoreBar } from "../MoreBar";
import styles from "./DiffHunk.module.css";

export interface DiffRow {
  op: "add" | "remove" | "context";
  text: string;
  /** Line number on the "before" side; null where the row does not exist there. */
  before: number | null;
  after: number | null;
}

export interface Hunk {
  rows: DiffRow[];
  added: number;
  removed: number;
  beforeStart: number;
  afterStart: number;
}

export interface DiffHunkProps {
  hunk: Hunk;
  /** Side-by-side rather than unified. */
  split?: boolean;
  /**
   * Rows rendered before the rest collapse behind a MoreBar.
   *
   * A generated or minified file produces hunks of several thousand rows, and
   * each row is a flex container with three children. Painting all of them
   * costs more than anyone wants for a diff nobody will read past line 200.
   */
  cap?: number;
}

/**
 * One hunk of a text diff, unified or side by side.
 *
 * Distinct from `SpecDiff`, which compares two *chart specifications* — two
 * objects, field by field. This compares text, and the two have almost nothing
 * in common beyond the word "diff": one reports that a geom changed from bar to
 * line, the other reports that line 42 became two lines.
 *
 * Takes an already-computed hunk. Computing one is a different job with
 * different tests, and a renderer that also diffs cannot be exercised with a
 * literal.
 */
export function DiffHunk({ hunk, split = false, cap = 160 }: DiffHunkProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? hunk.rows : hunk.rows.slice(0, cap);
  const hidden = hunk.rows.length - rows.length;

  return (
    <div className={styles.hunk}>
      <div className={styles.header}>
        <span className={styles.range}>
          @@ −{hunk.beforeStart},{hunk.removed} +{hunk.afterStart},{hunk.added} @@
        </span>
        <span className={styles.spacer} />
        <span className={styles.added}>+{hunk.added}</span>
        <span className={styles.removed}>−{hunk.removed}</span>
      </div>

      <div className={styles.body}>
        {split ? <SplitRows rows={rows} /> : <UnifiedRows rows={rows} />}
      </div>

      <MoreBar hidden={hidden} what="lines" onReveal={() => setExpanded(true)} />
    </div>
  );
}

function UnifiedRows({ rows }: { rows: DiffRow[] }) {
  return (
    <>
      {rows.map((row, i) => (
        <CodeLine
          key={`${row.before}-${row.after}-${i}`}
          text={row.text}
          before={row.before}
          after={row.after}
          op={row.op}
        />
      ))}
    </>
  );
}

/**
 * The pairing rule, which is the whole of the split algorithm.
 *
 * The obvious version — push context to both sides, removals to the left,
 * additions to the right, then render to the longer column — is **wrong**, and
 * wrong in a way that looks right on a balanced hunk. It is what the prototype
 * does (`pbui-agent-workbench(1).jsx:2280-2284`) and it was the first version
 * here.
 *
 * The failure: the two arrays advance at different rates through an unbalanced
 * change, and nothing ever re-synchronises them. One removal answered by three
 * additions leaves the left column two entries short, so every context row
 * *after* that change pairs against an addition instead of against itself. In
 * the six-row example this file ships, the closing `}` ended up beside
 * `if (!s || s.expiresAt < Date.now())`. Both columns contain the right rows in
 * the right order, so the diff reads as plausible while asserting that
 * unrelated lines correspond.
 *
 * The fix is to treat a context row as a synchronisation point. Consecutive
 * removals and additions accumulate into a pair of blocks; a context row (or
 * the end of the hunk) flushes them, padding the shorter block, and then lands
 * on both sides at the same index. Within a block the pairing is positional,
 * which is what makes a substitution read as a substitution.
 */
export function pairRows(rows: DiffRow[]): Array<[DiffRow | null, DiffRow | null]> {
  const left: (DiffRow | null)[] = [];
  const right: (DiffRow | null)[] = [];

  let pendingRemovals: DiffRow[] = [];
  let pendingAdditions: DiffRow[] = [];

  const flush = () => {
    const height = Math.max(pendingRemovals.length, pendingAdditions.length);
    for (let i = 0; i < height; i++) {
      left.push(pendingRemovals[i] ?? null);
      right.push(pendingAdditions[i] ?? null);
    }
    pendingRemovals = [];
    pendingAdditions = [];
  };

  for (const row of rows) {
    if (row.op === "context") {
      flush();
      left.push(row);
      right.push(row);
    } else if (row.op === "remove") {
      pendingRemovals.push(row);
    } else {
      pendingAdditions.push(row);
    }
  }
  flush();

  return left.map((l, i) => [l, right[i] ?? null]);
}

function SplitRows({ rows }: { rows: DiffRow[] }) {
  const pairs = pairRows(rows);

  return (
    <>
      {pairs.map(([l, r], i) => (
        <div className={styles.pair} key={`pair-${i}`}>
          <div className={styles.side}>
            {l ? (
              <CodeLine text={l.text} before={l.before} after={null} op={l.op} />
            ) : (
              <div className={styles.blank} />
            )}
          </div>
          <div className={styles.side}>
            {r ? (
              <CodeLine text={r.text} before={null} after={r.after} op={r.op} />
            ) : (
              <div className={styles.blank} />
            )}
          </div>
        </div>
      ))}
    </>
  );
}
