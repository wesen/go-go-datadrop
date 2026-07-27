import type { ComponentType } from "react";
import type { DocId } from "../pbui/types";
import type { NodeId } from "../store/layout";

/**
 * The application registry.
 *
 * Ported from pbui-gog.jsx:2403-2422. A tile names an application by id and
 * nothing more, which is what makes swapping two tiles a two-field exchange
 * (DR-11) — the applications' state lives in the world, not in the tile.
 *
 * **In `appkit/` rather than in `apps/`, and that placement is load-bearing**
 * (DATADROP-6 DR-33). This file is not an application; it is the contract
 * applications register against. It lived under `apps/` for historical reasons,
 * and the single import of it from `organisms/Tile` was the *only* reason the
 * layer graph carried an `organisms -> apps` edge — which in turn forced
 * `apps -> organisms` to be forbidden, to keep the pair acyclic.
 *
 * That forbidden edge is what made the reference package's pattern illegal
 * here: presentational panels in `organisms`, with the applications as thin
 * containers above them. Moving 49 lines removes the edge, the cycle cannot
 * form because `organisms` no longer names `apps` at all, and the pattern
 * becomes available.
 */

export interface AppProps {
  leafId: NodeId;
  /** Present only for document-bound applications. */
  docId: DocId | null;
}

export interface AppDescriptor {
  id: string;
  title: string;
  /** A token name, never a hex value. */
  tone: string;
  /**
   * Document-bound applications show a document bar and can be re-pointed.
   *
   * Exactly four of them — chart, table, pipeline, encoding — because those are
   * the four that are *views of one composition*. Two tiles on one document
   * stay in lockstep because they read one object rather than two copies.
   */
  docBound: boolean;
  /**
   * Does the tile's object menu offer **Duplicate**? (DATADROP-8 DR-63)
   *
   * Separate from `singleton`, not one enum with two values, because the two
   * answer different questions and `launcher` answers them differently. A
   * workspace may hold many launchers — every split creates one — so it is not
   * a singleton; but *duplicating* an empty tile produces a second empty tile,
   * which is what the split button already does, so it offers no duplicate.
   *
   * Required rather than optional-with-a-default: twenty-five one-line diffs
   * are cheap, and a default that is right for twenty-four applications and
   * wrong for one is the kind of thing nobody finds. `test/apps.test.ts`
   * asserts this follows `docBound` unless a reason is written down.
   */
  duplicable: boolean;
  /**
   * May a workspace hold at most one of these? (DR-63)
   *
   * True for every application that is a pure function of the world — a second
   * `trace` tile renders identical pixels forever. The application picker shows
   * a singleton that is already open *disabled, with the reason*, rather than
   * hiding it: a user who never sees `trace` in the list does not learn that it
   * is a singleton, they conclude it is missing.
   */
  singleton: boolean;
  Component: ComponentType<AppProps>;
}

const REGISTRY = new Map<string, AppDescriptor>();

export function registerApp(descriptor: AppDescriptor): void {
  REGISTRY.set(descriptor.id, descriptor);
}

export function appFor(id: string): AppDescriptor | null {
  return REGISTRY.get(id) ?? null;
}

export function allApps(): AppDescriptor[] {
  return [...REGISTRY.values()];
}

export const DOC_BOUND = () =>
  allApps()
    .filter((a) => a.docBound)
    .map((a) => a.id);
