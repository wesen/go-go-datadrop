import type { Decorator } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { readings } from "../src/fixtures";
import type { Table } from "../src/model/table";
import { AcceptBanner, MouseDocLine, ObjectMenu, PbuiProvider } from "../src/pbui";
import type { PbuiEnvironment, Verb } from "../src/pbui";
import { describeVerb } from "../src/pbui";

/**
 * A PBUI context whose effects are visible instead of real.
 *
 * Phase 1 has no world slice, so verbs are collected and displayed rather than
 * dispatched. That is not a stub standing in for the real thing — it is the
 * seam the design has (pbui/verbs.ts): a descriptor emits a serialisable verb
 * and something else decides what to do with it. Phase 2 swaps the collector
 * for a store dispatch and nothing in pbui/ changes.
 *
 * The banner, the menu and the mouse-doc line render inside the decorator, so
 * every story of a presentation also shows what that presentation says about
 * itself on hover — which turns the story into the reference for its own
 * behaviour.
 *
 * Configure with `parameters.pbui = { table, activeDocId, overrides }`.
 */
export const withPbui: Decorator = (Story, ctx) => {
  const config = (ctx.parameters.pbui ?? {}) as {
    table?: Table;
    activeDocId?: string;
    overrides?: Record<string, "q" | "n" | "t">;
    showLog?: boolean;
  };

  const [log, setLog] = useState<Verb[]>([]);

  const environment = useMemo<PbuiEnvironment>(
    () => ({
      tableFor: () => config.table ?? readings,
      activeDocId: config.activeDocId ?? "d1",
      nameOf: (docId) => (docId === "d2" ? "β" : "α"),
      overridesFor: () => config.overrides,
    }),
    [config.table, config.activeDocId, config.overrides],
  );

  return (
    <PbuiProvider environment={environment} onPerform={(verb) => setLog((l) => [...l, verb])}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 320 }}>
        <AcceptBanner />
        <div style={{ flex: 1, padding: "var(--pbui-space-4)" }}>
          <Story />
        </div>

        {config.showLog !== false && (
          <div
            data-testid="verb-log"
            style={{
              borderTop: "var(--pbui-border-hair)",
              padding: "var(--pbui-space-2) var(--pbui-space-4)",
              fontSize: "var(--pbui-fs-tiny)",
              color: "var(--pbui-faint)",
              maxHeight: 90,
              overflow: "auto",
            }}
          >
            {log.length === 0
              ? "verbs fired by menu entries appear here"
              : log.map((verb, i) => (
                  <div key={i}>
                    {verb.kind} — {describeVerb(verb)}
                  </div>
                ))}
          </div>
        )}

        <MouseDocLine ambient={`${log.length} verbs`} />
      </div>
      <ObjectMenu />
    </PbuiProvider>
  );
};
