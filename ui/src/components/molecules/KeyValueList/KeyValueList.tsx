import type { ReactNode } from "react";
import styles from "./KeyValueList.module.css";
import { Text } from "../../foundation";

export interface KeyValueEntry {
  key: string;
  value: ReactNode;
}

/**
 * Facts about one thing, aligned.
 *
 * A real `<dl>`, not a two-column grid of spans. The markup is the semantics
 * here: a screen reader announces "issuer, http://…" as a pair, which is the
 * whole content of a metadata block and is lost entirely if it is two
 * unrelated runs of text.
 *
 * `dense` drops to the tiny scale for a metadata strip inside a tile header,
 * where the alternative is a wrapping paragraph of "key: value ·" separated by
 * middots — which is what the source browser and the inspector both did.
 */
export function KeyValueList({
  entries,
  dense = false,
}: {
  entries: readonly KeyValueEntry[];
  dense?: boolean;
}) {
  return (
    <dl className={[styles.list, dense ? styles.dense : ""].filter(Boolean).join(" ")}>
      {entries.map((entry) => (
        <div key={entry.key} className={styles.row}>
          <dt className={styles.key}>
            <Text size={dense ? "micro" : "tiny"} tone="faint">
              {entry.key}
            </Text>
          </dt>
          <dd className={styles.value}>
            <Text size={dense ? "tiny" : "small"}>{entry.value}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
