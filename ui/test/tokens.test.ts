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
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  /** #rrggbb to three channels. Every token in the sheet is in that form. */
  const rgb = (hex: string): [number, number, number] =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex);
    return (
      0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number)
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

  /**
   * A disabled control is still a control someone has to read.
   *
   * WCAG exempts disabled elements from the contrast minimum, and that
   * exemption is a licence rather than a design goal: "you may not press this"
   * is information, and it is useless if the label naming the thing you may not
   * press is unreadable. Held to 3:1 — the non-text threshold — rather than
   * 4.5:1, because a disabled control genuinely should recede.
   *
   * The number this pins matters. The six hand-written call sites used 0.4,
   * which composites to 2.32:1 on the alt surface; DATADROP-6 phase 6 raised it
   * to the 0.55 `Chip.module.css` had already been using for `.disabled` since
   * DATADROP-4. Without this test the next person "tidying" the two back
   * together would have a 50% chance of picking the wrong one.
   */
  test("a disabled control clears 3:1 on both surfaces", () => {
    // Composite --pbui-ink over the surface at the disabled opacity, which is
    // what the browser paints — `opacity` is not a colour and cannot be read
    // out of the token sheet.
    const over = (fg: string, bg: string, alpha: number) => {
      const [fr, fg_, fb] = rgb(fg);
      const [br, bg_, bb] = rgb(bg);
      const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
      return `#${[mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
        .map((c) => c.toString(16).padStart(2, "0"))
        .join("")}`;
    };

    const DISABLED_OPACITY = 0.55;
    for (const surface of ["pbui-pane", "pbui-pane-alt"] as const) {
      const faded = over(token("pbui-ink"), token(surface), DISABLED_OPACITY);
      expect(contrast(faded, token(surface))).toBeGreaterThanOrEqual(3);
    }
  });

  test("the inverted shell bars clear 4.5:1", () => {
    expect(contrast(token("pbui-paper"), token("pbui-ink"))).toBeGreaterThanOrEqual(4.5);
  });

  test("secondary text on an inverted surface clears 4.5:1", () => {
    // --pbui-faint is tuned for pale surfaces and measures 2.95:1 on the ink
    // bars. Surface's .inverted re-points --pbui-faint to this token for its
    // descendants; without a distinct value the bars carry unreadable text.
    expect(contrast(token("pbui-faint-inverted"), token("pbui-ink"))).toBeGreaterThanOrEqual(4.5);
  });

  test("the pale-surface faint would NOT have worked on the bars", () => {
    // Pins the reason the extra token exists. If someone later "simplifies" by
    // pointing --pbui-faint-inverted at --pbui-faint, the test above catches it;
    // this one explains why in the failure output.
    expect(contrast(token("pbui-faint"), token("pbui-ink"))).toBeLessThan(4.5);
  });

  test("semantic text colours clear 4.5:1 on both surfaces", () => {
    // Both failed as the prototype had them. #c2503a passed on the white pane
    // (4.66:1) and failed on the alt surface (4.12:1) — which is the reason
    // this test checks both, and the reason a single-surface check is a trap.
    for (const name of ["pbui-danger", "pbui-ok"]) {
      expect(contrast(token(name), token("pbui-pane"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(name), token("pbui-pane-alt"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("tone edges are BELOW 3:1, and that is a constraint on the chips", () => {
    // The presentation-type tones are the prototype's exact hues and most of
    // them measure 1.9-2.6:1 against the pane. They are kept, because darkening
    // them to clear WCAG 1.4.11's 3:1 would destroy the palette the whole design
    // is built on.
    //
    // That is only defensible because a tone is never the SOLE carrier of its
    // information. A field chip states its type as a letter as well as a hue; a
    // legend swatch sits beside its label; an acceptable presentation gains a
    // solid outline as well as a pulse. This test does not check a threshold —
    // it pins the premise, so that anyone who later removes a type badge or a
    // legend label to "clean up" has to come here and read why they cannot.
    const tones = ["pbui-tone-field", "pbui-tone-chart", "pbui-type-q", "pbui-type-n"];
    for (const name of tones) {
      expect(contrast(token(name), token("pbui-pane"))).toBeLessThan(3);
    }
    // The corollary, enforced where it can be: the outline colour that marks an
    // acceptable presentation is a real UI-state indicator with no textual
    // twin, so it does clear 3:1.
    expect(contrast(token("pbui-danger"), token("pbui-pane"))).toBeGreaterThanOrEqual(3);
  });

  test("secondary text is still visibly secondary", () => {
    // Fixing contrast by setting --pbui-faint to the ink colour would pass the
    // test above and destroy the visual hierarchy the whole design rests on.
    expect(contrast(token("pbui-faint"), token("pbui-pane"))).toBeLessThan(
      contrast(token("pbui-ink"), token("pbui-pane")),
    );
  });
});
