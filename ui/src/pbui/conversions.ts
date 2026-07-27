import type { CatRef, FieldRef, PresentationType } from "./types";

/**
 * The two presentation-type conversions we support.
 *
 * CLIM's presentation translators let a click on a type-B presentation satisfy
 * a request for type A through a declared rule. We are not building the general
 * mechanism (guide §8.6): a rule set that fires implicitly is hard to explain
 * and harder to debug, and two hard-coded cases cover everything that actually
 * arises.
 *
 * If a third appears, that is the moment to reconsider — not before.
 */
type Conversion = (value: unknown) => unknown | undefined;

export const CONVERSIONS: Partial<Record<`${PresentationType}->${PresentationType}`, Conversion>> =
  {
    // A legend swatch knows which field it is a level of, so clicking one can
    // answer "which field?" — which is what makes "facet by this" reachable from
    // the chart rather than only from the encoding editor.
    "cat->field": (value) => {
      const cat = value as CatRef;
      return cat?.field ? ({ docId: cat.docId, name: cat.field } satisfies FieldRef) : undefined;
    },
    // A document knows its source.
    "doc->source": () => undefined, // filled in by the shell in phase 2, which knows the docs
  };
