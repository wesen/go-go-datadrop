/*
 * Generate the committed Storybook/test fixtures.
 *
 *   bun run fixtures
 *
 * The output is COMMITTED and stories read the JSON. They do not call this
 * script: a story that computes its own data is a story whose failure might be
 * in the generator, and every screenshot diff becomes noise.
 *
 * Determinism comes from the prototype's seeded RNG (pbui-gog.jsx:94-105) rather
 * than Math.random, so re-running this produces byte-identical files and a
 * regenerated fixture shows up as an empty diff.
 *
 * Each fixture is a complete `Table` exactly as pkg/tabular emits one —
 * including `inferred_from`, `distinct` and `truncated` — so components see the
 * shape the server really sends rather than a convenient subset.
 */

import type { Field, Row, Table } from "../src/model/table";

/** mulberry32, as the prototype uses it. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number, mean: number, sd: number) =>
  mean + sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * (1 - r()));

const round = (v: number, digits = 1) => Number(v.toFixed(digits));

function field(
  name: string,
  type: Field["type"],
  inferred: Field["inferred_from"],
  rows: Row[],
): Field {
  const values = rows.map((row) => row[name]);
  const distinct = new Set(values.map((v) => JSON.stringify(v))).size;
  return {
    name,
    type,
    inferred_from: inferred,
    distinct,
    distinct_capped: false,
    null_count: values.filter((v) => v === null || v === undefined).length,
  };
}

/* ---------------------------------------------------------------- readings --
 * A stream table: envelope columns plus a flat payload, four stations over six
 * hours. The shape a live tail produces, and the one `defaultChart` has to get
 * right — the payload columns must beat `seq` and `id`.
 */
function readings(): Table {
  const r = rng(4021);
  const stations = [
    { name: "north", base: 19.5, drift: 0.8 },
    { name: "south", base: 22.1, drift: 0.5 },
    { name: "roof", base: 24.8, drift: 1.4 },
    { name: "cellar", base: 14.2, drift: 0.3 },
  ];
  const start = Date.parse("2026-07-24T09:00:00.000Z");
  const rows: Row[] = [];
  let seq = 0;

  for (let tick = 0; tick < 90; tick++) {
    for (const station of stations) {
      seq += 1;
      const at = new Date(start + tick * 4 * 60_000).toISOString();
      // The roof sensor faults for twenty readings — a visible step, and a
      // reason for a filter step to exist in a demo.
      const faulting = station.name === "roof" && tick >= 40 && tick < 60;
      rows.push({
        id: `evt-${String(seq).padStart(5, "0")}`,
        drop: "lab",
        stream: "temps",
        seq,
        time: at,
        received_at: at,
        source: "sensor-gateway",
        type: "reading",
        subject: station.name,
        "data.station": station.name,
        "data.temp_c": round(
          faulting ? 61 + gauss(r, 0, 0.6) : station.base + gauss(r, 0, station.drift),
        ),
        "data.humidity": round(48 + gauss(r, 0, 6)),
        "data.ok": !faulting,
      });
    }
  }

  return {
    source: { kind: "stream", drop: "lab", stream: "temps" },
    fields: [
      field("id", "n", "envelope", rows),
      field("drop", "n", "envelope", rows),
      field("stream", "n", "envelope", rows),
      field("seq", "q", "envelope", rows),
      field("time", "t", "envelope", rows),
      field("received_at", "t", "envelope", rows),
      field("source", "n", "envelope", rows),
      field("type", "n", "envelope", rows),
      field("subject", "n", "envelope", rows),
      field("data.station", "n", "values", rows),
      field("data.temp_c", "q", "values", rows),
      field("data.humidity", "q", "values", rows),
      field("data.ok", "n", "values", rows),
    ],
    rows,
    row_count: rows.length,
    truncated: false,
    strategy: "latest",
    next_after: seq,
  };
}

/* ------------------------------------------------------------------ census --
 * A dataset table with a schema, and the zero-padded identifier that a sniffer
 * would destroy. `station_id` is nominal BECAUSE THE SCHEMA SAYS SO, which is
 * the case every provenance badge in the interface exists to display.
 */
function census(): Table {
  const r = rng(977);
  const rows: Row[] = Array.from({ length: 24 }, (_, i) => ({
    station_id: String(i + 1).padStart(3, "0"),
    region: ["north", "south", "coastal"][i % 3] as string,
    population: Math.round(800 + gauss(r, 2400, 900)),
    area_km2: round(12 + gauss(r, 40, 18), 2),
  }));

  return {
    source: { kind: "dataset", drop: "lab", dataset: "census", version: 2, path: "rows.csv" },
    fields: [
      field("station_id", "n", "schema", rows),
      field("region", "n", "values", rows),
      field("population", "q", "schema", rows),
      field("area_km2", "q", "values", rows),
    ],
    rows,
    row_count: rows.length,
    truncated: false,
    strategy: "head",
  };
}

/* ------------------------------------------------------------------ batches --
 * A truncated table. Everything about the truncation notice, the row budget and
 * "of at least N+1" needs a fixture in this state, and it is not reachable by
 * clicking around a small demo.
 */
function batches(): Table {
  const r = rng(15300);
  const rows: Row[] = Array.from({ length: 500 }, (_, i) => ({
    batch: `B-${String(Math.floor(i / 25) + 1).padStart(3, "0")}`,
    line: `line-${(i % 4) + 1}`,
    yield_pct: round(72 + gauss(r, 8, 5), 2),
    mass_kg: round(120 + gauss(r, 40, 15), 1),
  }));

  return {
    source: {
      kind: "dataset",
      drop: "factory",
      dataset: "batches",
      version: 1,
      path: "rows.ndjson",
    },
    fields: [
      field("batch", "n", "values", rows),
      field("line", "n", "values", rows),
      field("yield_pct", "q", "values", rows),
      field("mass_kg", "q", "values", rows),
    ],
    rows,
    row_count: rows.length,
    // The server proved a further row exists by asking for limit + 1. The
    // notice must therefore read "of at least 501" — the defect found in
    // TruncationBanner.tsx during the salvage walk was printing 500 twice.
    truncated: true,
    strategy: "head",
  };
}

const FIXTURES: Record<string, Table> = {
  readings: readings(),
  census: census(),
  batches: batches(),
};

for (const [name, table] of Object.entries(FIXTURES)) {
  const path = new URL(`../src/fixtures/${name}.json`, import.meta.url).pathname;
  await Bun.write(path, `${JSON.stringify(table, null, 2)}\n`);
  console.log(
    `${name}.json — ${table.rows.length} rows × ${table.fields.length} fields` +
      (table.truncated ? " (truncated)" : ""),
  );
}
