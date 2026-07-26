import { Presentation, labelFor, toneFor, usePbui } from "../../../pbui";
import type { PresentationType } from "../../../pbui";
import { Button, Chip, IconButton } from "../../atoms";
import { Text } from "../../foundation";
import { AppBody, Stack, Toolbar } from "../../layout";
import styles from "./WatchlistPanel.module.css";

/** One pinned object. The value's shape depends entirely on its type. */
export interface WatchView {
  id: string;
  ptype: PresentationType;
  value: unknown;
}

/**
 * A scratchpad of pinned objects, of any type.
 *
 * The clearest demonstration in the product that presentations are handles
 * rather than pictures: a watched field is still a live field, mappable and
 * filterable from here exactly as from a table header.
 *
 * ## Why this one reads the registry directly
 *
 * Every other panel knows what it is drawing. This one does not, and cannot:
 * the watchlist holds `field`, `source`, `doc`, `step`, `datum`, `cat` and
 * `chart` presentations at once, and a panel that switched on the type would
 * have to be edited every time a type is added.
 *
 * So it re-presents through the registry — `labelFor` and `toneFor` — which
 * means it works for a type nobody has written yet. That is the same mechanism
 * the object menu uses, and it is why an unregistered type degrades to a chip
 * with a neutral tone rather than to a crash.
 *
 * `usePbui` is here rather than in the container for the same reason: the label
 * is resolved against the live environment, so a watched field's chip renames
 * itself when the document it belongs to is renamed. Passing pre-rendered
 * labels down would freeze them at the moment of watching.
 */
export function WatchlistPanel({
  entries,
  onWatch,
  onRemove,
}: {
  entries: readonly WatchView[];
  /** Opens a union accept: anything at all, in any tile or workspace. */
  onWatch: () => void;
  onRemove: (id: string) => void;
}) {
  const pbui = usePbui();

  return (
    <>
      <Toolbar tight>
        <Button variant="raised" fill="var(--pbui-tone-chart)" onClick={onWatch}>
          Watch… (accepts anything)
        </Button>
      </Toolbar>

      <AppBody>
        <Stack gap={2}>
          {entries.length === 0 && (
            <Text size="small" tone="faint" prose>
              Nothing watched. A watched object stays LIVE — a watched field can
              still be mapped or filtered from here.
            </Text>
          )}
          {entries.map((entry) => {
            const label = labelFor(entry.ptype, entry.value, pbui.environment);
            return (
              <Stack key={entry.id} direction="row" gap={2} align="center">
                {/* The type is named in text beside the chip, not only carried
                    by the chip's tone. Six tones on one list is more than a
                    reader can hold, and the tones sit below the non-text
                    contrast threshold anyway. */}
                <Text size="tiny" tone="faint">
                  &lt;{entry.ptype}&gt;
                </Text>
                <Presentation
                  ptype={entry.ptype}
                  value={entry.value}
                  doc={`<${entry.ptype}> ${label}`}
                >
                  <Chip label={label} tone={toneFor(entry.ptype)} />
                </Presentation>
                <span className={styles.spacer} />
                <IconButton
                  variant="framed"
                  size="tiny"
                  tone="danger"
                  label="remove from watchlist"
                  onClick={() => onRemove(entry.id)}
                  glyph="✕"
                />
              </Stack>
            );
          })}
        </Stack>
      </AppBody>
    </>
  );
}
