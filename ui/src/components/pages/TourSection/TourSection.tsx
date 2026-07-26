import { useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import type { Goal, Lesson, ModuleEntry } from "../../../appkit/lessons";
import { layoutActions } from "../../../store/layout";
import { BriefChecklist, LessonRail, ModuleRack } from "../../organisms";
import { CheatCard } from "../../molecules";
import { Text } from "../../foundation";
import { WorkbenchInstance, type InstanceConfig } from "../WorkbenchInstance";
import styles from "./TourSection.module.css";

/**
 * One section of the tour: a heading, a blurb, and a panel beside a workbench.
 *
 * The panel is a lesson rail, a module rack, or the capstone brief — three
 * shapes, one layout, because they are the same thing seen from different
 * distances: a rail teaches a move, a rack names a vocabulary, and a brief asks
 * for an outcome.
 *
 * ## Reset is remount, and that is the whole mechanism
 *
 * `nonce` is passed as the `key` of the subtree holding the `WorkbenchInstance`
 * (below). Pressing ↺ increments it, React throws the subtree away, and the
 * instance's `useRef` null-check builds a fresh store. There is no `reset()`
 * anywhere and there should not be: a reset that walks state back can leave a
 * fragment behind, and the fragment is always in the thing nobody thought to
 * walk back. The prototype settles this the same way
 * (`pbui-landing.jsx:2114-2123`).
 *
 * The rail's own `done` map goes with it, which is why progress is not
 * persisted (DR-56) — it lives in the subtree that ↺ discards.
 */
export interface TourSectionProps {
  id: string;
  /** The § marker: A, B, C, D, ✦. */
  tag: string;
  title: string;
  blurb: ReactNode;
  /** How the embedded workbench starts. */
  config: InstanceConfig;
  /** Exactly one of these three. */
  lessons?: Lesson[];
  modules?: ModuleEntry[];
  brief?: { question: ReactNode; goals: Goal[]; hints: ReactNode[] };
  /** The vocabulary card below the panel. */
  cheat?: { title: string; rows: Array<[string, ReactNode]> };
  /**
   * Which tile the module rack re-points when a card is chosen.
   *
   * §D only. The rack is a table of contents that drives one tile, so the card
   * and the thing it describes are on screen together and the reader can check
   * the description against the behaviour immediately.
   */
  rackTarget?: string;
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
        `key` on the wrapper rather than on the instance itself, so the panel —
        which holds the rail's completion state — is discarded with it. ↺ has to
        reset the lesson ticks as well as the world, or a reader restarts a
        panel and finds it still claiming they have done everything.
      */}
      <SectionBody
        key={nonce}
        config={config}
        lessons={lessons}
        modules={modules}
        brief={brief}
        onReset={reset}
        rackTarget={rackTarget}
      />

      {cheat && (
        <div className={styles.cheat}>
          <CheatCard title={cheat.title} rows={cheat.rows} />
        </div>
      )}
    </section>
  );
}

/**
 * The panel and the workbench, side by side.
 *
 * Separated out purely so that `key` can discard both together. Everything
 * about it is layout except one thing: **the panel renders as a child of
 * `WorkbenchInstance`**, which places it inside the instance's `PbuiProvider`
 * and beside the shell rather than above it (DR-55). That is what lets a
 * lesson's ▶ runner call `accept()` and demonstrate the accept protocol rather
 * than describe it.
 */
function SectionBody({
  config,
  lessons,
  modules,
  brief,
  onReset,
  rackTarget,
}: {
  config: InstanceConfig;
  lessons?: Lesson[];
  modules?: ModuleEntry[];
  brief?: { question: ReactNode; goals: Goal[]; hints: ReactNode[] };
  onReset: () => void;
  rackTarget?: string;
}) {
  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <WorkbenchInstance config={config} className={styles.instance}>
          {modules ? (
            <RackPanel modules={modules} target={rackTarget} />
          ) : brief ? (
            <BriefChecklist
              question={brief.question}
              goals={brief.goals}
              hints={brief.hints}
              onReset={onReset}
            />
          ) : lessons ? (
            <LessonRail lessons={lessons} onReset={onReset} />
          ) : null}
        </WorkbenchInstance>
      </div>
    </div>
  );
}

/**
 * The rack, wired to re-point a tile.
 *
 * It renders inside the instance's `Provider` — it is a child of
 * `WorkbenchInstance` — so `useDispatch` reaches that instance's store and no
 * other. That is the same property the lesson rail relies on, applied to a
 * different verb: choosing a card sets one tile's application, so the card and
 * the thing it describes are on screen together.
 *
 * `target` is the node id of the tile that follows the selection. Without one
 * the rack is a reference with no specimen: it still reads, and it teaches
 * less.
 */
function RackPanel({ modules, target }: { modules: ModuleEntry[]; target?: string }) {
  const dispatch = useDispatch();
  return (
    <ModuleRack
      modules={modules}
      onSelect={
        target
          ? (app) => dispatch(layoutActions.setLeafApp({ nodeId: target, app }))
          : undefined
      }
    />
  );
}
