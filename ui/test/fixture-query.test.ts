import { describe, expect, test } from "bun:test";
import { PATHS } from "../src/api/client";
import { fixtureBaseQuery, sourceFromRequest } from "../src/api/fixtureBaseQuery";
import {
  applyBudget,
  fixtureDatasets,
  fixtureDrops,
  fixtureStreams,
  type FixtureData,
} from "../src/api/fixtures";
import { batches, census, readings } from "../src/fixtures";
import type { SourceRef } from "../src/model/table";

/**
 * The fixture transport (DATADROP-7 phase 3).
 *
 * `sourceFromRequest` re-parses a URL that `client.ts` built, because RTK Query
 * offers no hook between a generated query hook and the base query. That makes
 * it the fragile part of DR-48: a renamed query parameter or a changed path
 * shape breaks the landing page and *nothing else*, silently, leaving the
 * reader looking at "no fixture for this source" where a chart should be.
 *
 * The round-trip test below is the whole mitigation. It builds each request
 * with the API's own `query` function rather than with a hand-written URL —
 * which is the only version that fails when `client.ts` changes, and the reason
 * a test that asserts against literal strings would be worthless here.
 */

/* -------------------------------------------------------- the round trip -- */

/**
 * Build a request exactly as the endpoint would.
 *
 * `PATHS` holds the same functions `client.ts` hands to every endpoint's
 * `query`, so a renamed parameter or a changed path shape changes what this
 * test sees. A built RTK endpoint does not expose its `query` at runtime — the
 * first version of this test reached for `api.endpoints.X.query` and got
 * `undefined` — which is why the indirection exists at all. Hand-written URLs
 * here would produce a test that keeps passing through exactly the rename it
 * is meant to catch.
 */
const requestFor = PATHS;

describe("a table request round-trips back to its SourceRef", () => {
  test("a stream table", () => {
    const request = requestFor.streamTable({
      drop: "lab",
      stream: "temps",
      limit: 2000,
      order: "desc",
    });
    expect(sourceFromRequest(request)).toEqual({
      kind: "stream",
      drop: "lab",
      stream: "temps",
    });
  });

  test("a dataset table, at a numbered version", () => {
    const request = requestFor.datasetTable({
      drop: "lab",
      dataset: "census",
      version: 3,
      path: "people.csv",
      limit: 500,
    });
    expect(sourceFromRequest(request)).toEqual({
      kind: "dataset",
      drop: "lab",
      dataset: "census",
      version: 3,
      path: "people.csv",
    });
  });

  test("a dataset table at `latest` carries no version", () => {
    // `useTableFor` compares on drop, dataset and path and never on version, so
    // a ref carrying the string "latest" where a number belongs would be a type
    // lie nobody checks. Leaving it out is the honest encoding.
    const request = requestFor.datasetTable({
      drop: "lab",
      dataset: "census",
      version: "latest",
      path: "people.csv",
      limit: 500,
    });
    expect(sourceFromRequest(request)).toEqual({
      kind: "dataset",
      drop: "lab",
      dataset: "census",
      path: "people.csv",
    });
  });

  test("a drop name needing escaping survives the trip", () => {
    const request = requestFor.streamTable({
      drop: "lab/one two",
      stream: "temps",
      limit: 10,
    });
    expect(sourceFromRequest(request)?.drop).toBe("lab/one two");
  });

  test("a non-table request is not mistaken for one", () => {
    for (const request of [
      requestFor.me(),
      requestFor.drops(),
      requestFor.streams("lab"),
      requestFor.datasets("lab"),
      requestFor.dataset({ drop: "lab", dataset: "census" }),
      requestFor.datasetVersion({ drop: "lab", dataset: "census", version: 1 }),
    ]) {
      expect(sourceFromRequest(request)).toBeNull();
    }
  });
});

/* ----------------------------------------------------------- the answers -- */

const LAB: SourceRef = { kind: "stream", drop: "lab", stream: "temps" };
const CENSUS: SourceRef = { kind: "dataset", drop: "lab", dataset: "census", path: "people.csv" };

const DATA: FixtureData = {
  sources: [
    { source: LAB, table: readings },
    { source: CENSUS, table: census },
  ],
};

/** A base query that records whether it was reached. */
function transport() {
  const calls: unknown[] = [];
  const real = async (args: unknown) => {
    calls.push(args);
    return { data: "from the network" };
  };
  return { real, calls };
}

// The extra argument RTK Query hands a base query, reduced to what we read.
const withFixtures = { extra: { fixtures: DATA } } as never;
const withoutFixtures = { extra: {} } as never;

describe("the fixture base query", () => {
  test("answers a known stream from memory", async () => {
    const { real, calls } = transport();
    const query = fixtureBaseQuery(real as never);
    const result = await query(
      requestFor.streamTable({ drop: "lab", stream: "temps", limit: 5000 }),
      withFixtures,
      {},
    );
    expect((result as { data: typeof readings }).data.fields).toEqual(readings.fields);
    expect(calls).toEqual([]);
  });

  test("an unknown source is a 404, not an empty table", async () => {
    // An empty chart looks like the reader's mistake; a named refusal looks
    // like the bug in the tour content that it is.
    const { real } = transport();
    const query = fixtureBaseQuery(real as never);
    const result = await query(
      requestFor.streamTable({ drop: "nowhere", stream: "temps", limit: 10 }),
      withFixtures,
      {},
    );
    expect((result as { error: { status: number } }).error.status).toBe(404);
  });

  test("a fixture instance NEVER reaches the network", async () => {
    // Not "prefers not to". A panel that falls through on a machine with a dev
    // server running behaves differently from the same panel on a laptop with
    // no server, which is the class of difference that makes a bug report
    // unreproducible.
    const { real, calls } = transport();
    const query = fixtureBaseQuery(real as never);
    for (const request of [
      requestFor.me(),
      requestFor.drops(),
      requestFor.streams("lab"),
      requestFor.tokens(false),
      requestFor.sessions(),
    ]) {
      await query(request, withFixtures, {});
    }
    expect(calls).toEqual([]);
  });

  test("without a fixture map every request goes to the real transport", async () => {
    const { real, calls } = transport();
    const query = fixtureBaseQuery(real as never);
    const request = requestFor.streamTable({ drop: "lab", stream: "temps", limit: 10 });
    const result = await query(request, withoutFixtures, {});
    expect((result as { data: string }).data).toBe("from the network");
    expect(calls).toHaveLength(1);
  });

  test("an unsupported endpoint is refused with a reason", async () => {
    const { real } = transport();
    const query = fixtureBaseQuery(real as never);
    const result = await query(requestFor.tokens(false), withFixtures, {});
    const error = (result as { error: { status: number; data: string } }).error;
    expect(error.status).toBe(501);
    expect(error.data).toContain("fixture workbench");
  });
});

/* ------------------------------------------------------------ the budget -- */

describe("the row budget is real", () => {
  test("a table over budget is truncated and says so", () => {
    // Without this the budget selector in SourcePanel is a no-op and the
    // truncation notice describes something that never happens.
    const out = applyBudget(readings, 10);
    expect(out.rows).toHaveLength(10);
    expect(out.row_count).toBe(10);
    expect(out.truncated).toBe(true);
  });

  test("a table under budget is returned unchanged, identity included", () => {
    // Identity matters: `useDocPipeline` memoises on the table reference, so a
    // fresh object per request would defeat the memo on every refetch.
    const out = applyBudget(readings, readings.rows.length + 1);
    expect(out).toBe(readings);
  });

  test("a `latest` strategy takes from the end", () => {
    const stream = { ...readings, strategy: "latest" as const };
    const out = applyBudget(stream, 3);
    expect(out.rows).toEqual(readings.rows.slice(-3));
  });

  test("an already-truncated fixture keeps saying so", () => {
    // `batches` is committed pre-truncated, which is why it exists.
    expect(batches.truncated).toBe(true);
    expect(applyBudget(batches, 1_000_000).truncated).toBe(true);
  });
});

/* ---------------------------------------------------------- the listings -- */

describe("listings are derived from the sources, not declared", () => {
  test("the drops are the drops that have tables", () => {
    // Declared listings let a tour name a drop it has no table for, which
    // produces an empty chart and a reader who thinks they broke something.
    expect(fixtureDrops(DATA).drops.map((drop) => drop.name)).toEqual(["lab"]);
  });

  test("streams and datasets are separated by kind", () => {
    expect(fixtureStreams(DATA, "lab").streams.map((s) => s.stream)).toEqual(["temps"]);
    expect(fixtureDatasets(DATA, "lab").datasets.map((d) => d.name)).toEqual(["census"]);
  });

  test("a drop with nothing in it lists nothing rather than throwing", () => {
    expect(fixtureStreams(DATA, "elsewhere").streams).toEqual([]);
    expect(fixtureDatasets(DATA, "elsewhere").datasets).toEqual([]);
  });
});
