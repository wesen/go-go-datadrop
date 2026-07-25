import type { Channel } from "../model/chart";
import type { FieldType, SourceRef, Table } from "../model/table";

/**
 * The presentation type vocabulary (guide §7.1).
 *
 * A presentation type is the type as the *interface* understands it, which is
 * not always the type the language understands. `{docId, name}` and
 * `{docId, channel}` are both objects to TypeScript; to the interface one is a
 * field with the verbs of a field, and the other is a channel with the verbs of
 * a channel. That distinction is the whole mechanism.
 */
export type PresentationType =
  | "field"
  | "source"
  | "doc"
  | "step"
  | "geom"
  | "channel"
  | "datum"
  | "cat"
  | "chart"
  | "tile"
  | "workspace";

export type DocId = string;

/**
 * Every presentation minted inside a document-bound tile carries its owning
 * document.
 *
 * Clicking a mark in a tile showing document β must filter β, not whichever
 * document happens to be active. The prototype gets this right for marks and
 * wrong for fields (pbui-gog.jsx:2599 targets the active document from a chip
 * that knows better), and the asymmetry is a reliable source of surprise.
 *
 * `null` means the presentation genuinely has no owner — a field chip in the
 * source browser — and the verb falls back to the active document, with the
 * menu header naming which one.
 */
export interface FieldRef {
  docId: DocId | null;
  name: string;
}
export interface ChannelRef {
  docId: DocId | null;
  channel: Channel;
}
export interface CatRef {
  docId: DocId | null;
  field: string;
  value: string;
}
export interface DatumRef {
  docId: DocId | null;
  row: Record<string, unknown>;
}

/** The value shape carried by each presentation type. */
export interface PresentationValues {
  field: FieldRef;
  source: SourceRef;
  doc: DocId;
  step: string;
  geom: string;
  channel: ChannelRef;
  datum: DatumRef;
  cat: CatRef;
  chart: string;
  tile: string;
  workspace: string;
}

/**
 * What a descriptor can see.
 *
 * Deliberately narrow. A descriptor resolves a presentation against the tables
 * and documents currently loaded; it does not reach into the store, which is
 * what lets `actions` be tested with a literal object and no Provider.
 */
export interface PbuiEnvironment {
  /** The table behind a document, or the ambient one when docId is null. */
  tableFor(docId: DocId | null): Table | null;
  /** The document an ownerless presentation's verbs fall back to. */
  activeDocId: DocId | null;
  /** A document's display name, for menu headers. */
  nameOf(docId: DocId | null): string;
  /** Per-chart type overrides, so effective types resolve correctly. */
  overridesFor(docId: DocId | null): Record<string, FieldType> | undefined;
}
