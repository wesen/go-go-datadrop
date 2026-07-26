import { SectionLabel, Text } from "../../foundation";
import { AppBody } from "../../layout";
import styles from "./InspectorPanel.module.css";

/**
 * Whatever was last inspected, as formatted JSON.
 *
 * Everything the descriptors say about honesty surfaces here: no statistic
 * without the window it was computed over, and provenance reported beside every
 * type. A mean over a 2 000-row sample of forty thousand is a different fact
 * from a mean over the lot, and the difference belongs on screen.
 *
 * ## Why it renders JSON rather than a formatted view
 *
 * The inspector shows objects of sixteen presentation types, and each
 * descriptor's `describe` decides its own shape. A formatted view would need to
 * know all sixteen and would go stale the first time a descriptor added a
 * field. JSON is the one rendering that cannot be wrong about a shape it has
 * never seen — and `describe` returning something JSON-serialisable is already
 * a rule (the accept resolver is the canonical thing it excludes).
 */
export function InspectorPanel({
  inspected,
}: {
  /** Null before anything has been inspected. */
  inspected: { title: string; value: unknown } | null;
}) {
  return (
    <AppBody>
      {!inspected ? (
        <Text size="small" tone="faint" prose>
          Nothing inspected yet. Right-click any presentation and choose
          <strong> Inspect</strong>.
        </Text>
      ) : (
        <>
          <SectionLabel>{inspected.title}</SectionLabel>
          <pre className={styles.body}>{JSON.stringify(inspected.value, null, 2)}</pre>
        </>
      )}
    </AppBody>
  );
}
