import type { SourceRef, Table } from "../model/table";
import type { DatasetSummary, DropSummary, Me, StreamInfo } from "./client";

/**
 * A workbench that answers from committed tables instead of from a server.
 *
 * The landing page has to render charts with the API absent, returning 500, or
 * demanding an account — because a landing page's visitor has none of those.
 * At the same time the applications must be *byte-identical* to the product's
 * (DATADROP-7 DR-48): the moment a tour needs its own `ChartApp`, a lesson can
 * go stale without anything failing, and the claim that the tutorial is
 * executable documentation is dead.
 *
 * So the interception happens as far down as it can go: at the base query,
 * below every hook and every component. `useDocTable` still calls
 * `useStreamTableQuery`; RTK Query still keys the cache by arguments; the
 * request is simply answered from memory.
 *
 * ## Why here and not somewhere more obvious
 *
 * Three alternatives were weighed and rejected (guide §16):
 *
 *  - **Mock Service Worker.** A service worker shipped in the production bundle
 *    to serve fixtures, intercepting the real API on its way past. Far too much
 *    machinery, and it would sit between the product and its own server.
 *  - **A second `createApi`.** `reducerPath` and the generated hooks are fixed
 *    at creation, so two APIs means two hook sets and a conditional import at
 *    every call site. Fails the byte-identical requirement outright.
 *  - **A React context supplying the hook.** Tidiest on paper, and legal only
 *    while the context value never changes identity after mount — a rule no
 *    test can express and every future contributor can break.
 *
 * The base query wins because the fixture map travels on the store's thunk
 * extra argument, so its scope is *exactly* the instance's scope, and no call
 * site changes at all.
 */

/** One source and the table it answers with. */
export interface FixtureSource {
  source: SourceRef;
  table: Table;
  /** Shown in the sources browser. Optional; the drop name is the fallback. */
  note?: string;
}

export interface FixtureData {
  sources: FixtureSource[];
  /**
   * What `GET /v1/me` answers.
   *
   * Defaults to an anonymous visitor in `--auth=none` mode, which is what a
   * tour panel should be: authenticated so nothing gates, with no user, no
   * scopes and no provider, so nothing offers to sign anybody out.
   */
  me?: Me;
}

/**
 * A fixture map from tables that already know what they are.
 *
 * Every committed fixture carries its own `source` — `readings` is
 * `lab/temps`, `census` is `lab/census/rows.csv` — because the server sends it
 * and `scripts/make-fixtures.ts` keeps it. Deriving the map from that rather
 * than restating it removes the only way this can go quietly wrong: a source
 * ref beside a table it does not describe, which produces a 404 for a table
 * that is sitting right there.
 *
 * Takes the tables as arguments rather than importing them, because `api` may
 * import `model` and nothing else. The caller — tour content, or a story —
 * supplies them.
 */
export function fixturesFrom(...tables: Table[]): FixtureData {
  return { sources: tables.map((table) => ({ source: table.source, table })) };
}

/** The same five fields `useTableFor` compares on (`apps/useTable.ts:117-123`). */
export function sameSource(a: SourceRef, b: SourceRef): boolean {
  return (
    a.kind === b.kind &&
    a.drop === b.drop &&
    (a.stream ?? "") === (b.stream ?? "") &&
    (a.dataset ?? "") === (b.dataset ?? "") &&
    (a.path ?? "") === (b.path ?? "")
  );
}

const ANONYMOUS: Me = {
  auth_mode: "none",
  authenticated: true,
  kind: "anonymous",
  scopes: [],
  signup_enabled: false,
};

export function fixtureMe(data: FixtureData): Me {
  return data.me ?? ANONYMOUS;
}

/**
 * Apply the row budget, so the budget control is not a no-op.
 *
 * `Table.truncated`, `row_count` and `strategy` are read by `TruncationNotice`
 * and by `SourcePanel`'s budget selector. A fixture that always returned every
 * row would leave both of those describing something that never happens, and
 * §D's module card for the sources browser would be documenting a control that
 * does nothing.
 *
 * `strategy: "latest"` takes from the end, which is what the server does for a
 * stream: the interesting rows in an event stream are the recent ones.
 */
export function applyBudget(table: Table, limit: number): Table {
  if (!Number.isFinite(limit) || limit <= 0 || table.rows.length <= limit) {
    return table;
  }
  const rows = table.strategy === "latest" ? table.rows.slice(-limit) : table.rows.slice(0, limit);
  return { ...table, rows, row_count: rows.length, truncated: true };
}

/* ------------------------------------------------------------- listings -- */

/**
 * The drops these fixtures describe, derived rather than declared.
 *
 * Deriving means a tour section cannot list a drop it has no table for, which
 * is the failure that produces an empty chart and a reader who thinks they
 * broke something.
 */
export function fixtureDrops(data: FixtureData): { drops: DropSummary[] } {
  const names = [...new Set(data.sources.map((entry) => entry.source.drop))];
  return {
    drops: names.map((name) => ({
      name,
      created_at: FIXED_TIME,
      public_read: true,
      your_role: "reader" as const,
    })),
  };
}

export function fixtureStreams(data: FixtureData, drop: string): { streams: StreamInfo[] } {
  const streams = data.sources
    .filter((entry) => entry.source.kind === "stream" && entry.source.drop === drop)
    .map((entry) => ({
      stream: entry.source.stream ?? "events",
      sequence: entry.table.row_count,
      event_count: entry.table.row_count,
      last_received_at: FIXED_TIME,
    }));
  return { streams };
}

export function fixtureDatasets(data: FixtureData, drop: string): { datasets: DatasetSummary[] } {
  const names = [
    ...new Set(
      data.sources
        .filter((entry) => entry.source.kind === "dataset" && entry.source.drop === drop)
        .map((entry) => entry.source.dataset ?? ""),
    ),
  ].filter(Boolean);
  return {
    datasets: names.map((name) => ({ drop, name, created_at: FIXED_TIME })),
  };
}

/**
 * One timestamp for everything.
 *
 * `new Date()` in a fixture makes "created 3 seconds ago" render differently on
 * every load, and a landing page whose text changes as you read it is a landing
 * page nobody trusts. The prototype takes the same care with its seeded RNG
 * (pbui-landing.jsx:36-44): "so the mock data never jitters".
 */
export const FIXED_TIME = "2026-01-01T00:00:00Z";
