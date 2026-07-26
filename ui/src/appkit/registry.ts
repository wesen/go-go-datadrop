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
