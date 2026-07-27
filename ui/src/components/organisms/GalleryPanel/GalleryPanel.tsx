import type { ChartSpec } from "../../../model/chart";
import { Presentation } from "../../../pbui";
import { Button, Chip, IconButton } from "../../atoms";
import { Text } from "../../foundation";
import { AppBody, Stack, Surface } from "../../layout";
import { SpecSummary } from "../../molecules";

/** One snapshot, as the panel needs it. */
export interface SnapshotView {
  id: string;
  name: string;
  /** ISO instant. Rendered as "YYYY-MM-DD HH:MM:SS". */
  at: string;
  limit: number;
  spec: ChartSpec;
}

/**
 * Snapshots: frozen specifications.
 *
 * A snapshot holds no rows — it holds how to get them, plus the row budget so a
 * restore reproduces the same window. That is what makes it a deep copy of one
 * serialisable value rather than a bespoke format (DR-8), and it is why
 * restoring one whose source has since gone produces a document that reports
 * the problem rather than a blank tile.
 *
 * ## Why this is not a shared list component
 *
 * DR-44 required the three snapshot-family applications to be designed together
 * before any was extracted, on the suspicion that the right answer was one list
 * molecule and three thin panels. Having looked at all three: it is not
 * (DR-85). The card shells rhyme, but the contents and the actions differ
 * enough that a shared list taking a config object would be a generic solution
 * to three specific instances — the same padding DR-43 rejects for the
 * tutorials.
 *
 * What *is* shared is the description of a specification, and that is now one
 * pure function (`specFacts`) behind two small molecules: `SpecSummary` here
 * and in the document manager, `SpecDiff` in the compare view.
 */
export function GalleryPanel({
  snapshots,
  pins,
  activeDocName,
  onRestore,
  onPin,
  onDelete,
}: {
  snapshots: readonly SnapshotView[];
  /** The compare slots, by snapshot id. */
  pins: readonly [string | null, string | null];
  /** Named in the prose, because restore lands there and nowhere else. */
  activeDocName: string;
  onRestore: (snapshotId: string) => void;
  onPin: (slot: 0 | 1, snapshotId: string) => void;
  onDelete: (snapshotId: string) => void;
}) {
  return (
    <AppBody>
      <Stack gap={3}>
        <Text size="tiny" tone="faint" prose>
          A snapshot freezes a whole pipeline and encoding. L-click restores into the active
          document ({activeDocName}); R-click offers restore-as-new, pinning for compare, and
          delete.
        </Text>

        {snapshots.length === 0 && (
          <Text size="small" tone="faint">
            No snapshots. Use ⚑ in the charts tile.
          </Text>
        )}

        {snapshots.map((snapshot) => (
          <Surface key={snapshot.id} border="hair" padding={3}>
            <Stack gap={2}>
              <Stack direction="row" gap={2} align="center" wrap>
                <Presentation
                  ptype="chart"
                  value={snapshot.id}
                  doc={`<chart> snapshot ${snapshot.name}`}
                  onActivate={() => onRestore(snapshot.id)}
                  activateDoc={`restore into chart ${activeDocName}`}
                >
                  <Chip label={snapshot.name} tone="var(--pbui-tone-geom)" strong />
                </Presentation>
                <Text size="tiny" tone="faint">
                  {snapshot.at.replace("T", " ").slice(0, 19)}
                </Text>
                {/* The pin markers are worded, not merely coloured: A and B are
                    a position rather than a hue, and the compare tile names
                    them the same way. */}
                {pins[0] === snapshot.id && (
                  <Text size="tiny" tone="danger" strong>
                    pinned A
                  </Text>
                )}
                {pins[1] === snapshot.id && (
                  <Text size="tiny" strong>
                    pinned B
                  </Text>
                )}
              </Stack>

              <SpecSummary spec={snapshot.spec} />

              <Stack direction="row" gap={2} wrap>
                {([0, 1] as const).map((slot) => (
                  <Button
                    key={slot}
                    variant="framed"
                    size="tiny"
                    onClick={() => onPin(slot, snapshot.id)}
                  >
                    pin {slot === 0 ? "A" : "B"}
                  </Button>
                ))}
                <IconButton
                  variant="framed"
                  size="tiny"
                  tone="danger"
                  glyph="✕"
                  label={`delete the snapshot ${snapshot.name}`}
                  onClick={() => onDelete(snapshot.id)}
                />
              </Stack>
            </Stack>
          </Surface>
        ))}
      </Stack>
    </AppBody>
  );
}
