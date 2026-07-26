import type { ReactNode } from "react";
import { SectionLabel, Text } from "../../foundation";
import styles from "./CheatCard.module.css";

/**
 * A titled two-column reference card, one per tour section.
 *
 * It sits below a section and answers the question the section leaves: *what
 * were the five things I just learned called?* Deliberately a table of terms
 * rather than a summary of prose — a reader who has finished the section does
 * not need the argument repeated, they need the vocabulary in one place they
 * can find again.
 *
 * The rows are `[term, gloss]`. Keeping the term column narrow and fixed is
 * what makes a stack of these scannable: the eye runs down the left edge and
 * stops at the one it half-remembers.
 */
export function CheatCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, ReactNode]>;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <SectionLabel>{title}</SectionLabel>
      </div>
      <dl className={styles.rows}>
        {rows.map(([term, gloss]) => (
          <div key={term} className={styles.row}>
            <dt className={styles.term}>
              <Text size="small" strong>
                {term}
              </Text>
            </dt>
            <dd className={styles.gloss}>
              <Text size="small" tone="faint" prose>
                {gloss}
              </Text>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
