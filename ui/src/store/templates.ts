import { parseBundle, type Bundle, type BundleKind } from "../model/portable";
import { findSecrets } from "../model/secrets";

/**
 * The template library: named bundles in `localStorage`.
 *
 * **One key holding an array**, not a key per template plus an index (DR-70).
 * The alternative survives a partial quota failure better and that is its only
 * advantage; against it, `localStorage` has no transactions, so an index that
 * says a template exists beside a missing item key is reachable through a
 * half-completed write, a cleared origin, or two tabs writing at once.
 * Reconciling an index against reality is more code than the failure it
 * prevents — and that failure, one oversized template making the whole library
 * unreadable, is better handled by refusing the oversized template at the door.
 *
 * **A template holds a `Bundle` verbatim, never a `Workspace`** (DR-71). The
 * shortcut is tempting: a `Workspace` is already serialisable and
 * `persist.validate` already checks it. Three reasons not to.
 *
 *  - A template stored today must load into a build shipped in six months. A
 *    bundle has a `version` and a validator built for hostile input; a raw
 *    `Workspace` has neither, so the moment `LayoutState` changes shape every
 *    stored template is silently wrong rather than loudly refused.
 *  - Documents. A raw `Workspace` references `docId`s that will not exist when
 *    it is loaded — the identical DR-64 failure, one storage medium over.
 *  - One format means one validator, one describe function, one set of caps and
 *    one set of tests. "Save to a template" and "copy to the clipboard" become
 *    the same code with a different sink, which is also why the library can
 *    offer **Copy to clipboard** on every row for free.
 *
 * Everything here takes and returns plain data and touches `localStorage`
 * directly, exactly as `persist.ts` does — no store, no React — which is what
 * makes it testable against a fake `localStorage`.
 *
 * ## Embedded instances share this library, and that is correct
 *
 * `localStorage` is per origin, not per store, so six workbenches on the
 * landing page see one library. Unlike the layout key (DATADROP-7 DR-47) that
 * is right — a template library *should* be one library — but writing to it
 * from a tour panel is not. The rule needs no new mechanism: `TemplatesApp` is
 * in no tour section's `apps` list, and `storeTemplate` is reached only through
 * a verb, so a stage that does not offer the application cannot produce the
 * verb.
 */

export const TEMPLATES_KEY = "datadrop-templates";
const TEMPLATES_VERSION = 1;

export const TEMPLATE_LIMITS = {
  count: 50,
  /** The same cap `parseBundle` applies, so the two cannot disagree. */
  bytesEach: 512 * 1024,
  bytesTotal: 2 * 1024 * 1024,
} as const;

export interface TemplateRecord {
  id: string;
  name: string;
  kind: BundleKind;
  /** ISO 8601, supplied by the caller — never read from a clock in here. */
  savedAt: string;
  /** The bundle, verbatim, as an object. */
  bundle: Bundle;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

interface Stored {
  version: number;
  templates: TemplateRecord[];
}

function isRecord(value: unknown): value is TemplateRecord {
  const record = value as Partial<TemplateRecord>;
  return (
    !!record &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.savedAt === "string" &&
    (record.kind === "tile" || record.kind === "workspace" || record.kind === "stage") &&
    !!record.bundle
  );
}

/**
 * Everything stored, or `[]`.
 *
 * Warns and returns empty on anything it cannot read, and never throws — the
 * same posture as `persist.load()`. A library that throws on a corrupt blob
 * takes the account stage down with it.
 */
export function listTemplates(): TemplateRecord[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed?.version !== TEMPLATES_VERSION || !Array.isArray(parsed.templates)) {
      console.warn("the stored templates are not readable by this version — ignoring them");
      return [];
    }
    // Each record is re-validated THROUGH `parseBundle`, not merely
    // shape-checked: a bundle that has been hand-edited in devtools, or written
    // by a newer build, must be refused here rather than at the moment someone
    // loads it into their layout.
    return parsed.templates.filter(
      (record) => isRecord(record) && parseBundle(JSON.stringify(record.bundle), record.kind).ok,
    );
  } catch (error) {
    console.warn("could not read the stored templates", error);
    return [];
  }
}

function write(templates: TemplateRecord[]): SaveResult {
  const payload: Stored = { version: TEMPLATES_VERSION, templates };
  const text = JSON.stringify(payload);
  if (text.length > TEMPLATE_LIMITS.bytesTotal) {
    return {
      ok: false,
      reason:
        `the template library would be ${Math.round(text.length / 1024)} kB; ` +
        `the limit is ${TEMPLATE_LIMITS.bytesTotal / 1024} kB — delete something first`,
    };
  }
  try {
    localStorage.setItem(TEMPLATES_KEY, text);
    return { ok: true };
  } catch (error) {
    // A full quota must not take the application down with it, and must not be
    // reported as success either. `QuotaExceededError` is the expected shape.
    console.warn("could not store the template", error);
    return { ok: false, reason: "this browser's storage is full" };
  }
}

/**
 * Store a bundle under a name.
 *
 * Every refusal is a sentence naming the limit, because the alternative — a
 * silent failure at the fiftieth template — is the failure mode the caps exist
 * to make visible.
 */
export function saveTemplate(record: TemplateRecord): SaveResult {
  const secrets = findSecrets(record.bundle);
  if (secrets.length > 0) {
    // The third door the credential guard watches. It cannot fire on a bundle
    // this build produced — `bundleFor*` already refused — so reaching it means
    // the record came from somewhere else.
    return {
      ok: false,
      reason: "that bundle contains something credential-shaped and was refused",
    };
  }

  const size = JSON.stringify(record).length;
  if (size > TEMPLATE_LIMITS.bytesEach) {
    return {
      ok: false,
      reason:
        `that template is ${Math.round(size / 1024)} kB; ` +
        `the limit is ${TEMPLATE_LIMITS.bytesEach / 1024} kB`,
    };
  }

  const existing = listTemplates();
  if (existing.length >= TEMPLATE_LIMITS.count) {
    return {
      ok: false,
      reason: `${TEMPLATE_LIMITS.count} templates is the limit — delete one first`,
    };
  }
  // Newest first, so the library reads as a history rather than as an archive.
  return write([record, ...existing]);
}

export function renameTemplate(id: string, name: string): SaveResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "a template needs a name" };
  const templates = listTemplates();
  if (!templates.some((t) => t.id === id)) return { ok: false, reason: "that template is gone" };
  return write(templates.map((t) => (t.id === id ? { ...t, name: trimmed } : t)));
}

export function deleteTemplate(id: string): void {
  write(listTemplates().filter((t) => t.id !== id));
}

/** How full the library is, for the line above the table. */
export function measureLibrary(templates: readonly TemplateRecord[]): {
  count: number;
  bytes: number;
} {
  return {
    count: templates.length,
    bytes: JSON.stringify({ version: TEMPLATES_VERSION, templates }).length,
  };
}

/** For tests and for a user who wants to start again. */
export function clearTemplates(): void {
  try {
    localStorage.removeItem(TEMPLATES_KEY);
  } catch {
    /* ignore */
  }
}
