import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/envelope-projection.json";
import type { Envelope } from "../src/model/live";
import { appendEnvelope, canonicalTime, projectEnvelope } from "../src/model/live";
import type { Field, Table } from "../src/model/table";

// The fixture is written by pkg/tabular/fixture_test.go:
//
//   go test ./pkg/tabular -run TestWriteLiveProjectionFixture -update
//
// It holds both the input envelopes and the projection the Go implementation
// produced from them, so this file is the thing that keeps the browser's live
// tail honest about agreeing with the server.

const events = fixture.events as unknown as Envelope[];
const expectedRows = fixture.rows as Record<string, unknown>[];
const expectedFields = fixture.fields as Field[];

describe("projectEnvelope agrees with pkg/tabular", () => {
  test("every fixture envelope projects to the server's row", () => {
    events.forEach((envelope, index) => {
      expect(projectEnvelope(envelope)).toEqual(expectedRows[index]!);
    });
  });

  test("the dotted-path column names match exactly", () => {
    const fromGo = new Set(expectedFields.map((f) => f.name));
    const fromTS = new Set(events.flatMap((e) => Object.keys(projectEnvelope(e))));
    // Go reports a column for every key any event had; TS produces per-row keys,
    // so the union of the rows is what must equal Go's field list.
    expect([...fromTS].sort()).toEqual([...fromGo].sort());
  });
});

describe("canonicalTime", () => {
  // The SSE endpoint emits Go's RFC3339Nano, which strips trailing zeros. The
  // table endpoint emits fixed-width milliseconds. One column must not hold
  // both spellings.
  test("normalizes the SSE spelling onto the table spelling", () => {
    expect(canonicalTime("2026-07-24T15:04:05.1Z")).toBe("2026-07-24T15:04:05.100Z");
    expect(canonicalTime("2026-07-24T15:04:05Z")).toBe("2026-07-24T15:04:05.000Z");
    expect(canonicalTime("2026-07-24T17:04:05+02:00")).toBe("2026-07-24T15:04:05.000Z");
  });

  test("passes an unparseable value through rather than losing it", () => {
    expect(canonicalTime("not a time")).toBe("not a time");
  });
});

function emptyTable(): Table {
  return {
    source: { kind: "stream", drop: "lab", stream: "temps" },
    fields: [],
    rows: [],
    row_count: 0,
    truncated: false,
    strategy: "latest",
    next_after: 41,
  };
}

describe("appendEnvelope", () => {
  test("adds columns an arriving event introduces", () => {
    const first = appendEnvelope(emptyTable(), events[0]!, 100);
    const names = first.table.fields.map((f) => f.name);
    expect(names).toContain("data.temp_c");
    expect(first.table.fields.find((f) => f.name === "data.temp_c")?.type).toBe("q");
    expect(first.table.fields.find((f) => f.name === "data.station")?.type).toBe("n");

    const second = appendEnvelope(first.table, events[1]!, 100);
    // "comment" appears only in the second event.
    expect(second.table.fields.map((f) => f.name)).toContain("data.comment");
    // The first row is left missing it rather than back-filled.
    expect("data.comment" in second.table.rows[0]!).toBe(false);
  });

  test("holds the row budget by evicting from the front", () => {
    let table = emptyTable();
    for (let seq = 42; seq < 52; seq++) {
      table = appendEnvelope(table, { ...events[0]!, id: `e${seq}`, seq }, 3).table;
    }
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]!.id).toBe("e49");
    expect(table.next_after).toBe(51);
  });

  test("reports a sequence gap rather than smoothing over it", () => {
    const contiguous = appendEnvelope(emptyTable(), { ...events[0]!, seq: 42 }, 100);
    expect(contiguous.gap).toBe(false);

    const skipped = appendEnvelope(contiguous.table, { ...events[0]!, seq: 60 }, 100);
    expect(skipped.gap).toBe(true);
    expect(skipped.table.next_after).toBe(60);
  });

  test("does not report a gap before any sequence is known", () => {
    const fresh: Table = { ...emptyTable(), next_after: 0 };
    expect(appendEnvelope(fresh, { ...events[0]!, seq: 900 }, 100).gap).toBe(false);
  });
});
