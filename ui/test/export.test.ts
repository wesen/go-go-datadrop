import { describe, expect, test } from "bun:test";
import { csvField, toCSV } from "../src/export/csv";
import { decodeSpec, encodeSpec, specFromHash } from "../src/model/permalink";
import type { ChartSpec } from "../src/model/chart";
import type { Field } from "../src/model/table";

describe("csvField", () => {
  test("quotes only what RFC 4180 requires", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("has space")).toBe("has space");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("toCSV", () => {
  const fields: Field[] = [
    { name: "name", type: "n", inferred_from: "values" },
    { name: "value", type: "q", inferred_from: "values" },
  ];

  test("writes a header, the rows, and a trailing newline", () => {
    const csv = toCSV(fields, [
      { name: "a", value: 1 },
      { name: "b,c", value: 2 },
    ]);
    expect(csv).toBe('name,value\na,1\n"b,c",2\n');
  });

  test("an absent value is an empty cell, not the text null", () => {
    const csv = toCSV(fields, [{ name: "a" }, { name: "b", value: null }]);
    expect(csv).toBe("name,value\na,\nb,\n");
  });
});

describe("permalink", () => {
  const spec: ChartSpec = {
    source: { kind: "dataset", drop: "lab", dataset: "census", version: 3, path: "rows.csv" },
    steps: [{ id: "s1", kind: "filter", on: true, field: "region", op: "=", value: "north" }],
    geom: "bar",
    mapping: { x: "region", y: "population", color: null, size: null, facet: null },
    yScale: "log",
    typeOverrides: { code: "n" },
  };

  test("round-trips a whole specification", () => {
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec);
  });

  test("survives non-ASCII in a filter value", () => {
    const accented: ChartSpec = {
      ...spec,
      steps: [{ id: "s1", kind: "filter", on: true, field: "city", op: "=", value: "Zürich — 北" }],
    };
    expect(decodeSpec(encodeSpec(accented))).toEqual(accented);
  });

  test("reads a spec out of a location hash", () => {
    expect(specFromHash(`#chart=${encodeSpec(spec)}`)).toEqual(spec);
    expect(specFromHash("")).toBeNull();
    expect(specFromHash("#other=1")).toBeNull();
  });

  // A hand-edited or chat-truncated fragment must open an empty workbench, not
  // a blank screen.
  test("a malformed fragment decodes to null rather than throwing", () => {
    for (const bad of ["", "!!!", "eyJ", btoa("not a spec"), btoa("[]"), btoa("{}")]) {
      expect(decodeSpec(bad)).toBeNull();
    }
  });

  test("never carries a credential", () => {
    // The spec type has no token field, and this asserts the encoded payload
    // has no such key by any name a future edit might introduce.
    const encoded = encodeSpec(spec);
    const decoded = JSON.stringify(decodeSpec(encoded));
    for (const forbidden of ["token", "authorization", "bearer", "password"]) {
      expect(decoded.toLowerCase()).not.toContain(forbidden);
    }
  });
});
