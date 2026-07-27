import { TYPE_SOURCE_LABEL, type TypeSource } from "../../../model/table";
import styles from "./ProvenanceBadge.module.css";

/** How the server decided a column's type, abbreviated. */
const SHORT: Record<TypeSource, string> = {
  schema: "sch",
  envelope: "env",
  values: "val",
  default: "def",
};

/**
 * Where a column's type came from.
 *
 * A column typed `q` because a dataset schema declares it and one typed `q`
 * because two thousand sampled values happened to parse are different facts,
 * and a user deciding whether to trust a chart needs the difference. This is
 * the whole reason pkg/tabular reports `inferred_from` at all (DR-2).
 */
export function ProvenanceBadge({ source }: { source: TypeSource }) {
  return (
    <abbr className={styles.badge} title={TYPE_SOURCE_LABEL[source]}>
      {SHORT[source]}
    </abbr>
  );
}
