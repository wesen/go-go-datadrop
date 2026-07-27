import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Divider, Kbd, SectionLabel, Text, VisuallyHidden } from ".";
import { Stack, Surface } from "../layout";
import type { TextSize, TextTone } from ".";

/**
 * The token sheet.
 *
 * This is the reference for the visual language, and it is a *rendered* one on
 * purpose: a table of hex values in a markdown file cannot show that
 * --pbui-faint is still legible at 8.5px, and that is the property that matters.
 *
 * The ten rules of §10.3 are printed at the bottom, next to the components that
 * obey them, so a reviewer can check a claim against the thing itself.
 */
const meta: Meta = {
  title: "Design System/Foundation/Tokens",
  parameters: { tile: false, layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

const SURFACES = [
  ["--pbui-paper", "the page behind the tiles"],
  ["--pbui-pane", "a tile body"],
  ["--pbui-pane-alt", "zebra rows, inset toolbars, disabled fills"],
  ["--pbui-ink", "every border, all body text, the dark bars"],
  ["--pbui-faint", "secondary text — darkened from #7b8087 for contrast"],
  ["--pbui-line", "hairlines, grid lines, dotted rules"],
  ["--pbui-selected", "selection and hover — the only highlight"],
  ["--pbui-danger", "accept outlines, destructive verbs, problems"],
  ["--pbui-ok", "completed tutorial steps"],
];

const TONES = [
  ["--pbui-tone-field", "field"],
  ["--pbui-tone-source", "source"],
  ["--pbui-tone-doc", "doc"],
  ["--pbui-tone-step", "step"],
  ["--pbui-tone-chart", "chart"],
  ["--pbui-tone-cat", "cat"],
  ["--pbui-tone-geom", "geom"],
];

const TYPES = [
  ["--pbui-type-q", "q — quantitative"],
  ["--pbui-type-n", "n — nominal"],
  ["--pbui-type-t", "t — temporal"],
];

const CATS = Array.from({ length: 8 }, (_, i) => `--pbui-cat-${i + 1}`);

const SIZES: [TextSize, string][] = [
  ["micro", "8.5px — type badges, facet titles"],
  ["tiny", "9.5px — section labels, trace rows"],
  ["small", "10.5px — chips, controls, table cells"],
  ["base", "11.5px — prose inside a tile"],
  ["title", "13px — tile titles, headings"],
];

const RULES = [
  "No border-radius, anywhere. --pbui-radius: 0 exists so an exception must name itself.",
  "Every border is 1px or 2px, solid, in --pbui-ink. Hairlines in --pbui-line are grid lines only.",
  "Shadows are offset, never blurred. 2px 2px 0 for buttons, 4px 4px 0 for menus.",
  "One font family: monospace, including prose, headings and axis labels.",
  "Chips carry a 4px tone left-border, and nothing else distinguishes their type.",
  "Section labels are uppercase, tiny, letterspaced, in --pbui-faint.",
  "Only the shell's top and bottom bars are inverted.",
  "Selection and hover share one fill, --pbui-selected. There is no second highlight.",
  "Dashed and dotted rules separate; solid rules bound. Borders bound, Divider separates.",
  "Scrollbars are styled to match — a tiled workbench has a great many of them.",
];

function Swatch({ token, note }: { token: string; note: string }) {
  return (
    <Stack direction="row" gap={3} align="center">
      <div
        style={{
          width: 40,
          height: 20,
          background: `var(${token})`,
          border: "var(--pbui-border-hair)",
          flexShrink: 0,
        }}
      />
      <Text size="small" strong>
        {token}
      </Text>
      <Text size="small" tone="faint">
        {note}
      </Text>
    </Stack>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface border="hair" padding={4}>
      <Stack gap={3}>
        <SectionLabel>{title}</SectionLabel>
        {children}
      </Stack>
    </Surface>
  );
}

export const Tokens: Story = {
  render: () => (
    <div style={{ padding: "var(--pbui-space-5)", maxWidth: 900 }}>
      <Stack gap={4}>
        <Text size="title" strong>
          The visual language
        </Text>
        <Text tone="faint" prose>
          Extracted from pbui-gog.jsx into tokens. No CSS framework (DR-13). The categorical palette
          below is generated from PALETTE in model/plot.ts and test/tokens.test.ts fails if the two
          drift.
        </Text>

        <Group title="Surfaces and text">
          {SURFACES.map(([token, note]) => (
            <Swatch key={token} token={token as string} note={note as string} />
          ))}
        </Group>

        <Group title="Presentation-type tones — the 4px left border of every chip">
          {TONES.map(([token, note]) => (
            <Swatch key={token} token={token as string} note={note as string} />
          ))}
        </Group>

        <Group title="Field-type tones">
          {TYPES.map(([token, note]) => (
            <Swatch key={token} token={token as string} note={note as string} />
          ))}
        </Group>

        <Group title="Categorical palette — generated from model/plot.ts">
          <Stack direction="row" gap={0} wrap>
            {CATS.map((token, i) => (
              <div
                key={token}
                title={token}
                style={{
                  width: 64,
                  height: 40,
                  background: `var(${token})`,
                  border: "var(--pbui-border-hair)",
                  color: "var(--pbui-paper)",
                  fontSize: "var(--pbui-fs-micro)",
                  fontWeight: 700,
                  padding: 2,
                }}
              >
                {i + 1}
              </div>
            ))}
          </Stack>
          <Stack direction="row" gap={3} align="center">
            <div
              style={{
                width: 130,
                height: 14,
                border: "var(--pbui-border-hair)",
                background: "linear-gradient(90deg, var(--pbui-ramp-low), var(--pbui-ramp-high))",
              }}
            />
            <Text size="small" tone="faint">
              the quantitative ramp — lerpHex walks this in model/plot.ts
            </Text>
          </Stack>
        </Group>

        <Group title="Type scale — one family, five sizes">
          {SIZES.map(([size, note]) => (
            <Stack key={size} direction="row" gap={3} align="baseline">
              <Text size={size} strong>
                data.temp_c
              </Text>
              <Text size="small" tone="faint">
                {size} · {note}
              </Text>
            </Stack>
          ))}
          <Divider />
          <Stack direction="row" gap={4} align="baseline" wrap>
            {(["default", "faint", "danger", "ok"] as TextTone[]).map((tone) => (
              <Text key={tone} tone={tone} size="small" strong>
                {tone}
              </Text>
            ))}
          </Stack>
          <SectionLabel>a section label looks like this</SectionLabel>
        </Group>

        <Group title="Structure">
          <Stack direction="row" gap={4} wrap align="start">
            <Surface border="hair" padding={3}>
              <Text size="small">1px hairline</Text>
            </Surface>
            <Surface border="firm" padding={3}>
              <Text size="small">2px firm</Text>
            </Surface>
            <Surface border="firm" elevation="raised" padding={3}>
              <Text size="small">raised · 2px 2px 0</Text>
            </Surface>
            <Surface border="firm" elevation="floating" padding={3}>
              <Text size="small">floating · 4px 4px 0</Text>
            </Surface>
            <Surface tone="selected" border="hair" padding={3}>
              <Text size="small">selected</Text>
            </Surface>
            <Surface tone="inverted" border="none" padding={3}>
              <Text size="small">inverted — shell bars only</Text>
            </Surface>
          </Stack>
          <Stack direction="row" gap={3} align="center">
            <Text size="small" tone="faint">
              keys:
            </Text>
            <Kbd>Esc</Kbd>
            <Kbd>Enter</Kbd>
            <Kbd>Shift+F10</Kbd>
          </Stack>
        </Group>

        <Group title="The ten rules (§10.3)">
          <Stack gap={2} as="ol">
            {RULES.map((rule, i) => (
              <Stack key={rule} direction="row" gap={3} align="baseline" as="li">
                <Text size="small" tone="faint" strong>
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text size="small" prose>
                  {rule}
                </Text>
              </Stack>
            ))}
          </Stack>
        </Group>

        <VisuallyHidden>
          End of the token sheet. This text proves VisuallyHidden keeps content in the accessibility
          tree while removing it from the screen.
        </VisuallyHidden>
      </Stack>
    </div>
  ),
};
