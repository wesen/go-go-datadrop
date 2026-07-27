import { useContext } from "react";
import { PbuiContext, type PbuiContextValue } from "./PbuiProvider";

/**
 * Reach the presentation protocol.
 *
 * Throws rather than returning null when there is no provider. A presentation
 * rendered outside one is a component that will silently do nothing on click,
 * and silence is the worst possible failure for an interface whose entire
 * premise is that everything on screen is live.
 */
export function usePbui(): PbuiContextValue {
  const context = useContext(PbuiContext);
  if (!context) {
    throw new Error("usePbui outside a PbuiProvider — a presentation cannot be live without one");
  }
  return context;
}
