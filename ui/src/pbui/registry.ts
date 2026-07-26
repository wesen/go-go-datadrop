import type { PbuiEnvironment, PresentationType } from "./types";
import type { Action } from "./verbs";
import { catDescriptor } from "./descriptors/cat";
import { datumDescriptor } from "./descriptors/datum";
import { docDescriptor } from "./descriptors/doc";
import { fieldDescriptor } from "./descriptors/field";
import { geomDescriptor } from "./descriptors/geom";
import { sourceDescriptor } from "./descriptors/source";
import { memberDescriptor } from "./descriptors/member";
import { stepDescriptor } from "./descriptors/step";
import { tokenDescriptor } from "./descriptors/token";
import { uploadDescriptor } from "./descriptors/upload";
import { userDescriptor } from "./descriptors/user";

/**
 * One descriptor per presentation type.
 *
 * The prototype spreads each type across `labelFor`, `describe` and
 * `actionsFor` — three parallel if-chains inside a 314-line `App()`
 * (pbui-gog.jsx:2554-2681). Adding a type means editing three places in the
 * largest function in the file. Here it means adding one file.
 *
 * A descriptor holds no React. The chip that *draws* a presentation lives in
 * components/atoms, and the mapping from type to chip lives there too — because
 * pbui may not import components (the layer graph, enforced by
 * test/layers.test.ts), and putting a component in the descriptor would make
 * that a cycle.
 */
export interface PresentationDescriptor<V = unknown> {
  ptype: PresentationType;
  /** One line: menu headers, the mouse-doc bar, the trace. */
  label(value: V, env: PbuiEnvironment): string;
  /** The full object, for the inspector. Must be JSON-serialisable. */
  describe(value: V, env: PbuiEnvironment): unknown;
  /**
   * The menu, most likely entry first.
   *
   * Pure: (value, environment) in, serialisable verbs out. A test can assert
   * the exact verb a menu entry produces with a literal environment and no
   * store, no Provider, no DOM.
   */
  actions(value: V, env: PbuiEnvironment): Action[];
  /** The token naming this type's accent colour. */
  tone: string;
}

const DESCRIPTORS: Partial<Record<PresentationType, PresentationDescriptor<never>>> = {
  field: fieldDescriptor as PresentationDescriptor<never>,
  source: sourceDescriptor as PresentationDescriptor<never>,
  doc: docDescriptor as PresentationDescriptor<never>,
  cat: catDescriptor as PresentationDescriptor<never>,
  datum: datumDescriptor as PresentationDescriptor<never>,
  geom: geomDescriptor as PresentationDescriptor<never>,
  step: stepDescriptor as PresentationDescriptor<never>,
  user: userDescriptor as PresentationDescriptor<never>,
  token: tokenDescriptor as PresentationDescriptor<never>,
  member: memberDescriptor as PresentationDescriptor<never>,
  upload: uploadDescriptor as PresentationDescriptor<never>,
};

export function descriptorFor(ptype: PresentationType): PresentationDescriptor<never> | null {
  return DESCRIPTORS[ptype] ?? null;
}

export function labelFor(ptype: PresentationType, value: unknown, env: PbuiEnvironment): string {
  const descriptor = descriptorFor(ptype);
  if (descriptor) return descriptor.label(value as never, env);
  // The fallback has to handle object-valued presentations. `String(value)` on
  // one produces "[object Object]" in a menu header, which tells the reader
  // nothing about what they right-clicked.
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value)?.slice(0, 48) ?? String(value);
  } catch {
    return `<${ptype}>`;
  }
}

export function describeFor(
  ptype: PresentationType,
  value: unknown,
  env: PbuiEnvironment,
): unknown {
  const descriptor = descriptorFor(ptype);
  return descriptor ? descriptor.describe(value as never, env) : { presentationType: ptype, value };
}

export function actionsFor(
  ptype: PresentationType,
  value: unknown,
  env: PbuiEnvironment,
): Action[] {
  const descriptor = descriptorFor(ptype);
  return descriptor ? descriptor.actions(value as never, env) : [];
}

export function toneFor(ptype: PresentationType): string {
  return descriptorFor(ptype)?.tone ?? "var(--pbui-tone-neutral)";
}
