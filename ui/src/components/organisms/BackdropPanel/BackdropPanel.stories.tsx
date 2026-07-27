import type { Meta, StoryObj } from "@storybook/react-vite";
import { BackdropPanel, type BackdropMark } from "./BackdropPanel";
import { Stack } from "../../layout";
import { SectionLabel, Text } from "../../foundation";

/**
 * Marks on a fixed spatial frame instead of on axes.
 *
 * Some data is positional in a space the reader already knows — a court, a
 * field, a floor plan, a rack elevation, a wafer map. For that data an axis is
 * noise: a position means something because of where the three-point arc is,
 * not because of a number on a scale.
 *
 * The design system ships **no backdrops**. The court below lives in this
 * story, not in the component tree, because a basketball court is not part of a
 * data workbench — it is the clearest available example of the mechanism.
 */
const COURT = { w: 500, h: 300, hoopX: 250, hoopY: 52, arc: 237 };

/** The worked example. Drawn from pbui-basketball.jsx:430-444. */
function Court() {
  const { hoopX: hx, hoopY: hy, arc, w: W } = COURT;
  const bx = Math.sqrt(Math.max(0, arc * arc - 216 * 216));
  return (
    <g stroke="var(--pbui-ink)" fill="none" strokeWidth="1.5">
      <rect x="1" y="1" width={W - 2} height="299" fill="var(--pbui-pane-alt)" />
      <rect x="170" y="0" width="160" height="190" />
      <circle cx={hx} cy="190" r="60" />
      <path d={`M 34 0 L 34 ${hy + bx} A ${arc} ${arc} 0 0 0 ${W - 34} ${hy + bx} L ${W - 34} 0`} />
      <circle cx={hx} cy={hy} r="40" />
      <line x1={hx - 30} y1={hy - 8} x2={hx + 30} y2={hy - 8} strokeWidth="2.5" />
      <circle cx={hx} cy={hy} r="7.5" fill="var(--pbui-pane)" strokeWidth="2" />
    </g>
  );
}

const SHOTS: BackdropMark[] = [
  [250, 70, true],
  [230, 95, true],
  [268, 88, false],
  [250, 140, false],
  [190, 120, true],
  [310, 130, false],
  [120, 200, false],
  [380, 190, true],
  [60, 250, false],
  [440, 245, true],
  [250, 265, true],
  [150, 275, false],
  [350, 270, false],
  [205, 60, true],
  [295, 66, true],
  [90, 150, false],
].map(([x, y, made], i) => ({
  id: `s${i}`,
  x: x as number,
  y: y as number,
  r: 4.2,
  hollow: !made,
  tone: made ? "var(--pbui-ok)" : "var(--pbui-danger)",
  label: `${made ? "made" : "missed"} from (${x}, ${y})`,
}));

const meta = {
  title: "Component Library/Organisms/BackdropPanel",
  component: BackdropPanel,
  parameters: { tile: { width: 560, height: 420 }, pbui: false },
  args: {
    width: COURT.w,
    height: COURT.h,
    backdrop: <Court />,
    marks: SHOTS,
    label: "shot chart",
  },
} satisfies Meta<typeof BackdropPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The encoding worth copying, which is not the backdrop.
 *
 * Made and missed differ in **fill and in hue** — two redundant channels for one
 * binary. `ui/GUIDELINES.md` requires that meaning is never carried by colour
 * alone, and no test can check it. This is what the rule looks like in practice:
 * the chart survives greyscale, a printout, and a reader with a colour vision
 * deficiency.
 */
export const RedundantEncoding: Story = {
  render: () => (
    <Stack gap={3}>
      <SectionLabel>filled = made, outlined = missed — and green vs red</SectionLabel>
      <BackdropPanel
        width={COURT.w}
        height={COURT.h}
        backdrop={<Court />}
        marks={SHOTS}
        label="shot chart with redundant encoding"
      />
      <Text>
        Desaturate this in a screenshot tool and it still reads correctly, because the fill carries
        the same fact the colour does.
      </Text>
    </Stack>
  ),
};

/**
 * A header for derived summaries.
 *
 * The zone percentages are computed by the caller from *position* — distance
 * from the hoop. Our pipeline can summarize by a category but has no notion of
 * a spatial bin, which is recorded as follow-up work rather than pretended away.
 */
export const WithZoneSummary: Story = {
  render: () => {
    const zone = (m: BackdropMark) => {
      const d = Math.hypot(m.x - COURT.hoopX, m.y - COURT.hoopY);
      return d < 45 ? "at rim" : d < 200 ? "mid-range" : "three";
    };
    const zones = ["at rim", "mid-range", "three"].map((z) => {
      const inZone = SHOTS.filter((m) => zone(m) === z);
      const made = inZone.filter((m) => !m.hollow).length;
      return { z, made, attempted: inZone.length };
    });
    return (
      <BackdropPanel
        width={COURT.w}
        height={COURT.h}
        backdrop={<Court />}
        marks={SHOTS}
        label="shot chart with zones"
        header={
          <Stack direction="row" gap={3} wrap>
            {zones.map(({ z, made, attempted }) => (
              <Text key={z} size="tiny" tone="faint">
                {z.toUpperCase()}{" "}
                <strong>{attempted ? Math.round((made / attempted) * 100) : 0}%</strong> {made}/
                {attempted}
              </Text>
            ))}
          </Stack>
        }
      />
    );
  },
};

/** No marks: the frame still draws, because the frame is the information. */
export const Empty: Story = {
  args: { marks: [] },
};

/**
 * A different frame entirely, to show the mechanism is not about basketball.
 *
 * A rack elevation: units at fixed heights, coloured by temperature. The
 * component is unchanged; only the backdrop and the coordinates differ.
 */
export const ADifferentFrame: Story = {
  render: () => (
    <BackdropPanel
      width={200}
      height={420}
      label="rack elevation"
      backdrop={
        <g stroke="var(--pbui-ink)" fill="none" strokeWidth="1.5">
          <rect x="20" y="10" width="160" height="400" fill="var(--pbui-pane-alt)" />
          {Array.from({ length: 20 }, (_, i) => (
            <line key={i} x1="20" y1={10 + i * 20} x2="180" y2={10 + i * 20} strokeWidth="0.5" />
          ))}
        </g>
      }
      marks={[
        { id: "u1", x: 100, y: 40, r: 7, tone: "var(--pbui-ok)", label: "u2 — 21°C" },
        { id: "u2", x: 100, y: 120, r: 7, tone: "var(--pbui-ok)", label: "u6 — 23°C" },
        { id: "u3", x: 100, y: 240, r: 7, tone: "var(--pbui-type-t)", label: "u12 — 31°C" },
        { id: "u4", x: 100, y: 300, r: 7, tone: "var(--pbui-danger)", label: "u15 — 38°C" },
      ]}
    />
  ),
};
