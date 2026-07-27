import type { BaseQueryFn, FetchArgs } from "@reduxjs/toolkit/query";
import type { SourceRef } from "../model/table";
import {
  applyBudget,
  fixtureDatasets,
  fixtureDrops,
  fixtureMe,
  fixtureStreams,
  sameSource,
  type FixtureData,
} from "./fixtures";

/**
 * A base query that answers from a fixture map, or falls through to the real
 * one when there is no map (DATADROP-7 DR-48).
 *
 * The map arrives on the store's thunk extra argument, which RTK Query hands to
 * every base query as `api.extra`. That is the whole trick, and it is why this
 * mechanism was chosen over three tidier-looking ones: the extra argument is
 * configured per store, so the fixture map's scope is exactly the workbench
 * instance's scope, and not one call site above here has to know.
 *
 * ## The fragile part, named
 *
 * `sourceFromRequest` re-parses a URL that `client.ts` built, because RTK Query
 * offers no hook between the generated hook and the base query. A renamed query
 * parameter or a changed path shape breaks the landing page and nothing else,
 * silently, and the reader sees "no fixture for this source" where a chart
 * should be.
 *
 * `test/fixture-query.test.ts` is the mitigation and it is not optional: it
 * builds each request with the API's own `query` function, parses it back with
 * the function below, and asserts the round trip. That test is the only thing
 * standing between a rename and a page full of empty panels.
 */

interface Extra {
  fixtures?: FixtureData;
}

/** The path and params of a request, whichever form the endpoint used. */
function partsOf(args: string | FetchArgs): { url: string; params: Record<string, unknown> } {
  if (typeof args === "string") return { url: args, params: {} };
  return { url: args.url, params: (args.params ?? {}) as Record<string, unknown> };
}

/**
 * A `SourceRef` from a table request, or null if this is not one.
 *
 * The two shapes `client.ts` builds:
 *
 *   /drops/{drop}/table                                        ?stream=&limit=&order=
 *   /drops/{drop}/datasets/{dataset}/versions/{version}/table   ?path=&limit=
 */
export function sourceFromRequest(args: string | FetchArgs): SourceRef | null {
  const { url, params } = partsOf(args);

  const stream = /^\/drops\/([^/]+)\/table$/.exec(url);
  if (stream) {
    return {
      kind: "stream",
      drop: decodeURIComponent(stream[1] as string),
      stream: String(params.stream ?? "events"),
    };
  }

  const dataset = /^\/drops\/([^/]+)\/datasets\/([^/]+)\/versions\/([^/]+)\/table$/.exec(url);
  if (dataset) {
    const version = dataset[3] as string;
    return {
      kind: "dataset",
      drop: decodeURIComponent(dataset[1] as string),
      dataset: decodeURIComponent(dataset[2] as string),
      // "latest" stays out of the ref: `useTableFor` compares on drop, dataset
      // and path, never on version, and a ref carrying the string "latest"
      // where a number belongs is a type lie waiting to be believed.
      ...(version === "latest" ? {} : { version: Number(version) }),
      path: String(params.path ?? ""),
    };
  }

  return null;
}

/** The row budget a table request asked for. Falls back to the server's own. */
function limitOf(args: string | FetchArgs): number {
  const { params } = partsOf(args);
  const limit = Number(params.limit);
  return Number.isFinite(limit) && limit > 0 ? limit : 2000;
}

export function fixtureBaseQuery(real: BaseQueryFn): BaseQueryFn {
  return async (args, api, extraOptions) => {
    const fixtures = (api.extra as Extra | undefined)?.fixtures;
    if (!fixtures) return real(args, api, extraOptions);

    const typed = args as string | FetchArgs;
    const { url } = partsOf(typed);

    const source = sourceFromRequest(typed);
    if (source) {
      const hit = fixtures.sources.find((entry) => sameSource(entry.source, source));
      if (hit) return { data: applyBudget(hit.table, limitOf(typed)) };
      // Deliberately a 404 rather than an empty table. An unknown source is a
      // bug in the tour content, and a panel reading "no such source" says so
      // where an empty chart would look like the reader's mistake.
      return { error: { status: 404, data: `no fixture for ${describe(source)}` } };
    }

    if (url === "/me") return { data: fixtureMe(fixtures) };
    if (url === "/drops") return { data: fixtureDrops(fixtures) };

    const streams = /^\/drops\/([^/]+)\/streams$/.exec(url);
    if (streams) {
      return { data: fixtureStreams(fixtures, decodeURIComponent(streams[1] as string)) };
    }

    const datasets = /^\/drops\/([^/]+)\/datasets$/.exec(url);
    if (datasets) {
      return { data: fixtureDatasets(fixtures, decodeURIComponent(datasets[1] as string)) };
    }

    /**
     * Everything else is refused, and the refusal is the design.
     *
     * A fixture-backed instance NEVER reaches the network. Falling through here
     * would mean a tour panel on a machine with a dev server running behaves
     * differently from the same panel on a laptop with no server — which is the
     * class of difference that makes a bug report unreproducible.
     *
     * The account endpoints land here, which is correct: an embedded workbench
     * has no session to list and no token to mint, and a 501 in the console is
     * a better answer than a real mutation aimed at a real server.
     */
    return { error: { status: 501, data: `${url} is not available in a fixture workbench` } };
  };
}

function describe(source: SourceRef): string {
  return source.kind === "stream"
    ? `stream ${source.drop}/${source.stream}`
    : `dataset ${source.drop}/${source.dataset}${source.path ? `/${source.path}` : ""}`;
}
