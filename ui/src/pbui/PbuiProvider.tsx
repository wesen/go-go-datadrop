import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { PbuiEnvironment, PresentationType } from "./types";
import type { Verb } from "./verbs";
import { CONVERSIONS } from "./conversions";

/**
 * The presentation protocol: accept, object menus, and the mouse-doc line.
 *
 * Knows nothing about charts. In principle this directory could be lifted into
 * a different application and used to present pathnames.
 */

export interface AcceptRequest {
  ptype: PresentationType | PresentationType[];
  prompt: string;
  /**
   * Narrows which presentations light up.
   *
   * This is what makes accept *typed* rather than merely *kinded*. The
   * prototype accepts any field for any channel and lets the plot engine refuse
   * afterwards; passing CHANNEL_ACCEPTS here means a nominal chip never becomes
   * clickable for y, and the invalid state is unreachable rather than reported.
   */
  filter?: (ptype: PresentationType, value: unknown) => boolean;
}

export interface AcceptResult {
  ptype: PresentationType;
  value: unknown;
}

export interface MenuState {
  ptype: PresentationType;
  value: unknown;
  x: number;
  y: number;
}

export interface PbuiContextValue {
  environment: PbuiEnvironment;

  /** Ask the user to point at an object. Resolves null if aborted. */
  accept(request: AcceptRequest): Promise<AcceptResult | null>;
  accepting: AcceptRequest | null;
  isAcceptable(ptype: PresentationType, value: unknown): boolean;
  satisfyAccept(ptype: PresentationType, value: unknown): void;
  abortAccept(): void;

  menu: MenuState | null;
  openMenu(ptype: PresentationType, value: unknown, x: number, y: number): void;
  closeMenu(): void;

  mouseDoc: string | null;
  setMouseDoc(text: string | null): void;

  /** Apply a verb. Phase 1 reports it; phase 2 dispatches to the world. */
  perform(verb: Verb): void;
}

export const PbuiContext = createContext<PbuiContextValue | null>(null);

const EMPTY_ENVIRONMENT: PbuiEnvironment = {
  fieldsFor: () => [],
  tableFor: () => null,
  activeDocId: null,
  nameOf: () => "α",
  overridesFor: () => undefined,
};

export function PbuiProvider({
  children,
  environment = EMPTY_ENVIRONMENT,
  onPerform,
  onAccept,
}: {
  children: ReactNode;
  environment?: PbuiEnvironment;
  /** Where verbs go. Phase 2 replaces this with a store dispatch. */
  onPerform?: (verb: Verb) => void;
  /** Observability hook, for stories and tests. */
  onAccept?: (result: AcceptResult | null) => void;
}) {
  const [accepting, setAccepting] = useState<AcceptRequest | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [mouseDoc, setMouseDoc] = useState<string | null>(null);

  /**
   * The pending resolver lives in a ref, never in state and never in the store.
   *
   * It is a function, and Redux state must be serialisable (guide §7.5). Keeping
   * it beside a `useState` flag is what lets presentations re-render into their
   * acceptable appearance while the continuation itself stays out of the way.
   */
  const pending = useRef<((result: AcceptResult | null) => void) | null>(null);

  const settle = useCallback(
    (result: AcceptResult | null) => {
      const resolve = pending.current;
      pending.current = null;
      setAccepting(null);
      onAccept?.(result);
      resolve?.(result);
    },
    [onAccept],
  );

  const accept = useCallback(
    (request: AcceptRequest) =>
      new Promise<AcceptResult | null>((resolve) => {
        // Nested accepts are refused rather than queued or stacked. Two pending
        // resolvers and one click is a bug that is no fun to find, and a command
        // that silently replaced another's request would apply the wrong
        // argument to the wrong command.
        if (pending.current) {
          resolve(null);
          return;
        }
        pending.current = resolve;
        setAccepting(request);
        setMenu(null);
      }),
    [],
  );

  const matches = useCallback(
    (request: AcceptRequest, ptype: PresentationType, value: unknown): boolean => {
      const wanted = Array.isArray(request.ptype) ? request.ptype : [request.ptype];
      if (wanted.includes(ptype)) {
        return request.filter ? request.filter(ptype, value) : true;
      }
      // A hard-coded conversion may satisfy the request from a different type —
      // clicking a category when a field is wanted (guide §8.6). Two of these
      // beat a general translator mechanism that can fire implicitly.
      for (const target of wanted) {
        const convert = CONVERSIONS[`${ptype}->${target}`];
        if (!convert) continue;
        const converted = convert(value);
        if (converted === undefined) continue;
        if (!request.filter || request.filter(target, converted)) return true;
      }
      return false;
    },
    [],
  );

  const isAcceptable = useCallback(
    (ptype: PresentationType, value: unknown) =>
      accepting !== null && matches(accepting, ptype, value),
    [accepting, matches],
  );

  const satisfyAccept = useCallback(
    (ptype: PresentationType, value: unknown) => {
      if (!accepting) return;
      const wanted = Array.isArray(accepting.ptype) ? accepting.ptype : [accepting.ptype];
      if (wanted.includes(ptype)) {
        settle({ ptype, value });
        return;
      }
      for (const target of wanted) {
        const convert = CONVERSIONS[`${ptype}->${target}`];
        const converted = convert?.(value);
        if (converted !== undefined) {
          settle({ ptype: target, value: converted });
          return;
        }
      }
    },
    [accepting, settle],
  );

  const abortAccept = useCallback(() => settle(null), [settle]);

  const value = useMemo<PbuiContextValue>(
    () => ({
      environment,
      accept,
      accepting,
      isAcceptable,
      satisfyAccept,
      abortAccept,
      menu,
      openMenu: (ptype, v, x, y) => setMenu({ ptype, value: v, x, y }),
      closeMenu: () => setMenu(null),
      mouseDoc,
      setMouseDoc,
      perform: (verb) => {
        setMenu(null);
        onPerform?.(verb);
      },
    }),
    [
      environment,
      accept,
      accepting,
      isAcceptable,
      satisfyAccept,
      abortAccept,
      menu,
      mouseDoc,
      onPerform,
    ],
  );

  return <PbuiContext.Provider value={value}>{children}</PbuiContext.Provider>;
}
