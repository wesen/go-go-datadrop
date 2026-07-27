import type { Meta, StoryObj } from "@storybook/react-vite";
import { Meter } from "./Meter";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";
import { kfmt, pctfmt } from "../../../model/format";

/**
 * A proportional bar. One value against one maximum.
 *
 * Before DATADROP-11 the design system had no bar of any kind, so panels that
 * wanted to show a ratio printed "18.2k / 24k" and left the reader to divide.
 *
 * Deliberately dumb: no context, no click handling, no knowledge of what it
 * measures — which is why this story needs no provider.
 */
const meta = {
  title: "Design System/Atoms/Meter",
  component: Meter,
  parameters: { tile: false },
  args: { fraction: 0.62, label: "context window", value: "14.9k / 24k" },
} satisfies Meta<typeof Meter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The two sizes. `inline` is fixed at 46px so a column of them lines up inside
 * table cells; `row` fills its container.
 */
export const Sizes: Story = {
  render: () => (
    <Stack gap={4}>
      <Stack gap={2}>
        <SectionLabel>inline — fixed 46px, for a table cell or a chip row</SectionLabel>
        <Stack gap={1}>
          {[0.15, 0.5, 0.93].map((f) => (
            <Meter
              key={f}
              size="inline"
              fraction={f}
              label={`churn ${pctfmt(f)}`}
              value={pctfmt(f)}
            />
          ))}
        </Stack>
      </Stack>
      <Stack gap={2}>
        <SectionLabel>row — fills the container</SectionLabel>
        <Meter size="row" fraction={0.62} label="context window" value="14.9k / 24k" />
      </Stack>
    </Stack>
  ),
};

/**
 * `alarm` turns the fill amber past 0.75 and red past 0.9.
 *
 * It is opt-in, and that is the whole design decision. A meter showing disk
 * usage wants it. A meter showing "12 of 30 lessons complete" does not — a
 * learner nearing the end of the tour should not be told in red that they are
 * running out of something.
 */
export const Alarm: Story = {
  render: () => (
    <Stack gap={3}>
      <Text>Same fractions, `alarm` off then on.</Text>
      {[0.5, 0.8, 0.97].map((f) => (
        <Stack key={f} gap={1}>
          <SectionLabel>{pctfmt(f)}</SectionLabel>
          <Meter fraction={f} label={`plain ${pctfmt(f)}`} value={pctfmt(f)} />
          <Meter fraction={f} label={`alarm ${pctfmt(f)}`} value={pctfmt(f)} alarm />
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * A tone overrides the neutral fill — but only while the meter is not alarming.
 *
 * If a caller passes both a tone and `alarm`, the alarm wins above the
 * thresholds. A bar cannot be both "this is the `step` colour" and "this is
 * dangerous", and of the two, dangerous is the one the reader needs.
 */
export const Tones: Story = {
  render: () => (
    <Stack gap={2}>
      {[
        ["field", "--pbui-tone-field"],
        ["source", "--pbui-tone-source"],
        ["step", "--pbui-tone-step"],
        ["doc", "--pbui-tone-doc"],
      ].map(([name, token]) => (
        <Meter
          key={name}
          fraction={0.55}
          label={`${name} share`}
          tone={`var(${token})`}
          value={name as string}
        />
      ))}
    </Stack>
  ),
};

/**
 * The cases that would otherwise reach CSS `width` and break the layout.
 *
 * Every current caller computes `fraction` by division, and at least one
 * divides by a budget that is zero before the first event arrives. All four of
 * these render a sane bar; none of them produce a NaN width or a fill that
 * escapes its track.
 */
export const HostileInput: Story = {
  render: () => (
    <Stack gap={3}>
      {[
        ["NaN — 0/0", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["1.4 — over budget", 1.4],
        ["−0.3 — negative", -0.3],
      ].map(([caption, f]) => (
        <Stack key={caption as string} gap={1}>
          <SectionLabel>{caption as string}</SectionLabel>
          <Meter fraction={f as number} label={caption as string} value={kfmt(f as number)} />
        </Stack>
      ))}
    </Stack>
  ),
};
