import { specFacts } from "../../../model/chart";
import type { ChartSpec } from "../../../model/chart";
import { Button } from "../../atoms";
import { SectionLabel, Text } from "../../foundation";
import { AppBody, Stack, Surface } from "../../layout";
import { SpecDiff } from "../../molecules";

/** One pinned side of the comparison, or nothing pinned there. */
export interface CompareSide {
  name: string;
  limit: number;
  spec: ChartSpec;
}

/**
 * Two pinned snapshots, as an aligned diff.
 *
 * Comparing two charts is almost always asking *what is different*. The
 * prototype shows two independent summaries and leaves the reader to do the
 * diff by eye; this marks the rows that disagree, which is work the machine can
 * do and the reader cannot do reliably.
 *
 * The facts come from `specFacts`, the same function the one-line summary in
 * the gallery reads. That is what stops a snapshot from being described one way
 * on its card and another way here — a divergence that would be invisible
 * precisely because the two views are never on screen together.
 *
 * ## Empty is one state, not three
 *
 * Neither pinned, only A pinned, only B pinned: the diff renders for all three,
 * because a single pinned snapshot against an empty column is a legible answer
 * to "what did I pin". Only the both-empty case gets prose, and it says how to
 * fill it.
 */
export function ComparePanel({
  a,
  b,
  onPick,
}: {
  a: CompareSide | null;
  b: CompareSide | null;
  /** Ask the user to point at a snapshot in the gallery. */
  onPick: (slot: 0 | 1) => void;
}) {
  const sides = [a, b] as const;

  return (
    <AppBody>
      <Stack gap={3}>
        <Stack direction="row" gap={3} wrap>
          {([0, 1] as const).map((slot) => (
            <Stack key={slot} direction="row" gap={2} align="center">
              {/* A is danger-toned to match the gallery's "pinned A" marker, and
                  the letter carries the identity so the colour is never the
                  only signal. */}
              <Text size="small" strong tone={slot === 0 ? "danger" : "default"}>
                {slot === 0 ? "A" : "B"}
              </Text>
              <Text size="small">{sides[slot]?.name ?? "empty"}</Text>
              <Button variant="framed" size="tiny" onClick={() => onPick(slot)}>
                accept…
              </Button>
            </Stack>
          ))}
        </Stack>

        {!a && !b ? (
          <Text size="small" tone="faint" prose>
            Pin two snapshots to compare them. Rows that differ are marked.
          </Text>
        ) : (
          <Surface border="hair" padding={3}>
            <Stack gap={2}>
              <SectionLabel>Specification diff</SectionLabel>
              <SpecDiff
                left={a ? specFacts(a.spec, a.limit) : []}
                right={b ? specFacts(b.spec, b.limit) : []}
                leftLabel={a?.name ?? "empty"}
                rightLabel={b?.name ?? "empty"}
              />
            </Stack>
          </Surface>
        )}
      </Stack>
    </AppBody>
  );
}
