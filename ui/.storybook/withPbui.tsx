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
interface PbuiStoryConfig {
  table?: Table;
  activeDocId?: string;
  overrides?: Record<string, "q" | "n" | "t">;
  showLog?: boolean;
}

/**
 * The decorator, which decides *whether* to wrap and holds no hooks of its own.
 *
 * `parameters: { pbui: false }` — for a story that brings its own. A
 * `WorkbenchInstance` supplies its own environment and its own `PbuiProvider`,
 * so wrapping it in the decorator's is not wrong — React resolves to the
 * nearest provider and the shell gets the right one — but it renders a second
 * accept banner, a second mouse-doc line and a verb log below the story, all
 * describing a context nothing is using. A reviewer cannot tell those apart
 * from the instance's own chrome, which is exactly the kind of story that
 * teaches something false.
 *
 * **The early return sits above every hook, and that split is the fix for a
 * real bug.** It used to live inside the component that also called `useState`
 * and `useMemo`, so the hook count changed with a parameter. Biome's
 * `useHookAtTopLevel` caught it the first time the linter ran. It had survived
 * because a story's parameters rarely change while it is mounted — editing them
 * live in the Storybook UI is exactly when they would.
 */
export const withPbui: Decorator = (Story, ctx) => {
  if (ctx.parameters.pbui === false) return <Story />;
  return <PbuiChrome config={(ctx.parameters.pbui ?? {}) as PbuiStoryConfig} Story={Story} />;
};

/** The wrapper, which always runs the same hooks in the same order. */
function PbuiChrome({
  config,
  Story,
}: {
  config: PbuiStoryConfig;
  Story: Parameters<Decorator>[0];
}) {
  const [log, setLog] = useState<Verb[]>([]);

  const environment = useMemo<PbuiEnvironment>(
    () => ({
      // One table, both lookups derived from it, so a chip and a menu can
      // never disagree about which columns exist.
      fieldsFor: () => (config.table ?? readings).fields,
      tableFor: () => config.table ?? readings,
      activeDocId: config.activeDocId ?? "d1",
      nameOf: (docId) => (docId === "d2" ? "β" : "α"),
      overridesFor: () => config.overrides,
    }),
    [config.table, config.activeDocId, config.overrides],
  );

  return (
    <PbuiProvider environment={environment} onPerform={(verb) => setLog((l) => [...l, verb])}>
      {/*
        `flex: 1` and `min-height: 0`, not a `min-height: 320` floor.

        This wrapper sits between the tile decorator and the story, so its
        height behaviour decides every tile story's. With a 320px floor and no
        flex it grew to fit its content instead of being bounded by the tile —
        so `AppBody`'s `overflow: auto` never engaged and a 360-row table
        rendered straight out of the bottom of its frame, unclipped. Every
        tile-decorated story had an unbounded middle; only the ones with tall
        content showed it.

        `min-height: 0` is the half that is easy to omit: a flex child defaults
        to `min-height: auto`, which refuses to shrink below its content, which
        is exactly the failure above.
      */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <AcceptBanner />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "var(--pbui-space-4)",
          }}
        >
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
}
