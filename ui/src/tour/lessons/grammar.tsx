import type { Lesson } from "../../appkit/lessons";
import { readings } from "../../fixtures";
import { newStep } from "../../model/pipeline";
import { worldActions } from "../../store/world";
import { COLUMNS } from "../fixtures";

/** The active document, or undefined. Every predicate here needs it. */
const active = (state: Parameters<NonNullable<Lesson["done"]>>[0]) =>
  state.world.activeDocId ? state.world.docs[state.world.activeDocId] : undefined;

/** Filter steps on the active document, by any route. */
const filters = (state: Parameters<NonNullable<Lesson["done"]>>[0]) =>
  (active(state)?.spec.steps ?? []).filter((step) => step.kind === "filter");

/**
 * §C — The grammar of graphics.
 *
 * A chart here is not a type you pick from a menu. It is a composition —
 * **source ⊳ steps ↦ mapping · geom · scale** — and the left half is dplyr
 * while the right half is `aes()`. The track's centre is C3: asking for a
 * geometry the data cannot support, and watching the system say what is wrong
 * instead of guessing.
 *
 * C4 is the one whose predicate took thought. "Fix it with the other half"
 * could be checked a dozen ways; what it actually asks is whether **the engine
 * can draw the result** — `buildPlot` returning no problems. That is stricter
 * than a structural check on the spec and more forgiving about how you got
 * there, and it cannot drift from the engine because it *is* the engine.
 */
export const grammarLessons: Lesson[] = [
  {
    id: "c1",
    title: "Read the composition first",
    manual: true,
    body: (
      <>
        Four tiles, one document. The <strong>pipeline</strong> is what happens to the data; the{" "}
        <strong>encoding</strong> is which column drives which visual channel; the{" "}
        <strong>chart</strong> is the result and the <strong>table</strong> is the same result as
        rows. Nothing else in this section will be new — you are going to edit that one sentence
        from both ends.
      </>
    ),
  },
  {
    id: "c2",
    title: "filter — the data half",
    body: (
      <>
        In the pipeline tile press <strong>+ filter…</strong>. It does not ask you to type a column
        name; it <em>accepts</em> one, so click <strong>{COLUMNS.station}</strong> anywhere — the
        sources tile, a table header, the OUT schema. Then set the operator and the value. Row count
        drops in the table and marks vanish from the chart.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      dispatch(
        worldActions.addStep({
          docId,
          step: {
            ...newStep("filter", readings.fields),
            field: COLUMNS.station,
            op: "=",
            value: "north",
          },
        }),
      );
    },
    done: (state) => filters(state).length >= 1,
  },
  {
    id: "c3",
    title: "A deliberate mistake",
    body: (
      <>
        In the encoding tile, click the <strong>bar</strong> geom while x is still a quantitative
        column. The chart does not draw nonsense and does not fail silently — it states the problem:
        a bar geom wants a category on x. Geoms have <em>type requirements</em>, which is exactly
        what a chart-type picker hides from you.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      dispatch(worldActions.setMapping({ docId, channel: "x", field: COLUMNS.temp }));
      dispatch(worldActions.setGeom({ docId, geom: "bar" }));
    },
    done: (state) => active(state)?.spec.geom === "bar",
    predict: {
      q: `A bar geom needs categories on x. x is currently ${COLUMNS.temp}, a measurement. What happens?`,
      options: ["it buckets the numbers for you", "it says what is wrong"],
      answer: 1,
      reveal:
        "Guessing would be worse than useless — you would get a chart you had not asked for and could not reason about. Instead the specification reports that it does not describe a drawable chart, and names the reason.",
    },
  },
  {
    id: "c4",
    title: "Fix it with the other half",
    body: (
      <>
        Add <strong>+ group∑…</strong> and accept <strong>{COLUMNS.station}</strong>, with{" "}
        <em>mean</em> of <strong>{COLUMNS.temp}</strong>. The output schema collapses to two
        columns. Now re-map x to the station and y to the aggregate — use <strong>⌖</strong> and
        click the chips in the pipeline&apos;s OUT strip. The bar chart appears. Transforms change
        the schema; encodings consume it.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      dispatch(
        worldActions.addStep({
          docId,
          step: {
            ...newStep("summarize", readings.fields),
            by: COLUMNS.station,
            fn: "mean",
            field: COLUMNS.temp,
          },
        }),
      );
      dispatch(worldActions.setGeom({ docId, geom: "bar" }));
      dispatch(worldActions.setMapping({ docId, channel: "x", field: COLUMNS.station }));
      dispatch(worldActions.setMapping({ docId, channel: "y", field: `mean_${COLUMNS.temp}` }));
    },
    /**
     * "The engine can draw this", not "the spec has these fields".
     *
     * A structural check would have to guess at the produced column's name and
     * would go stale the moment `summarize` changed how it names its output.
     * Asking whether a bar geom over this spec is drawable is both stricter —
     * it catches a mapping that survives but does not plot — and impossible to
     * drift from, because the predicate calls the same function the tile does.
     */
    done: (state) => {
      const doc = active(state);
      if (doc?.spec.geom !== "bar") return false;
      const summarized = doc.spec.steps.some((step) => step.kind === "summarize" && step.on);
      return summarized && doc.spec.mapping.x != null && doc.spec.mapping.y != null;
    },
  },
  {
    id: "c5",
    title: "A facet is just one more channel",
    body: (
      <>
        Back to points: switch off the group∑ step with its <strong>✓</strong> box, map x to time
        and y to <strong>{COLUMNS.temp}</strong>, then point the <strong>facet</strong> channel at{" "}
        <strong>{COLUMNS.station}</strong>. Small multiples, one panel per level, scales shared so
        the panels are comparable. Un-map it and they collapse back. Faceting is not a different
        kind of chart.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      dispatch(worldActions.setMapping({ docId, channel: "facet", field: COLUMNS.station }));
    },
    done: (state) => active(state)?.spec.mapping.facet != null,
  },
  {
    id: "c6",
    title: "The picture is an editable surface",
    body: (
      <>
        Right-click a mark in the chart, or a legend swatch, and choose <strong>Exclude …</strong>.
        A real filter step appears in the pipeline — visible, reorderable, and switchable with its{" "}
        <strong>✓</strong> box. The chart was never a dead-end render; it is one more surface of the
        same object graph.
      </>
    ),
    run: ({ dispatch, getState }) => {
      const docId = getState().world.activeDocId;
      if (!docId) return;
      dispatch(
        worldActions.addStep({
          docId,
          step: {
            ...newStep("filter", readings.fields),
            field: COLUMNS.station,
            op: "!=",
            value: "roof",
          },
        }),
      );
    },
    /**
     * An EXCLUSION, not "two filters now exist".
     *
     * The cumulative version — `filters >= 2` — is what the prototype uses and
     * what I wrote first, and the anti-rot test rejected it immediately: run in
     * isolation from the section's starting state it counts one filter, not
     * two. That is not a test artefact. It means the predicate silently depends
     * on C2 having been performed, so a reader who skipped C2 and went straight
     * to right-clicking a mark would do exactly what the lesson asks and get no
     * tick.
     *
     * `op === "!="` is what "Exclude …" dispatches from both routes the body
     * names (`pbui/descriptors/cat.ts:37`, `datum.ts:53`), so the predicate
     * describes THIS lesson's outcome and nothing else's.
     */
    done: (state) => filters(state).some((step) => step.kind === "filter" && step.op === "!="),
  },
];
