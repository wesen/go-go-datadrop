import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { api } from "../src/api/client";

/**
 * The read-only boundary, pinned (DR-27).
 *
 * `ui/src/api/client.ts` used to be able to say "every endpoint here is a GET",
 * which was a real security property: a compromised bundle could read exactly
 * what the caller could already read and write nothing. DATADROP-5 spends that
 * property, deliberately and narrowly, on six mutations.
 *
 * A change-detector test is normally a smell. On a security boundary it is the
 * mechanism: the desired behaviour when someone adds a seventh mutation is that
 * a test fails and a human looks at it. So this asserts the exact set rather
 * than a count or a pattern.
 */

/** Endpoint definitions RTK Query classified as mutations. */
function mutationNames(): string[] {
  const definitions = (
    api as unknown as {
      endpoints: Record<string, unknown>;
      util: { getRunningQueriesThunk?: unknown };
    }
  ).endpoints;

  // RTK Query hangs a `useMutation` hook on a mutation endpoint and a
  // `useQuery` hook on a query one, which is the cheapest honest way to tell
  // them apart without reaching into internals that may be renamed.
  return Object.entries(definitions)
    .filter(
      ([, endpoint]) => typeof (endpoint as { useMutation?: unknown }).useMutation === "function",
    )
    .map(([name]) => name)
    .sort();
}

describe("the API surface", () => {
  test("the set of mutating endpoints is exactly the reviewed set", () => {
    // Every entry is an ACCOUNT or MEMBERSHIP operation. None touches a
    // source, a table, a chart, a pipeline or a snapshot, which is the
    // property the second test below states directly.
    //
    // Note what is absent: the dataset upload triad. The uploader uses `fetch`
    // rather than RTK Query, because its payload is a File, its response is
    // discarded, and caching a 400 MB upload would be actively harmful. The
    // guide predicted six mutations here; there are five, and the difference
    // is that decision.
    expect(mutationNames()).toEqual([
      "claimDrop",
      "createToken",
      "removeMember",
      "revokeToken",
      "setMember",
      "signOut",
    ]);
  });

  test("nothing in the chart workbench mutates", () => {
    // Sources, tables, charts, pipelines and snapshots stay read-only. Every
    // mutation is an ACCOUNT operation, and the names say so.
    const chartish = ["Drops", "Streams", "Datasets", "Table", "Dataset"];
    for (const name of mutationNames()) {
      for (const fragment of chartish) {
        expect(name.includes(fragment)).toBe(false);
      }
    }
  });

  test("cookies are same-origin, never include", () => {
    // `credentials: "same-origin"` is what attaches the session cookie to our
    // own requests. It must never be "include": that would send the cookie to a
    // cross-origin baseUrl, which is the mistake the server's CSRF check exists
    // to survive rather than to permit.
    //
    // Asserted against the source because the option is swallowed by
    // fetchBaseQuery's closure and is not reachable from the built api object —
    // and an unreachable security-relevant setting is exactly the kind that
    // gets changed without anyone noticing.
    const source = readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8");
    expect(source).toContain('credentials: "same-origin"');
    expect(source).not.toContain('credentials: "include"');
  });
});
