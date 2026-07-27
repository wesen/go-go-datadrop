import type { ReactNode } from "react";
import { Text } from "../../foundation";
import styles from "./ModuleCard.module.css";

/**
 * One application's reference card: five fixed rows.
 *
 * The vocabulary is the contribution, not the layout. **FOR** is what it is
 * for; **EMITS** is which presentation types are *born* in this tile;
 * **ACCEPTS** is which types its commands pause and ask for; **L / R** is what
 * the two clicks do; and **NOT TO BE** names the module people confuse it with.
 *
 * That last row is why this is a component rather than a `<dl>` at the call
 * site. Four pairs in this system get confused — pipeline≠table,
 * charts≠snapshots, watchlist≠inspector, trace≠pipeline — and a fixed slot
 * forces the author of a new card to ask "which one is this mistaken for?"
 * rather than skip the question. The answer "none" is itself worth knowing.
 */
export function ModuleCard({
  title,
  what,
  emits,
  accepts,
  lr,
  vs,
}: {
  title: string;
  what: ReactNode;
  emits: ReactNode;
  accepts: ReactNode;
  lr: ReactNode;
  vs: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <Text size="small" strong>
        <span className={styles.title}>{title}</span>
      </Text>
      <dl className={styles.rows}>
        <Row label="For">{what}</Row>
        <Row label="Emits">{emits}</Row>
        <Row label="Accepts">{accepts}</Row>
        <Row label="L / R">{lr}</Row>
        <Row label="Not to be">{vs}</Row>
      </dl>
    </div>
  );
}

/**
 * A `<dt>`/`<dd>` pair, not two spans.
 *
 * The card is a description list and saying so gets it read as one: a screen
 * reader announces "Emits: field in the headers" rather than reading two
 * unrelated fragments in sequence.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={styles.label}>
        <Text size="micro" tone="faint" strong>
          <span className={styles.labelText}>{label}</span>
        </Text>
      </dt>
      <dd className={styles.value}>
        <Text size="small" prose>
          {children}
        </Text>
      </dd>
    </>
  );
}
