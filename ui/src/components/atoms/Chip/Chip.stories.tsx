import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./Chip";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * The atom that does the most work.
 *
 * Every presentation chip is a Chip with a different tone and badge: same
 * geometry, same padding, same border, one 4px coloured edge. That sameness is
 * not a style choice — it is what makes a chip in a legend read as the same
 * KIND of object as a chip in a table header, which is the premise of a
 * presentation-based interface.
 *
 * Deliberately dumb: no click handling, no context, no knowledge of what it
 * depicts. That is why this story needs no provider while every `*Chip` story
 * does.
 */
const meta = {
  title: "Design System/Atoms/Chip",
  component: Chip,
  parameters: { tile: false },
  args: { label: "temp_c" },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

const TONES = [
  ["field", "--pbui-tone-field"],
  ["source", "--pbui-tone-source"],
  ["doc", "--pbui-tone-doc"],
  ["step", "--pbui-tone-step"],
  ["chart", "--pbui-tone-chart"],
  ["cat", "--pbui-tone-cat"],
  ["geom", "--pbui-tone-geom"],
  ["neutral", "--pbui-tone-neutral"],
] as const;

/** One geometry, eight meanings. Scan the left edges, not the labels. */
export const EveryTone: Story = {
  render: () => (
    <Stack gap={2}>
      {TONES.map(([name, token]) => (
        <Stack key={name} direction="row" gap={3} align="center">
          <Chip label={name} tone={`var(${token})`} />
          <Text size="tiny" tone="faint">
            {token}
          </Text>
        </Stack>
      ))}
    </Stack>
  ),
};

/**
 * The three states, each distinguishable without colour.
 *
 * `stale` is the one that matters and the one with a defect behind it: a
 * mapping whose field the pipeline no longer produces must not read as simply
 * "unset". EncodingEditor.tsx shipped that, and the select read as empty while
 * the spec still held a dead name. The dashed border carries the state; the
 * danger colour only reinforces it.
 */
export const States: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={3} wrap align="center">
        <Chip label="default" tone="var(--pbui-tone-field)" />
        <Chip label="active" tone="var(--pbui-tone-field)" state="active" />
        <Chip label="stale ⚠" tone="var(--pbui-tone-field)" state="stale" />
        <Chip label="disabled" tone="var(--pbui-tone-field)" state="disabled" />
        <Chip label="strong" tone="var(--pbui-tone-field)" strong />
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Dashed for stale, filled for active, faded onto the alt surface for disabled. Print this
        page in greyscale and all four are still distinct.
      </Text>
    </Stack>
  ),
};

export const WithBadges: Story = {
  render: () => (
    <Stack gap={2}>
      <SectionLabel>a badge is any node, right-aligned inside the chip</SectionLabel>
      <Stack direction="row" gap={3} wrap align="center">
        <Chip
          label="temp_c"
          tone="var(--pbui-tone-field)"
          badge={<span style={{ fontSize: "var(--pbui-fs-micro)", opacity: 0.7 }}>q</span>}
        />
        <Chip
          label="station"
          tone="var(--pbui-tone-field)"
          badge={<span style={{ fontSize: "var(--pbui-fs-micro)", opacity: 0.7 }}>n · 12</span>}
        />
      </Stack>
    </Stack>
  ),
};

/** A long label ellipsises rather than forcing its container open. */
export const Truncation: Story = {
  render: () => (
    <div style={{ width: 160, border: "var(--pbui-border-hair)", padding: 4 }}>
      <Chip
        label="deployment/region/zone/instance/metric"
        tone="var(--pbui-tone-field)"
        title="deployment/region/zone/instance/metric"
      />
    </div>
  ),
};
