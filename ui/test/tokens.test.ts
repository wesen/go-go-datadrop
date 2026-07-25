import { describe, expect, test } from "bun:test";
import { NEUTRAL, PALETTE, RAMP_HIGH, RAMP_LOW } from "../src/model/plot";

// The categorical palette exists in two places and must agree.
//
// buildPlot is pure and has no DOM, so it writes a concrete colour onto every
// mark. The CSS tokens colour the legend swatches that claim to describe those
// marks. A drift between them produces a legend that disagrees with its own
// chart — a defect that survives review because each half is correct alone.
//
// `bun run tokens` regenerates the CSS from the module; this test is what makes
// forgetting to run it a failure rather than a surprise.

const css = await Bun.file(new URL("../src/styles/tokens.css", import.meta.url).pathname).text();

function tokenValue(name: string): string | undefined {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe("tokens.css agrees with model/plot.ts", () => {
  test("every categorical colour is exported as a token", () => {
    PALETTE.forEach((hex, index) => {
      expect(tokenValue(`pbui-cat-${index + 1}`)).toBe(hex);
    });
  });

  test("there are exactly as many tokens as palette entries", () => {
    // A palette entry removed from the module but left in the CSS would colour
    // a legend category the chart never draws.
    expect(tokenValue(`pbui-cat-${PALETTE.length}`)).toBeDefined();
    expect(tokenValue(`pbui-cat-${PALETTE.length + 1}`)).toBeUndefined();
  });

  test("the quantitative ramp and the neutral agree", () => {
    expect(tokenValue("pbui-ramp-low")).toBe(RAMP_LOW);
    expect(tokenValue("pbui-ramp-high")).toBe(RAMP_HIGH);
    expect(tokenValue("pbui-neutral")).toBe(NEUTRAL);
  });
});

describe("the palette is well formed", () => {
  test("every entry is a six-digit hex colour", () => {
    // lerpHex slices fixed offsets out of these strings (plot.ts:109), so a
    // three-digit shorthand would silently produce nonsense rather than throw.
    for (const hex of [...PALETTE, RAMP_LOW, RAMP_HIGH, NEUTRAL]) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("no two categories share a colour", () => {
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
  });
});

describe("contrast of the text tokens", () => {
  // Dropping the CSS framework makes contrast our responsibility (§15). The
  // prototype's --pbui-faint was #7b8087, which measures 3.98:1 on the pane and
  // 3.51:1 on the alt surface — below 4.5:1, at the 8.5-10.5px sizes where it is
  // used for hints and axis labels. This test is what stops it drifting back.

  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (
      0.2126 * channel(r as number) +
      0.7152 * channel(g as number) +
      0.0722 * channel(b as number)
    );
  };

  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return (hi + 0.05) / (lo + 0.05);
  };

  const token = (name: string) => tokenValue(name) as string;

  test("body text clears 4.5:1 on both surfaces", () => {
    expect(contrast(token("pbui-ink"), token("pbui-pane"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("pbui-ink"), token("pbui-pane-alt"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("pbui-ink"), token("pbui-selected"))).toBeGreaterThanOrEqual(4.5);
  });

  test("secondary text clears 4.5:1 on both surfaces", () => {
    expect(contrast(token("pbui-faint"), token("pbui-pane"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("pbui-faint"), token("pbui-pane-alt"))).toBeGreaterThanOrEqual(4.5);
  });

  test("the inverted shell bars clear 4.5:1", () => {
    expect(contrast(token("pbui-paper"), token("pbui-ink"))).toBeGreaterThanOrEqual(4.5);
  });

  test("secondary text is still visibly secondary", () => {
    // Fixing contrast by setting --pbui-faint to the ink colour would pass the
    // test above and destroy the visual hierarchy the whole design rests on.
    expect(contrast(token("pbui-faint"), token("pbui-pane"))).toBeLessThan(
      contrast(token("pbui-ink"), token("pbui-pane")),
    );
  });
});
