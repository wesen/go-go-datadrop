import { Button } from "../../atoms";
import { kfmt } from "../../../model/format";
import styles from "./MoreBar.module.css";

export interface MoreBarProps {
  /** How many items are hidden. Renders nothing at or below zero. */
  hidden: number;
  /** Plural noun for the items: "lines", "hunks", "rows", "segments". */
  what: string;
  onReveal: () => void;
}

/**
 * The bounded-list control: "⋯ 1.2k more lines — click to show".
 *
 * Distinct from `TruncationNotice`, which is the other half of the same problem
 * and is deliberately *not* interactive. A truncation notice says the data you
 * are looking at is a sample of something the client never received, and there
 * is nothing to reveal — the fix is to raise the row budget. A MoreBar says the
 * client has everything and is choosing not to paint it, which is a decision the
 * reader is allowed to overrule.
 *
 * Renders `null` when nothing is hidden, so callers can place it unconditionally
 * at the foot of a list rather than guarding every call site. Guards at call
 * sites are where "0 more rows — click to show" comes from.
 *
 * The control is the `Button` atom rather than a hand-written `<button>`, which
 * `no-raw-controls.test.ts` enforces and which caught this file on its first
 * run. The wrapper supplies the full-width geometry a bare Button has no reason
 * to carry.
 */
export function MoreBar({ hidden, what, onReveal }: MoreBarProps) {
  if (hidden <= 0) return null;

  return (
    <div className={styles.more}>
      <Button variant="framed" size="tiny" onClick={onReveal}>
        ⋯ {kfmt(hidden)} more {what} — click to show
      </Button>
    </div>
  );
}
