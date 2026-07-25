import { useEffect, useRef, useState } from "react";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPlot } from "../useTable";
import { AppBody } from "../../components/layout";
import { DocBar } from "../../components/molecules";
import { ChartPanel } from "../../components/organisms";

/**
 * The chart tile — the container half.
 *
 * All it does is measure. The width and height feed `buildPlot`, which is why
 * the ResizeObserver lives here and not in `ChartPanel`: a size is an input to
 * the plot, and a component that measures itself cannot be rendered against a
 * literal one.
 *
 * The debounce is load-bearing. Without it a divider drag re-runs `buildPlot`
 * over the whole table twenty times a second.
 */
function ChartApp({ leafId, docId }: AppProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 360 });

  // Debounced, because a divider drag would otherwise re-run buildPlot twenty
  // times a second over the whole table.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          setSize({
            width: Math.max(280, Math.floor(box.width)),
            height: Math.max(200, Math.floor(box.height)),
          }),
        80,
      );
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const { doc, table, plot, loading } = useDocPlot(docId, size.width, size.height);

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <AppBody>
        {/* The measuring container stays here: the size feeds buildPlot, which
            is a container concern. Everything below it is presentational. */}
        <div ref={container} style={{ flex: 1, minHeight: 220, marginTop: "var(--pbui-space-3)" }}>
          <ChartPanel
            plot={plot}
            table={table}
            loading={loading}
            docId={doc?.id ?? null}
            colorField={doc?.spec.mapping.color ?? null}
          />
        </div>
      </AppBody>
    </>
  );
}

registerApp({
  id: "chart",
  title: "chart",
  tone: "var(--pbui-tone-cat)",
  docBound: true,
  Component: ChartApp,
});
