import { Text } from "../../foundation";
import { Stack } from "../../layout";
import styles from "./SpecDiff.module.css";

/**
 * Two specifications as an aligned diff rather than two summaries.
 *
 * Comparing two charts is almost always asking *what is different*, and making
 * the reader do that diff by eye is work the machine can do. The prototype
 * shows two independent summaries side by side; this marks the rows that
 * disagree.
 *
 * Takes two fact lists rather than two specs, so the caller decides what a fact
 * is — in practice `specFacts`, which is also what the one-line summary reads,
 * so the two views cannot describe the same spec differently.
 *
 * ## Difference is carried twice
 *
 * A differing row is both `danger`-toned and bold. Colour alone would fail
 * WCAG 1.4.1: the reader who cannot see the hue gets no signal at all, and this
 * component's entire job is that signal.
 *
 * ## The union of keys, not the intersection
 *
 * A key present on one side and absent from the other is itself a difference —
 * a document with a row budget compared against a bare snapshot, say — and
 * intersecting would hide exactly the rows worth seeing. Missing values render
 * as an em dash on their side.
 */
export function SpecDiff({
  left,
  right,
  leftLabel = "A",
  rightLabel = "B",
}: {
  left: ReadonlyArray<readonly [string, string]>;
  right: ReadonlyArray<readonly [string, string]>;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const a = new Map(left);
  const b = new Map(right);
  // Left order first, then anything only the right side has, so the common case
  // — two specs with the same shape — reads in the order specFacts declares.
  const keys = [...a.keys(), ...[...b.keys()].filter((k) => !a.has(k))];

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={3} align="baseline">
        <Text size="tiny" tone="faint">
          <span className={styles.key} />
        </Text>
        <Text size="tiny" tone="faint" strong>
          <span className={styles.value}>{leftLabel}</span>
        </Text>
        <Text size="tiny" tone="faint" strong>
          {rightLabel}
        </Text>
      </Stack>

      {keys.map((key) => {
        const differs = a.get(key) !== b.get(key);
        return (
          <Stack key={key} direction="row" gap={3} align="baseline">
            <Text size="tiny" tone="faint">
              <span className={styles.key}>{key}</span>
            </Text>
            <Text size="small" tone={differs ? "danger" : "default"} strong={differs}>
              <span className={styles.value}>{a.get(key) ?? "—"}</span>
            </Text>
            <Text size="small" tone={differs ? "danger" : "default"} strong={differs}>
              {b.get(key) ?? "—"}
            </Text>
          </Stack>
        );
      })}
    </Stack>
  );
}
