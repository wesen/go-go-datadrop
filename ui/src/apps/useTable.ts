import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useDatasetTableQuery, useStreamTableQuery } from "../api/client";
import { defaultChart } from "../model/chart";
import { evaluate } from "../model/pipeline";
import { buildPlot } from "../model/plot";
import type { Table } from "../model/table";
import type { RootState } from "../store";
import { worldActions } from "../store/world";
import type { DocId } from "../pbui/types";

/**
 * The table behind one document.
 *
 * RTK Query keys by serialised arguments, so two documents pointed at the same
 * source with the same budget share one cache entry and one request — for free,
 * and without either document knowing the other exists.
 */
export function useDocTable(docId: DocId | null): {
  table: Table | undefined;
  loading: boolean;
  error: unknown;
} {
  const doc = useSelector((state: RootState) =>
    docId ? state.world.docs[docId] : state.world.activeDocId ? state.world.docs[state.world.activeDocId] : undefined,
  );
  const dispatch = useDispatch();
  const source = doc?.spec.source;
  const limit = doc?.limit ?? 2000;

  const stream = useStreamTableQuery(
    {
      drop: source?.drop ?? "",
      stream: source?.stream ?? "events",
      limit,
      order: "desc",
    },
    { skip: !source || source.kind !== "stream" || !source.drop },
  );

  const dataset = useDatasetTableQuery(
    {
      drop: source?.drop ?? "",
      dataset: source?.dataset ?? "",
      version: source?.version ?? "latest",
      path: source?.path ?? "",
      limit,
    },
    { skip: !source || source.kind !== "dataset" || !source.drop },
  );

  const query = source?.kind === "dataset" ? dataset : stream;
  const table = query.data;

  /**
   * Give a freshly-sourced document a chart that draws something.
   *
   * `setDocSource` cannot do this: the reducer has no table, and it must not
   * have one — a reducer that fetches is not a reducer. So the default encoding
   * is applied here, when the table first arrives.
   *
   * Idempotent by construction: the guard is "every channel is still null",
   * which stops being true the moment this runs. Several tiles may call this
   * hook for one document and only the first dispatch does anything.
   *
   * Without it the workbench opens on the blank canvas that defaultChart's own
   * docstring argues against — five empty dropdowns, teaching nothing.
   */
  useEffect(() => {
    if (!table || !doc) return;
    const unmapped = Object.values(doc.spec.mapping).every((value) => value === null);
    if (!unmapped) return;
    dispatch(worldActions.setSpec({ docId: doc.id, spec: defaultChart(table) }));
  }, [table, doc, dispatch]);

  return { table, loading: query.isFetching, error: query.error };
}

/**
 * A resolver for the PBUI environment.
 *
 * Reads straight from the RTK Query cache rather than through a hook, because
 * descriptors are called from a menu handler rather than from render.
 */
export function useTableFor(): (docId: DocId | null) => Table | null {
  const world = useSelector((state: RootState) => state.world);
  const entries = useSelector((state: RootState) => state.datadrop.queries);

  return useCallback(
    (docId: DocId | null) => {
      const doc = world.docs[docId ?? world.activeDocId ?? ""];
      if (!doc) return null;
      // Find the cache entry whose result describes this document's source.
      for (const entry of Object.values(entries)) {
        const data = entry?.data as Table | undefined;
        if (!data?.source) continue;
        if (
          data.source.kind === doc.spec.source.kind &&
          data.source.drop === doc.spec.source.drop &&
          (data.source.stream ?? "") === (doc.spec.source.stream ?? "") &&
          (data.source.dataset ?? "") === (doc.spec.source.dataset ?? "") &&
          (data.source.path ?? "") === (doc.spec.source.path ?? "")
        ) {
          return data;
        }
      }
      return null;
    },
    [world, entries],
  );
}

/**
 * The pipeline output for a document, memoised on identity.
 *
 * Three identities have to be stable for this to be worth anything: the Table
 * (RTK Query gives a stable reference until a refetch), `spec.steps` (only
 * because the reducers update immutably — DR-7's concrete payoff), and this
 * hook per component.
 */
export function useDocPipeline(docId: DocId | null) {
  const doc = useSelector((state: RootState) =>
    docId ? state.world.docs[docId] : state.world.activeDocId ? state.world.docs[state.world.activeDocId] : undefined,
  );
  const { table, loading, error } = useDocTable(docId);

  const pipeline = useMemo(
    () => (table && doc ? evaluate(table, doc.spec.steps, doc.spec.typeOverrides) : null),
    [table, doc?.spec.steps, doc?.spec.typeOverrides],
  );

  return { doc, table, pipeline, loading, error };
}

export function useDocPlot(docId: DocId | null, width: number, height: number) {
  const { doc, table, pipeline, loading, error } = useDocPipeline(docId);
  const plot = useMemo(
    () => (table && doc ? buildPlot(table, doc.spec, width, height) : null),
    [table, doc?.spec, width, height],
  );
  return { doc, table, pipeline, plot, loading, error };
}
