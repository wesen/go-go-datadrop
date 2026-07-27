import { useState } from "react";
import type { ModuleEntry } from "../../../appkit/lessons";
import { appFor } from "../../../appkit/registry";
import { Button } from "../../atoms";
import { SectionLabel } from "../../foundation";
import { ModuleCard } from "../../molecules";
import styles from "./ModuleRack.module.css";

/**
 * A reference for every application, with a live specimen beside it.
 *
 * Not a lesson track. Section D of the tour is a rack of cards, and selecting
 * one **swaps the large tile to that application** — so the card and the thing
 * it describes are on screen together and the reader can check the description
 * against the behaviour immediately.
 *
 * ## The grouping is derived, not written down
 *
 * The two headings — doc-bound views, world singletons — come from
 * `AppDescriptor.docBound`, which the registry already carries. That matters
 * beyond tidiness: the distinction is *the* thing a reader has to internalise
 * about the shell (if a tile carries a DOC strip it is a view of one document
 * and can be re-pointed; if it does not, it is the whole world and there is only
 * one of it), and a hand-kept list would eventually disagree with the
 * application it describes, teaching the wrong model with full confidence.
 *
 * A card whose id names no registered application is dropped rather than
 * rendered as a ghost, and `test/tour.test.ts` fails when the two sets differ —
 * so the drop is a belt-and-braces measure, not the guard.
 */
export function ModuleRack({
  modules,
  onSelect,
  selected,
}: {
  modules: ModuleEntry[];
  /** Re-point a tile at the chosen application. */
  onSelect?: (id: string) => void;
  /** Controlled selection. Uncontrolled and self-managing when absent. */
  selected?: string;
}) {
  const known = modules
    .map((entry) => ({ entry, app: appFor(entry.id) }))
    .filter((pair): pair is { entry: ModuleEntry; app: NonNullable<typeof pair.app> } =>
      Boolean(pair.app),
    );

  const [internal, setInternal] = useState(known[0]?.entry.id ?? "");
  const current = selected ?? internal;
  const shown = known.find((pair) => pair.entry.id === current) ?? known[0];

  const choose = (id: string) => {
    setInternal(id);
    onSelect?.(id);
  };

  const group = (docBound: boolean) => known.filter((pair) => pair.app.docBound === docBound);

  return (
    <div className={styles.rack}>
      <div className={styles.groups}>
        <SectionLabel>
          Doc-bound views — carry a DOC strip; several tiles on one document stay in sync
        </SectionLabel>
        <div className={styles.chips}>
          {group(true).map((pair) => (
            <Chip key={pair.entry.id} pair={pair} current={current} onChoose={choose} />
          ))}
        </div>

        <SectionLabel>
          World singletons — no DOC strip; one shared thing, visible from anywhere
        </SectionLabel>
        <div className={styles.chips}>
          {group(false).map((pair) => (
            <Chip key={pair.entry.id} pair={pair} current={current} onChoose={choose} />
          ))}
        </div>
      </div>

      <div className={styles.detail}>
        {shown && (
          <ModuleCard
            title={shown.app.title}
            what={shown.entry.what}
            emits={shown.entry.emits}
            accepts={shown.entry.accepts}
            lr={shown.entry.lr}
            vs={shown.entry.vs}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One selectable application.
 *
 * `selected` sets `aria-pressed`, which `Button` handles — so the current card
 * is announced as pressed rather than distinguished only by its fill. The 4px
 * left border carries the application's tone, matching the tile title bars the
 * reader is looking at, so the chip and the tile are recognisably the same
 * thing.
 */
function Chip({
  pair,
  current,
  onChoose,
}: {
  pair: { entry: ModuleEntry; app: { id: string; title: string; tone: string } };
  current: string;
  onChoose: (id: string) => void;
}) {
  const active = pair.entry.id === current;
  return (
    <Button
      variant="framed"
      selected={active}
      className={active ? `${styles.chip} ${styles.active}` : styles.chip}
      style={{ borderLeft: `var(--pbui-tone-edge) solid ${pair.app.tone}` }}
      onClick={() => onChoose(pair.entry.id)}
    >
      {pair.app.title}
    </Button>
  );
}
