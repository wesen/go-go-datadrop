import { registerApp, type AppProps } from "../../appkit/registry";
import { AppBody, Stack, Surface } from "../../components/layout";
import { Kbd, SectionLabel, Text } from "../../components/foundation";
import { DocChip, FieldChip, SourceChip } from "../../components/atoms";

/**
 * The glossary, rendered with LIVE chips of each type.
 *
 * It renders the real components, so it cannot drift from what it documents:
 * change how a field chip looks and this page changes with it. A screenshot
 * walkthrough is wrong within a month and tells nobody.
 *
 * ## This one is deliberately NOT extracted into a panel
 *
 * DATADROP-6 phase 6 asks for this decision to be made explicitly rather than
 * by omission, so: it stays an application, and it is the one application with
 * no story.
 *
 * The rule the other extractions follow is "the container keeps the hooks and
 * the fetches; the panel takes data and callbacks". Applied here it produces a
 * panel that takes **nothing** — no props, no hooks, no state, no callbacks —
 * and a container that renders it. The story would show this prose; the page
 * shows this prose; there is no second state to reach, no empty case, no error
 * case, and nothing a reader could pass differently.
 *
 * Extracting it would satisfy a rule and buy a file. The chips it draws are
 * already storied where they live, which is where a change to them would need
 * reviewing.
 *
 * If this page ever takes a prop — a version string, a link that differs
 * between the product and an embedded instance — that is the moment to revisit,
 * because it is the moment there is a second state.
 */
function AboutApp(_props: AppProps) {
  return (
    <AppBody>
      <Stack gap={4}>
        <Stack gap={2}>
          <SectionLabel>What this is</SectionLabel>
          <Text size="small" prose>
            A grammar-of-graphics workbench built on a presentation-based user
            interface. A chart here is not a picture — it is a live composition,{" "}
            <strong>source ⊳ pipeline steps ⊳ encoding ⊳ geom</strong> — and
            every part of it is a typed object on screen that can be inspected,
            reordered, toggled, mapped, snapshotted, or handed to a command
            running in a different tile.
          </Text>
        </Stack>

        <Stack gap={2}>
          <SectionLabel>Lineage — why “presentations”</SectionLabel>
          <Text size="small" prose>
            The interaction model comes from the Lisp machines: Symbolics
            Genera’s Dynamic Windows and its standardised descendant CLIM. Their
            idea is that programs never print dead text — they <em>present</em>{" "}
            objects with their type attached. Anything ever displayed stays a
            first-class handle: it has a menu of type-appropriate verbs, and any
            command may pause to <strong>accept</strong> an object, at which
            point everything acceptable on screen — in any tile, in any
            workspace — lights up as a valid target.
          </Text>
        </Stack>

        <Stack gap={2}>
          <SectionLabel>The grammar — why “graphics”</SectionLabel>
          <Text size="small" prose>
            The domain model is Wilkinson’s grammar of graphics as popularised by
            ggplot2. The pipeline is dplyr — filter, derive, group + summarize,
            sort, limit. The encoding is <code>aes()</code> — declarative slot ↦
            field mappings. The geoms are <code>geom_point / line / bar / area</code>,
            the facet channel is <code>facet_wrap</code> with shared scales, and
            the y toggle is <code>scale_y_log10</code>.
          </Text>
        </Stack>

        <Stack gap={2}>
          <SectionLabel>Glossary — every chip below is live</SectionLabel>
          <Surface border="hair" padding={3}>
            <Stack gap={3}>
              <Stack direction="row" gap={3} align="center" wrap>
                <FieldChip field={{ docId: null, name: "data.temp_c" }} />
                <Text size="tiny" tone="faint">
                  a column with a type and a provenance — the atom of the system
                </Text>
              </Stack>
              <Stack direction="row" gap={3} align="center" wrap>
                {/* A literal, not a fixture. Importing src/fixtures here would
                    ship ~200 kB of story JSON in the production bundle, and the
                    layer rule caught it — fixtures are for stories and tests. */}
                <SourceChip source={{ kind: "stream", drop: "lab", stream: "temps" }} />
                <Text size="tiny" tone="faint">
                  a stream or dataset file — L loads it, R offers the row budget
                </Text>
              </Stack>
              <Stack direction="row" gap={3} align="center" wrap>
                <DocChip docId="none" />
                <Text size="tiny" tone="faint">
                  a live chart document — L makes it the target of ambient verbs
                </Text>
              </Stack>
            </Stack>
          </Surface>
        </Stack>

        <Stack gap={2}>
          <SectionLabel>Conventions</SectionLabel>
          <Text size="small" prose>
            <strong>Hover</strong> — the black bar documents the object and its
            clicks. <strong>L</strong> — the default verb. <strong>R</strong> —
            the full menu. <Kbd>Esc</Kbd> — abort an accept or close a menu.
          </Text>
          <Text size="small" prose>
            Tiles: drag the border to resize (it snaps at ¼ ⅓ ½ ⅔ ¾); drag{" "}
            <strong>⠿</strong> onto another tile — centre swaps applications,
            edges split-dock. <strong>⬌ ⬍</strong> split, <strong>✕</strong> closes.
          </Text>
        </Stack>
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "about",
  title: "about / help",
  tone: "var(--pbui-selected)",
  docBound: false,
  Component: AboutApp,
});
