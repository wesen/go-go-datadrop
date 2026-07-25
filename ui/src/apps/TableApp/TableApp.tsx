import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import { DocBar } from "../../components/molecules";
import { TablePanel } from "../../components/organisms";

/**
 * The pipeline's output relation — the container half.
 *
 * One hook. `useDocPipeline` memoises on identity, which is only worth anything
 * because three identities are stable: the Table (RTK Query holds a reference
 * until a refetch), `spec.steps` (the reducers update immutably), and this hook
 * per component.
 */
function TableApp({ leafId, docId }: AppProps) {
  const { doc, pipeline, loading } = useDocPipeline(docId);

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <TablePanel pipeline={pipeline} docId={doc?.id ?? null} loading={loading} />
    </>
  );
}

registerApp({
  id: "table",
  title: "table",
  tone: "var(--pbui-tone-source)",
  docBound: true,
  Component: TableApp,
});
