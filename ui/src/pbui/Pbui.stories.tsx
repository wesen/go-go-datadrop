import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CHANNELS, CHANNEL_ACCEPTS } from "../model/chart";
import type { Channel } from "../model/chart";
import { effectiveType } from "../model/table";
import type { FieldType } from "../model/table";
import { census, readings } from "../fixtures";
import { DocChip, FieldChip, SourceChip } from "../components/atoms";
import { ChannelRow } from "../components/molecules";
import { SectionLabel, Text } from "../components/foundation";
import { Stack, Surface } from "../components/layout";
import { usePbui } from "./usePbui";
import type { FieldRef } from "./types";

/**
 * The acceptance test for phase 1, as a story.
 *
 * The whole protocol on one screen: chips that present, a menu that offers
 * typed verbs, and a command that pauses to accept an argument by pointing.
 *
 * Building it against fixtures rather than a running server is the point. If
 * the protocol needs a backend to feel right, the protocol is wrong.
 */
const meta: Meta = {
  title: "Design System/PBUI/Playground",
  parameters: { tile: false, layout: "fullscreen", pbui: { table: readings } },
};
export default meta;
type Story = StoryObj;

/**
 * The accept protocol, wired to the real `ChannelRow`.
 *
 * This story used to contain its own copy of the channel row — it needed one to
 * demonstrate the protocol, there was nothing to import, so it wrote one. The
 * two then drifted independently for two releases, which is the whole argument
 * for DATADROP-6 in one file.
 *
 * What remains here is only what the story adds: the accept call itself, and
 * the type filter that makes an invalid mapping unreachable rather than
 * reported after the fact (DR-10).
 */
function AcceptableChannelRow({
  channel,
  mapped,
  onMap,
}: {
  channel: Channel;
  mapped: string | null;
  onMap: (name: string | null) => void;
}) {
  const pbui = usePbui();
  const accepts = CHANNEL_ACCEPTS[channel];

  return (
    <ChannelRow
      channel={channel}
      mapped={mapped}
      onClear={() => onMap(null)}
      onAcceptRequest={async () => {
        const result = await pbui.accept({
          ptype: "field",
          prompt: `MAP ${channel.toUpperCase()} ↦ click a FIELD anywhere`,
          // The improvement over the prototype (DR-10): a channel that cannot
          // use a type does not light its chips up, so the invalid state is
          // unreachable rather than reported after the fact.
          filter: (_ptype, value) => {
            const ref = value as FieldRef;
            const field = readings.fields.find((f) => f.name === ref.name);
            return field ? accepts.includes(effectiveType(field)) : false;
          },
        });
        if (result) onMap((result.value as FieldRef).name);
      }}
      renderMapped={(name) => (
        <FieldChip field={{ docId: null, name }} testId={`mapped-${channel}`} />
      )}
    />
  );
}

function Playground() {
  const [mapping, setMapping] = useState<Record<Channel, string | null>>({
    x: "time",
    y: "data.temp_c",
    color: "data.station",
    size: null,
    facet: null,
  });

  return (
    <Stack gap={4}>
      <Text tone="faint" prose>
        Hover anything and read the black bar. Right-click a chip for its verbs.
        Press <strong>⌖</strong> beside a channel to start an accept — every
        field it can use starts pulsing, and the rest stay inert.
      </Text>

      <Surface border="hair" padding={4}>
        <Stack gap={3}>
          <SectionLabel>Encoding — each ⌖ accepts a field</SectionLabel>
          {CHANNELS.map((channel) => (
            <AcceptableChannelRow
              key={channel}
              channel={channel}
              mapped={mapping[channel]}
              onMap={(name) => setMapping((m) => ({ ...m, [channel]: name }))}
            />
          ))}
        </Stack>
      </Surface>

      <Surface border="hair" padding={4}>
        <Stack gap={3}>
          <SectionLabel>Schema — the same field objects, elsewhere</SectionLabel>
          <Text size="tiny" tone="faint">
            These are the identical presentations. An accept started above is
            satisfied by clicking one of these, which is the point: arguments are
            indicated, not typed.
          </Text>
          <Stack direction="row" gap={2} wrap>
            {readings.fields.map((field) => (
              <FieldChip key={field.name} field={{ docId: null, name: field.name }} />
            ))}
          </Stack>
        </Stack>
      </Surface>

      <Surface border="hair" padding={4}>
        <Stack gap={3}>
          <SectionLabel>Other presentation types</SectionLabel>
          <Stack direction="row" gap={3} wrap align="center">
            <SourceChip source={readings.source} />
            <SourceChip source={census.source} />
            <DocChip docId="d1" />
            <DocChip docId="d2" />
          </Stack>
        </Stack>
      </Surface>
    </Stack>
  );
}

export const Playground_: Story = {
  name: "Playground",
  render: () => <Playground />,
};

/**
 * The state that is hard to reach by clicking and trivial to reach as a story:
 * a command is waiting, and only the fields it can use are live.
 */
export const AcceptInProgress: Story = {
  parameters: { pbui: { table: readings } },
  render: () => <Playground />,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector<HTMLButtonElement>(
      '[aria-label="accept a field for y"]',
    );
    button?.click();
  },
};

/**
 * The accept protocol, end to end.
 *
 * This is the acceptance test for phase 1 and it is worth reading as a
 * specification. Everything it asserts was first checked by hand in a browser;
 * making it a play function is what stops it being checked by hand again.
 */
export const AcceptFlow: Story = {
  parameters: { pbui: { table: readings } },
  render: () => <Playground />,
  play: async ({ canvasElement, step }) => {
    const $ = <T extends Element>(selector: string) =>
      canvasElement.querySelector<T>(selector);
    const $$ = <T extends Element>(selector: string) =>
      Array.from(canvasElement.querySelectorAll<T>(selector));
    const settle = () => new Promise((r) => setTimeout(r, 60));

    await step("no command is waiting", async () => {
      if ($('[data-part="accept-banner"]')) throw new Error("a banner before any accept");
    });

    await step("starting an accept advertises the mode", async () => {
      $<HTMLButtonElement>('[aria-label="accept a field for y"]')?.click();
      await settle();
      const banner = $('[data-part="accept-banner"]');
      if (!banner) throw new Error("no banner — the mode change was not advertised");
      if (!banner.textContent?.includes("MAP Y")) throw new Error("the banner omits the prompt");
    });

    await step("only fields the channel accepts light up", async () => {
      const chips = $$<HTMLElement>('[data-part="presentation"][data-ptype="field"]');
      const live = chips.filter((c) => c.dataset.state === "acceptable");
      const labels = live.map((c) => c.getAttribute("aria-label") ?? "");

      if (live.length === 0) throw new Error("nothing became acceptable");
      // DR-10: y accepts only quantitative columns, so a nominal chip never
      // becomes clickable and the invalid mapping is unreachable rather than
      // reported after the fact.
      for (const label of labels) {
        if (!label.includes("(q,")) throw new Error(`a non-quantitative field lit up: ${label}`);
      }
      const station = chips.find((c) => c.dataset.testid === "chip-data.station");
      if (station?.dataset.state === "acceptable") {
        throw new Error("data.station is nominal and must stay inert for y");
      }
    });

    await step("clicking a chip elsewhere on screen satisfies the command", async () => {
      // Deliberately the copy in the schema strip, not the one in the encoding
      // row. Arguments are indicated from anywhere, which is the whole idea.
      const chips = $$<HTMLElement>('[data-testid="chip-data.humidity"]');
      chips[chips.length - 1]?.click();
      await settle();

      if ($('[data-part="accept-banner"]')) throw new Error("the banner outlived the accept");
      if ($$('[data-state="acceptable"]').length > 0) {
        throw new Error("chips stayed acceptable after the command resolved");
      }
      const mapped = $('[data-testid="mapped-y"]')?.textContent ?? "";
      if (!mapped.includes("data.humidity")) throw new Error(`y is ${mapped}, not data.humidity`);
    });

    await step("Escape aborts an accept without applying anything", async () => {
      $<HTMLButtonElement>('[aria-label="accept a field for color"]')?.click();
      await settle();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await settle();

      if ($('[data-part="accept-banner"]')) throw new Error("Escape did not abort");
      const colour = $('[data-testid="mapped-color"]')?.textContent ?? "";
      if (!colour.includes("data.station")) throw new Error("an aborted accept changed the chart");
    });

    await step("a right-click offers typed verbs, disabled ones with a reason", async () => {
      $('[data-testid="chip-data.station"]')?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }),
      );
      await settle();

      const menu = document.querySelector('[data-part="menu"]');
      if (!menu) throw new Error("no menu");
      const header = menu.querySelector('[data-part="menu-header"]')?.textContent ?? "";
      // The header names where an ambient verb will land, which is what makes
      // firing one safe.
      if (!header.includes("chart α")) throw new Error(`the header omits the target: ${header}`);

      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const y = items.find((i) => i.textContent?.startsWith("Map to y"));
      if (!y) throw new Error("Map to y is hidden — hiding a verb hides its rule");
      if (!y.disabled) throw new Error("Map to y is enabled for a nominal column");
      if (!y.textContent?.includes("quantitative")) throw new Error("no reason given");
    });
  },
};

/** A per-chart type override, and the `q*` badge that reports it. */
export const WithTypeOverride: Story = {
  parameters: {
    pbui: { table: readings, overrides: { "data.temp_c": "n" as FieldType } },
  },
  render: () => <Playground />,
};
