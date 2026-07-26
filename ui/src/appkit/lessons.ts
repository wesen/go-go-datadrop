import type { ReactNode } from "react";
import type { AcceptRequest, AcceptResult } from "../pbui";
import type { AppDispatch, RootState } from "../store";

/**
 * The contract between lesson content and the components that render it.
 *
 * In `appkit` for exactly the reason `AppDescriptor` is (DATADROP-6 DR-33):
 * this is not content and it is not a component, it is the interface the two
 * agree on. `organisms/LessonRail` imports it to know what to render;
 * `tour/lessons/*` imports it to know what to write. Both already depend on
 * `appkit`, so the placement adds no edge to the layer graph — whereas putting
 * it in `tour/` would have forced `organisms → tour`, and putting it in
 * `organisms/` would have forced `tour → components`, which DR-54 forbids.
 *
 * ## A lesson completes by predicate, never by button press (DR-50)
 *
 * `done` is a pure function of the store. That is the whole design, and the
 * consequences are worth stating because they are what make the tutorial worth
 * having:
 *
 *  - **Any route counts.** A step that says "filter to one species" is
 *    satisfied by the pipeline's `+ filter…` button, by right-clicking a legend
 *    swatch, by right-clicking a mark in the chart, or by a field chip's object
 *    menu — because all four write the same step into the same document. A
 *    tutorial that checked *which button* you pressed would be teaching button
 *    locations.
 *  - **It is testable without a DOM.** `done(state)` takes a literal object.
 *    Every shipped predicate has a unit test and none of them renders anything.
 *  - **It cannot drift from the application.** A predicate may call `evaluate`,
 *    `schemaAfter` and `buildPlot`, so "a bar chart that actually draws" is
 *    expressible as *the engine can draw this* rather than as a structural
 *    guess about the spec.
 *
 * There is no probe and no layout argument, unlike the prototype's
 * (`pbui-landing.jsx:1667-1674`, a ref written during render). Our layout lives
 * in the same store as the world, so a predicate that needs tile count and one
 * that needs the pipeline both read `RootState`.
 */
export interface Lesson {
  id: string;
  title: string;
  /** The prose. Bold names things on screen; `Kbd` names controls. */
  body: ReactNode;
  /**
   * Complete when this is true of the instance's state.
   *
   * A predicate that throws counts as false rather than crashing the rail — the
   * reader is free to delete the document a predicate names, and that is a
   * legal move rather than an error.
   */
  done?: (state: RootState) => boolean;
  /**
   * "▶ do it for me". Dispatches exactly what the interface dispatches.
   *
   * It does **not** mark the step complete. The predicate does, and the rail
   * remembers that ▶ was pressed so the tick can read WATCHED rather than
   * green. Watching is not the same as knowing.
   */
  run?: (ctx: LessonContext) => void | Promise<void>;
  /**
   * No predicate is possible, so a "✓ got it" button stands in.
   *
   * For the steps that teach *reading* rather than doing — "sweep the pointer
   * across the chips and watch the line at the bottom". There is nothing in the
   * store to observe, and pretending otherwise would mean inventing state to
   * make a lesson checkable.
   */
  manual?: boolean;
  /** One binary question, asked before the step that would reveal the answer. */
  predict?: Prediction;
}

export interface Prediction {
  q: ReactNode;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Shown once the reader commits — the reasoning, not just the verdict. */
  reveal: ReactNode;
}

/**
 * What a ▶ runner is given.
 *
 * `accept` is the reason `WorkbenchProviders` is a separate component from the
 * shell (DR-55): it returns a promise and lives in React context, so a rail
 * rendered outside the provider could not offer it — and the step that teaches
 * the accept protocol is the one least worth dropping, because accept is the
 * least familiar idea in the system.
 */
export interface LessonContext {
  dispatch: AppDispatch;
  getState: () => RootState;
  accept: (request: AcceptRequest) => Promise<AcceptResult | null>;
}

/** A capstone goal: the same predicate shape, with no ordering and no ▶. */
export interface Goal {
  id: string;
  label: ReactNode;
  done: (state: RootState) => boolean;
}

/**
 * One application's reference card.
 *
 * Five fixed rows, and `vs` is the one that earns its place. Four pairs get
 * confused — pipeline≠table, charts≠snapshots, watchlist≠inspector,
 * trace≠pipeline — and naming the confusion beats waiting for it.
 */
export interface ModuleEntry {
  /** The registered application id, so the card cannot describe a ghost. */
  id: string;
  /** What it is for, in one sentence. */
  what: ReactNode;
  /** Which presentation types are *born* in this tile. */
  emits: ReactNode;
  /** Which types its commands will pause and ask for. */
  accepts: ReactNode;
  /** What left-click and right-click do here. */
  lr: ReactNode;
  /** Which other module people confuse it with, and why they differ. */
  vs: ReactNode;
}
