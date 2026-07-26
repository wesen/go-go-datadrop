import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Goal, Lesson, ModuleEntry } from "./lessons";

/**
 * The teaching content one workbench instance is carrying.
 *
 * The lesson rail, the cheat sheet, the module rack and the capstone brief are
 * **tiles** — real applications in the registry, opened, split, moved and closed
 * like any other. They were a panel bolted to the side of the workbench until a
 * reader pointed out the obvious: a tour whose own lessons cannot be tiled is
 * arguing for tiling from outside it.
 *
 * That creates a problem the app registry cannot solve on its own. Applications
 * are registered once, globally, as stateless components — but §A's rail and
 * §C's rail are different content in the same application. Content cannot go in
 * the store either: a `Lesson` holds a `ReactNode` and two functions, and the
 * world must stay serialisable (guide §7.5).
 *
 * So it travels in context, scoped to the instance, exactly as `AppScope` does
 * for the visible application set. `LessonsApp` and its siblings read from
 * here; with no provider they render an empty state saying so, which is what a
 * reader gets if they open the lessons tile in the product rather than in a
 * tour.
 */
export interface TourContent {
  lessons?: Lesson[];
  brief?: { question: ReactNode; goals: Goal[]; hints: ReactNode[] };
  modules?: ModuleEntry[];
  cheat?: { title: string; rows: Array<[string, ReactNode]> };
  /** ↺ — remounts the section, discarding the store and the ticks together. */
  onReset?: () => void;
  /**
   * Which tile the module rack re-points when a card is chosen.
   *
   * §D only. Without it the rack is a reference with no specimen: it still
   * reads, and it teaches less.
   */
  rackTarget?: string;
}

const TourContentContext = createContext<TourContent | null>(null);

export function TourContentProvider({
  content,
  children,
}: {
  content: TourContent;
  children: ReactNode;
}) {
  // Memoised on the fields rather than on the object, because a section rebuilds
  // its content literal every render and a fresh context value would re-render
  // every tile beneath it on each keystroke in a step editor.
  const value = useMemo(
    () => content,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      content.lessons,
      content.brief,
      content.modules,
      content.cheat,
      content.onReset,
      content.rackTarget,
    ],
  );
  return <TourContentContext.Provider value={value}>{children}</TourContentContext.Provider>;
}

export function useTourContent(): TourContent {
  return useContext(TourContentContext) ?? EMPTY;
}

const EMPTY: TourContent = {};
