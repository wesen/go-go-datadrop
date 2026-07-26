import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionLabel, Text } from "./Text";
import type { TextSize, TextTone } from "./Text";
import { Stack, Surface } from "../../layout";

/**
 * The whole type system, on one page.
 *
 * There is no CSS framework (DR-13), so this closed set of roles *is* the
 * typography. A component that wants 12.5px text has to justify it in review,
 * because there is no token for it and no variant here that produces it.
 */
const meta = {
  title: "Design System/Foundation/Text",
  component: Text,
  parameters: { tile: false },
  args: { children: "the quick brown fox" },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

const SIZES: [TextSize, string][] = [
  ["micro", "8.5px — type badges, facet titles"],
  ["tiny", "9.5px — section labels, trace rows"],
  ["small", "10.5px — chips, controls, table cells"],
  ["base", "11.5px — prose inside a tile"],
  ["title", "13px — tile titles, headings"],
];

export const Sizes: Story = {
  render: () => (
    <Stack gap={3}>
      {SIZES.map(([size, note]) => (
        <Stack key={size} direction="row" gap={4} align="baseline">
          <Text size={size}>{note}</Text>
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * Every tone on both surfaces it can appear on.
 *
 * Two surfaces because the contrast requirement is checked against both:
 * `test/tokens.test.ts` holds text colours to 4.5:1 on `--pbui-pane` *and*
 * `--pbui-pane-alt`. `--pbui-faint` was darkened from the prototype's #7b8087
 * for exactly this reason — it measured 3.51:1 on the alt surface at the sizes
 * where it matters most.
 */
export const Tones: Story = {
  render: () => {
    const tones: TextTone[] = ["default", "faint", "danger", "ok"];
    return (
      <Stack direction="row" gap={4}>
        {(["pane", "alt"] as const).map((tone) => (
          <Surface key={tone} tone={tone} padding={3}>
            <Stack gap={2}>
              <SectionLabel>on {tone}</SectionLabel>
              {tones.map((t) => (
                <Text key={t} tone={t} size="small">
                  {t} — 10.5px, the size most of the chrome uses
                </Text>
              ))}
            </Stack>
          </Surface>
        ))}
      </Stack>
    );
  },
};

/**
 * `--pbui-faint` on an inverted surface would be unreadable, and is not used.
 *
 * `Surface`'s `.inverted` re-points `--pbui-faint` to `--pbui-faint-inverted`
 * for its descendants, so nothing below has to know which kind of surface it is
 * sitting on. This story is what makes that mechanism visible.
 */
export const OnAnInvertedSurface: Story = {
  render: () => (
    <Surface tone="inverted" padding={3}>
      <Stack gap={2}>
        <Text size="small">default text on the shell bars</Text>
        <Text size="small" tone="faint">
          faint text, re-pointed to --pbui-faint-inverted by the surface
        </Text>
      </Stack>
    </Surface>
  ),
};

export const ProseAndTruncation: Story = {
  render: () => (
    <Stack gap={4}>
      <Text prose>
        Prose sets looser leading for paragraphs rather than dense chrome. This sentence is long
        enough to wrap, which is the only way to see the difference between 1.35 and 1.5 line
        height.
      </Text>
      <Surface padding={2}>
        <div style={{ width: 180 }}>
          <Text truncate title="deployment/region/availability-zone/instance-id">
            deployment/region/availability-zone/instance-id
          </Text>
        </div>
      </Surface>
      <Text size="tiny" tone="faint" prose>
        Truncated text carries the full value in `title`, or it is lost. A dotted field path is
        exactly the case: the interesting part is usually the end.
      </Text>
    </Stack>
  ),
};

/**
 * `SectionLabel` is its own component, not a Text variant.
 *
 * It names a *region* — SOURCE, DOC, GEOM, OUT — and giving that role its own
 * name is what stops uppercase-plus-tracking being reached for as decoration
 * somewhere else (§10.3 rule 6).
 */
export const SectionLabels: Story = {
  render: () => (
    <Stack gap={2}>
      <SectionLabel>Source</SectionLabel>
      <SectionLabel>Row budget — how much of the source is loaded</SectionLabel>
      <SectionLabel>Out</SectionLabel>
    </Stack>
  ),
};
