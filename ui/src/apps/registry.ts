import type { ComponentType } from "react";
import type { DocId } from "../pbui/types";
import type { NodeId } from "../store/layout";

/**
 * The application registry.
 *
 * Ported from pbui-gog.jsx:2403-2422. A tile names an application by id and
 * nothing more, which is what makes swapping two tiles a two-field exchange
 * (DR-11) — the applications' state lives in the world, not in the tile.
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

export const DOC_BOUND = () => allApps().filter((a) => a.docBound).map((a) => a.id);
