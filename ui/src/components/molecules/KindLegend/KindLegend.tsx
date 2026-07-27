import { Meter } from "../../atoms";
import { Text } from "../../foundation";
import { kfmt } from "../../../model/format";
import styles from "./KindLegend.module.css";

export interface KindTotal {
  kind: string;
  /** A CSS variable reference for the swatch and the bar. */
  tone: string;
  /** The quantity this kind accounts for — tokens, bytes, rows. */
  total: number;
  /** How many items make up that total. */
  count: number;
}

export interface KindLegendProps {
  kinds: KindTotal[];
  /** Formats `total`. Defaults to the shared short-number formatter. */
  format?: (n: number) => string;
  /** The accessible name for the group. */
  label: string;
}

/**
 * What a set of kinds accounts for: a swatch, a bar, a total and a count.
 *
 * Related to `Legend` and not the same thing. `Legend` names the colours of a
 * *chart* — it exists to decode marks the reader is already looking at, and it
 * is coupled to the encoding layer that produced them. This decodes nothing; it
 * is a breakdown, and it is used where there is no chart at all.
 *
 * Sorting happens here rather than at the call site. Every caller wants
 * descending-by-total, and a legend that reorders as its data changes reads as
 * flicker rather than as information.
 */
export function KindLegend({ kinds, format = kfmt, label }: KindLegendProps) {
  const sorted = [...kinds].sort((a, b) => b.total - a.total);
  const max = sorted.reduce((acc, k) => Math.max(acc, k.total), 0);

  if (sorted.length === 0) {
    return (
      <Text size="small" tone="faint">
        nothing to break down
      </Text>
    );
  }

  // The <ul> is written out rather than composed from Stack: Stack accepts a
  // fixed prop set and does not spread the rest, so `aria-label` passed through
  // it is silently dropped. Typecheck did not object and the tests did not
  // either — the missing accessible name was only visible in the rendered DOM.
  return (
    <ul className={styles.list} aria-label={label}>
      {sorted.map((k) => (
        <li key={k.kind} className={styles.row}>
          <span className={styles.swatch} style={{ background: k.tone }} aria-hidden="true" />
          <span className={styles.kind}>{k.kind}</span>
          <span className={styles.bar}>
            <Meter
              fraction={max === 0 ? 0 : k.total / max}
              tone={k.tone}
              label={`${k.kind}: ${format(k.total)} across ${k.count}`}
            />
          </span>
          <span className={styles.total}>
            {format(k.total)} · {k.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
