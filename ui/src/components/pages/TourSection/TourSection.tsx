import { useState, type ReactNode } from "react";
import type { Goal, Lesson, ModuleEntry } from "../../../appkit/lessons";
import { TourContentProvider } from "../../../appkit/TourContent";
import { Text } from "../../foundation";
import { WorkbenchInstance, type InstanceConfig } from "../WorkbenchInstance";
import styles from "./TourSection.module.css";

/**
 * One section of the tour: a heading, a blurb, and a workbench.
 *
 * The lesson rail, the module rack, the capstone brief and the cheat sheet are
 * **tiles inside the workbench** rather than a panel beside it. That was the
 * obvious correction once someone said it out loud: a tour arguing for a tiling
 * window manager, from a fixed panel bolted to the side of one, is arguing
 * against itself. Now the rail can be closed, split, moved or swapped for the
 * trace, and the reader learns the shell by rearranging the thing teaching them
 * about it.
 *
 * The content reaches those tiles through `TourContentProvider`, because a tile
 * names an application by id and carries nothing else (DR-11) — so §A's rail
 * and §C's rail are one registered application over different context.
 *
 * ## Reset is remount, and that is the whole mechanism
 *
 * `nonce` is the `key` of the subtree holding the instance. Pressing ↺
 * increments it, React throws the subtree away, and the instance's `useRef`
 * null-check builds a fresh store. There is no `reset()` anywhere and there
 * should not be: a reset that walks state back can leave a fragment behind, and
 * the fragment is always in the thing nobody thought to walk back. The prototype
 * settles this the same way (`pbui-landing.jsx:2114-2123`).
 *
 * The rail's own `done` map goes with it, which is why progress is not persisted
 * (DR-56) — it lives in the subtree that ↺ discards.
 */
export interface TourSectionProps {
  id: string;
  /** The § marker: A, B, C, D, ✦. */
  tag: string;
  title: string;
  blurb: ReactNode;
  /** How the embedded workbench starts. Its layout names the teaching tiles. */
  config: InstanceConfig;
  /** Whichever of these the section's seeded layout has tiles for. */
  lessons?: Lesson[];
  modules?: ModuleEntry[];
  brief?: { question: ReactNode; goals: Goal[]; hints: ReactNode[] };
  cheat?: { title: string; rows: Array<[string, ReactNode]> };
  /** Which tile the module rack re-points when a card is chosen. §D only. */
  rackTarget?: string;
  /**
   * A taller frame for a section whose layout is crowded.
   *
   * §C opens on five tiles and needs more than §A's three. The section knows
   * this and the shell does not (DR-51) — and beyond a point no height is
   * enough, which is what the full-frame control in the shell is for.
   */
  tall?: boolean;
}

export function TourSection({
  id,
  tag,
  title,
  blurb,
  config,
  lessons,
  modules,
  brief,
  cheat,
  rackTarget,
  tall,
}: TourSectionProps) {
  const [nonce, setNonce] = useState(0);
  const reset = () => setNonce((n) => n + 1);

  return (
    <section id={id} className={styles.section}>
      <div className={styles.heading}>
        <span className={styles.tag}>§ {tag}</span>
        <h2 className={styles.title}>{title}</h2>
      </div>

      <div className={styles.blurb}>
        <Text size="base" prose>
          {blurb}
        </Text>
      </div>

      {/*
        `key` on the instance, so ↺ discards the store and the rail's completion
        state together. Resetting a panel and finding it still claiming you have
        done everything would be worse than not offering ↺ at all.
      */}
      <TourContentProvider
        key={nonce}
        content={{ lessons, modules, brief, cheat, rackTarget, onReset: reset }}
      >
        <div className={tall ? `${styles.body} ${styles.tall}` : styles.body}>
          <WorkbenchInstance config={config} />
        </div>
      </TourContentProvider>
    </section>
  );
}
