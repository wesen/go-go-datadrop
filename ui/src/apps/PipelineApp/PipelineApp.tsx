import { useDispatch, useSelector } from "react-redux";
import { newStep, schemaAfter } from "../../model/pipeline";
import type { Step } from "../../model/pipeline";
import { usePbui, type FieldRef } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { DocBar } from "../../components/molecules";
import { PipelinePanel, type PipelineStepView } from "../../components/organisms";

/**
 * The tidyverse chain — the container half.
 *
 * What is left here after DATADROP-6 phase 3 is everything the panel must not
 * hold: two hooks, the accept protocol, and the schema computation that needs a
 * table. `PipelinePanel` takes a list of step views and five callbacks.
 *
 * ## Why `filter` and `summarize` are different from the other three
 *
 * They ACCEPT their field before the step exists, so it can be pointed at from
 * any tile — the source browser, a table header, the chart's legend. The other
 * three are minted with a defensible default and edited in place.
 *
 * That asymmetry is why `onAdd` is async at this level and synchronous in the
 * panel's props: the panel fires an intent, and whether satisfying it needs a
 * round trip through the accept banner is not its business.
 */
function PipelineApp({ leafId, docId }: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const { doc, table, pipeline } = useDocPipeline(docId);
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);
  const target = doc?.id ?? activeDocId;
  const steps = doc?.spec.steps ?? [];

  const add = async (kind: Step["kind"]) => {
    if (!table || !doc) return;
    const schema = schemaAfter(table, steps, undefined, doc.spec.typeOverrides);

    if (kind === "filter" || kind === "summarize") {
      const result = await pbui.accept({
        ptype: "field",
        prompt:
          kind === "filter"
            ? `FILTER (chart ${pbui.environment.nameOf(target)}) — click the FIELD to filter on`
            : `GROUP BY (chart ${pbui.environment.nameOf(target)}) — click a nominal or temporal FIELD`,
        filter: (_p, value) => {
          const field = schema.find((f) => f.name === (value as FieldRef).name);
          if (!field) return false;
          // A quantitative column makes a poor group key: one group per row.
          return kind === "filter" ? true : field.type !== "q";
        },
      });
      if (!result) return;
      const name = (result.value as FieldRef).name;
      const step = newStep(kind, schema);
      dispatch(
        worldActions.addStep({
          docId: target,
          step:
            step.kind === "filter"
              ? { ...step, field: name }
              : step.kind === "summarize"
                ? { ...step, by: name }
                : step,
        }),
      );
      return;
    }
    dispatch(worldActions.addStep({ docId: target, step: newStep(kind, schema) }));
  };

  // The schema as of just before each step, so step 3's dropdowns offer what
  // steps 1 and 2 produced. Computed here because it needs the table.
  const views: PipelineStepView[] = steps.map((step, index) => ({
    step,
    available: table
      ? schemaAfter(table, steps, index, doc?.spec.typeOverrides).map((f) => f.name)
      : [],
    dropped: pipeline?.dropped[step.id],
  }));

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <PipelinePanel
        steps={views}
        outputFields={(pipeline?.fields ?? []).map((f) => f.name)}
        outputRows={pipeline?.rows.length ?? 0}
        docId={target}
        onAdd={(kind) => void add(kind)}
        onToggle={(stepId) => dispatch(worldActions.toggleStep({ docId: target, stepId }))}
        onMoveUp={(stepId) => dispatch(worldActions.moveStep({ docId: target, stepId, by: -1 }))}
        onRemove={(stepId) => dispatch(worldActions.removeStep({ docId: target, stepId }))}
        onChange={(step) => dispatch(worldActions.updateStep({ docId: target, step }))}
      />
    </>
  );
}

registerApp({
  id: "pipeline",
  title: "pipeline",
  tone: "var(--pbui-tone-step)",
  docBound: true,
  duplicable: true,
  singleton: false,
  Component: PipelineApp,
});
