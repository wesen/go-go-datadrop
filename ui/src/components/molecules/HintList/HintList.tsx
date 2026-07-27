import type { ReactNode } from "react";
import { Button } from "../../atoms";
import { Text } from "../../foundation";
import { Stack } from "../../layout";
import styles from "./HintList.module.css";

/**
 * Hints, one press at a time, and never the answer.
 *
 * The ordering is the design: navigational first ("every tile has an
 * application dropdown in its title bar"), then conceptual ("after a group∑ the
 * schema collapses to two columns, so the x and y you had will need
 * re-pointing"), and only then mechanical. A reader who is stuck on *where* a
 * control is should not be handed the reasoning, and a reader stuck on the
 * reasoning is not helped by being told where to click.
 *
 * The terminal message — "that is every hint; the rest is yours" — matters more
 * than it looks. Without it a reader keeps pressing, expecting the answer, and
 * the moment they realise it is not coming is a worse moment than being told.
 */
export function HintList({
  hints,
  shown,
  onReveal,
}: {
  hints: ReactNode[];
  shown: number;
  onReveal: () => void;
}) {
  return (
    <Stack gap={3}>
      {hints.slice(0, shown).map((hint, index) => (
        <div key={index} className={styles.hint}>
          <Text size="small" tone="faint" prose>
            · {hint}
          </Text>
        </div>
      ))}

      {shown < hints.length ? (
        <div>
          <Button variant="raised" onClick={onReveal}>
            I&apos;m stuck — one hint
          </Button>
        </div>
      ) : (
        <Text size="tiny" tone="faint">
          that is every hint. the rest is yours.
        </Text>
      )}
    </Stack>
  );
}
