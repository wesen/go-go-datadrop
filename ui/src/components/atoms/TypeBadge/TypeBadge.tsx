import { TYPE_LABEL, type FieldType } from "../../../model/table";
import styles from "./TypeBadge.module.css";

const TONE: Record<FieldType, string> = {
  q: "var(--pbui-type-q)",
  n: "var(--pbui-type-n)",
  t: "var(--pbui-type-t)",
};

/**
 * A column's type, as a letter and a hue.
 *
 * Both, always. The hue alone does not clear the non-text contrast threshold,
 * and colour is never the sole carrier of meaning (§15).
 */
export function TypeBadge({ type, overridden }: { type: FieldType; overridden?: boolean }) {
  return (
    <abbr
      className={styles.badge}
      style={{ background: TONE[type] }}
      title={overridden ? `${TYPE_LABEL[type]} — overridden for this chart only` : TYPE_LABEL[type]}
    >
      {overridden ? `${type}*` : type}
    </abbr>
  );
}
