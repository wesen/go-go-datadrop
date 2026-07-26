import { newStep } from "../../model/pipeline";
import { registerApp, type AppProps } from "../../appkit/registry";
import { worldActions } from "../../store/world";
import { Step, TutorialBody, TutorialHead } from "./Tutorial";

/** Tutorial 2 — the five pipeline verbs. */
function Tut2(_props: AppProps) {
  return (
    <TutorialBody>
      <TutorialHead title="2 · pipeline verbs">
        A chart's data is the output of a chain of tidyverse-style verbs: filter ⊳ derive ⊳ group∑ ⊳
        sort ⊳ limit. The pipeline tile edits the chain; the table shows the live output. Load{" "}
        <code>lab / temps</code> in the sources tile first.
      </TutorialHead>

      <Step
        n={1}
        runLabel="filter station ≠ roof"
        run={({ dispatch, state }) =>
          dispatch(
            worldActions.addStep({
              docId: state.world.activeDocId,
              step: { ...newStep("filter", []), field: "data.station", op: "!=", value: "roof" },
            }),
          )
        }
      >
        <strong>filter</strong> keeps rows. Watch the row count in the table drop and the chart lose
        a series.
      </Step>

      <Step
        n={2}
        runLabel="derive load = temp_c / humidity"
        run={({ dispatch, state }) =>
          dispatch(
            worldActions.addStep({
              docId: state.world.activeDocId,
              step: {
                ...newStep("derive", []),
                name: "load",
                a: "data.temp_c",
                op: "/",
                b: "data.humidity",
              },
            }),
          )
        }
      >
        <strong>derive</strong> computes a new column. It appears immediately in the table header
        and in the pipeline's OUT strip, where it is a first-class field: mappable, filterable,
        sortable like any other. A derive that produces a non-finite value drops the row, and the
        editor says how many.
      </Step>

      <Step
        n={3}
        runLabel="group station → mean temp_c"
        run={({ dispatch, state }) =>
          dispatch(
            worldActions.addStep({
              docId: state.world.activeDocId,
              step: {
                ...newStep("summarize", []),
                by: "data.station",
                fn: "mean",
                field: "data.temp_c",
              },
            }),
          )
        }
      >
        <strong>group∑</strong> is split-apply-combine. The schema collapses to two columns — the
        key and <code>mean_data.temp_c</code> — exactly like dplyr's{" "}
        <code>group_by |&gt; summarise</code>. Every other column is dropped, and the editor says
        so, because silently losing them costs an afternoon.
      </Step>

      <Step
        n={4}
        runLabel="toggle the first step off"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          const first = docId ? state.world.docs[docId]?.spec.steps[0] : undefined;
          if (first) dispatch(worldActions.toggleStep({ docId, stepId: first.id }));
        }}
      >
        <strong>Steps are objects, not history.</strong> The ✓ box disables a step{" "}
        <em>without deleting it</em> — an instant A/B of your own transform — and R-clicking the
        step name offers move and remove. Order matters: a filter before a group∑ changes what is
        averaged.
      </Step>
    </TutorialBody>
  );
}

registerApp({
  id: "tut2",
  title: "tutorial 2 · pipeline",
  tone: "var(--pbui-selected)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: Tut2,
});
