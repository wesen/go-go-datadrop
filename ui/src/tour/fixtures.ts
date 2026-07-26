import { fixturesFrom, type FixtureData } from "../api/fixtures";
import { readings, census } from "../fixtures";
import { defaultChart } from "../model/chart";
import type { PreloadedState } from "../store";
import { leaf, split, type LayoutState } from "../store/layout";
import { newId } from "../store/world";

/**
 * The data and the starting states every tour section is seeded with.
 *
 * Two sources, both committed JSON, both deterministic — so every reader sees
 * the same numbers and ↺ really does restore. `readings` is an event stream
 * from four weather stations; `census` is a dataset of twenty-four stations
 * across three regions.
 *
 * **The dotted column names are the trap this file exists to avoid.**
 * `readings` is an event stream, so its payload columns are `data.temp_c` and
 * `data.station`, not `temp_c` and `station`. A lesson body that names the
 * wrong one reads as broken to the reader — the chart says "y ↦ temp_c is not
 * in the pipeline output", which looks like our defect rather than their typo.
 * `src/fixtures/charts.ts` was written for the same reason after it happened
 * once; naming them here, once, is what stops it happening again.
 */
export const COLUMNS = {
  station: "data.station",
  temp: "data.temp_c",
  humidity: "data.humidity",
  ok: "data.ok",
  time: "time",
  seq: "seq",
} as const;

export const CENSUS_COLUMNS = {
  region: "region",
  population: "population",
  area: "area_km2",
  station: "station_id",
} as const;

/** Both sources, answered from memory. Every section uses the same map. */
export const TOUR_FIXTURES: FixtureData = fixturesFrom(readings, census);

/**
 * A world holding one document already pointed at the stream.
 *
 * `defaultChart(readings)` is the same function `useDocTable` applies when a
 * table first arrives, so the encoding a section starts with is the encoding
 * the product would infer. Hand-writing one would be asserting what the engine
 * does rather than showing it, and the two drift the first time `defaultChart`
 * changes.
 */
export function seedStream(): NonNullable<PreloadedState["world"]> {
  const id = newId();
  return {
    docs: {
      [id]: {
        id,
        name: "α",
        limit: 2000,
        spec: { ...defaultChart(readings), source: readings.source, steps: [] },
      },
    },
    docOrder: [id],
    activeDocId: id,
  };
}

/** Two documents: the stream and the dataset. §B needs a second one to re-point to. */
export function seedTwo(): NonNullable<PreloadedState["world"]> {
  const a = newId();
  const b = newId();
  return {
    docs: {
      [a]: {
        id: a,
        name: "α",
        limit: 2000,
        spec: { ...defaultChart(readings), source: readings.source, steps: [] },
      },
      [b]: {
        id: b,
        name: "β",
        limit: 2000,
        spec: { ...defaultChart(census), source: census.source, steps: [] },
      },
    },
    docOrder: [a, b],
    activeDocId: a,
  };
}

const space = (name: string, tree: LayoutState["spaces"][number]["tree"]): LayoutState => {
  const id = newId();
  return { spaces: [{ id, name, tree }], currentSpaceId: id };
};

/**
 * Each section seeds its world and its layout TOGETHER.
 *
 * They were separate functions until the anti-rot test failed on lesson B3.
 * `leaf("chart")` defaults `docId` to null, which means *follow the active
 * document* — so both tiles displayed α and §B's opening sentence ("both tiles
 * are pointed at document α — look at their DOC strips") was visually true and
 * structurally false. Re-pointing one then left the other still following the
 * active document, so "two different documents are visible" was never reached
 * and the lesson could not tick.
 *
 * A tile that is *supposed* to be bound must be bound explicitly, and that
 * needs the document id at layout-construction time. Hence one function per
 * section rather than two.
 */
export interface Seed {
  world: NonNullable<PreloadedState["world"]>;
  layout: LayoutState;
}

/** §A: browse the sources, inspect into a panel, keep things in a watchlist. */
export function objectsSeed(): Seed {
  return {
    world: seedStream(),
    layout: space(
      "objects",
      split("row", leaf("sources"), split("col", leaf("inspector"), leaf("watch"), 0.56), 0.46),
    ),
  };
}

/** §B: two views of ONE document, both explicitly bound to it. */
export function layoutSeed(): Seed {
  const world = seedTwo();
  const first = world.docOrder?.[0] ?? null;
  return {
    world,
    layout: space("two views", split("row", leaf("chart", first), leaf("table", first), 0.56)),
  };
}

/** §C: the whole composition at once — pipeline and encoding left, chart and table right. */
export function grammarSeed(): Seed {
  const world = seedStream();
  const doc = world.docOrder?.[0] ?? null;
  return {
    world,
    layout: space(
      "build",
      split(
        "row",
        split("col", leaf("pipeline", doc), leaf("encode", doc), 0.54),
        split("col", leaf("chart", doc), leaf("table", doc), 0.66),
        0.44,
      ),
    ),
  };
}

/** §D: one large tile the rack re-points, with a chart to check the claim against. */
export function rackSeed(): Seed {
  const world = seedStream();
  const doc = world.docOrder?.[0] ?? null;
  return {
    world,
    layout: space(
      "rack",
      split("row", leaf("sources"), split("col", leaf("chart", doc), leaf("inspector"), 0.56), 0.58),
    ),
  };
}

/**
 * The brief: everything, and no instructions.
 *
 * Deliberately NOT seeded with a table tile beside the chart — goal E5 asks the
 * reader to put one there, and a layout that already satisfies a goal is a goal
 * that teaches nothing.
 */
export function briefSeed(): Seed {
  const world = seedStream();
  const doc = world.docOrder?.[0] ?? null;
  return {
    world,
    layout: space(
      "build",
      split("row", split("col", leaf("pipeline", doc), leaf("encode", doc), 0.55), leaf("chart", doc), 0.46),
    ),
  };
}
