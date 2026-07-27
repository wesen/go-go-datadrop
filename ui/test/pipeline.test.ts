import { describe, expect, test } from "bun:test";
import { evaluate, schemaAfter } from "../src/model/pipeline";
import type { Step } from "../src/model/pipeline";
import type { Field, Table } from "../src/model/table";

function field(name: string, type: Field["type"]): Field {
  return { name, type, inferred_from: "values" };
}

const table: Table = {
  source: { kind: "dataset", drop: "lab" },
  fields: [field("species", "n"), field("mass_g", "q"), field("wing_mm", "q")],
  rows: [
    { species: "adelie", mass_g: 3700, wing_mm: 190 },
    { species: "adelie", mass_g: 3900, wing_mm: 195 },
    { species: "gentoo", mass_g: 5000, wing_mm: 215 },
    { species: "gentoo", mass_g: 5400, wing_mm: 220 },
  ],
  row_count: 4,
  truncated: false,
  strategy: "head",
};

let counter = 0;

// Omit over a union collapses to the shared keys, so name the variant first.
type StepOf<K extends Step["kind"]> = Extract<Step, { kind: K }>;

const step = <K extends Step["kind"]>(
  s: Omit<StepOf<K>, "id" | "on"> & { kind: K; on?: boolean },
): StepOf<K> => ({ id: `t${++counter}`, on: true, ...s }) as unknown as StepOf<K>;

describe("filter", () => {
  test("a blank value passes everything", () => {
    const out = evaluate(table, [step({ kind: "filter", field: "species", op: "=", value: "" })]);
    expect(out.rows).toHaveLength(4);
    expect(out.err).toBeNull();
  });

  test("compares quantitative fields numerically", () => {
    const out = evaluate(table, [
      step({ kind: "filter", field: "mass_g", op: ">", value: "4000" }),
    ]);
    expect(out.rows).toHaveLength(2);
  });

  test("a field the pipeline no longer produces reports rather than throws", () => {
    const out = evaluate(table, [
      step({ kind: "summarize", by: "species", fn: "mean", field: "mass_g" }),
      step({ kind: "filter", field: "wing_mm", op: ">", value: "1" }),
    ]);
    expect(out.err).toContain("wing_mm");
    // The bad step is skipped, not fatal: two species groups survive.
    expect(out.rows).toHaveLength(2);
  });

  test("a disabled step does nothing", () => {
    const out = evaluate(table, [
      step({ kind: "filter", field: "mass_g", op: ">", value: "4000", on: false }),
    ]);
    expect(out.rows).toHaveLength(4);
  });
});

describe("derive", () => {
  test("appends a quantitative field", () => {
    const out = evaluate(table, [
      step({ kind: "derive", name: "ratio", op: "/", a: "mass_g", b: "wing_mm" }),
    ]);
    expect(out.fields.map((f) => f.name)).toContain("ratio");
    expect(out.fields.find((f) => f.name === "ratio")?.type).toBe("q");
    // 3700 / 190, computed independently.
    expect(out.rows[0]!.ratio as number).toBeCloseTo(19.473684, 5);
  });

  test("drops rows whose result is not finite, and counts them", () => {
    const withZero: Table = {
      ...table,
      rows: [...table.rows, { species: "zero", mass_g: 1, wing_mm: 0 }],
      row_count: 5,
    };
    const divide = step({ kind: "derive", name: "ratio", op: "/", a: "mass_g", b: "wing_mm" });
    const out = evaluate(withZero, [divide]);
    expect(out.rows).toHaveLength(4);
    expect(out.dropped[divide.id]).toBe(1);
  });

  test("log10 of a non-positive value drops the row", () => {
    const withZero: Table = {
      ...table,
      rows: [
        { species: "a", mass_g: 100, wing_mm: 1 },
        { species: "b", mass_g: 0, wing_mm: 1 },
      ],
      row_count: 2,
    };
    const out = evaluate(withZero, [
      step({ kind: "derive", name: "l", op: "log10", a: "mass_g", b: "" }),
    ]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.l).toBe(2);
  });
});

describe("summarize", () => {
  test("collapses to the key and the aggregate only", () => {
    const out = evaluate(table, [
      step({ kind: "summarize", by: "species", fn: "mean", field: "mass_g" }),
    ]);
    expect(out.fields.map((f) => f.name)).toEqual(["species", "mean_mass_g"]);
    expect(out.rows).toHaveLength(2);
    // (3700 + 3900) / 2 and (5000 + 5400) / 2.
    const byName = Object.fromEntries(out.rows.map((r) => [r.species, r.mean_mass_g]));
    expect(byName.adelie).toBe(3800);
    expect(byName.gentoo).toBe(5200);
  });

  test("count ignores the value field", () => {
    const out = evaluate(table, [
      step({ kind: "summarize", by: "species", fn: "count", field: "mass_g" }),
    ]);
    expect(out.fields.map((f) => f.name)).toEqual(["species", "count"]);
    expect(out.rows.every((r) => r.count === 2)).toBe(true);
  });
});

describe("sort and limit", () => {
  test("sorts quantitative fields numerically, not lexically", () => {
    const wide: Table = {
      ...table,
      rows: [
        { species: "a", mass_g: 9 },
        { species: "b", mass_g: 10 },
        { species: "c", mass_g: 100 },
      ],
      row_count: 3,
    };
    const out = evaluate(wide, [step({ kind: "sort", field: "mass_g", dir: "asc" })]);
    expect(out.rows.map((r) => r.mass_g)).toEqual([9, 10, 100]);
  });

  test("limit takes the head", () => {
    const out = evaluate(table, [step({ kind: "limit", n: 2 })]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]!.species).toBe("adelie");
  });
});

describe("schemaAfter", () => {
  test("sees fields produced by earlier steps", () => {
    const steps = [
      step({ kind: "derive", name: "ratio", op: "/", a: "mass_g", b: "wing_mm" }),
      step({ kind: "sort", field: "ratio", dir: "asc" }),
    ];
    // As of step 2, "ratio" exists.
    expect(schemaAfter(table, steps, 1).map((f) => f.name)).toContain("ratio");
    // As of step 1, it does not.
    expect(schemaAfter(table, steps, 0).map((f) => f.name)).not.toContain("ratio");
  });

  test("honours a type override without mutating the table", () => {
    const out = schemaAfter(table, [], undefined, { mass_g: "n" });
    expect(out.find((f) => f.name === "mass_g")?.type).toBe("n");
    expect(table.fields.find((f) => f.name === "mass_g")?.type).toBe("q");
  });
});
