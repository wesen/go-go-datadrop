/*
 * Regenerate the categorical palette block in src/styles/tokens.css from the
 * PALETTE array in src/model/plot.ts.
 *
 *   bun run tokens
 *
 * The palette has to exist twice. buildPlot is a pure function with no access
 * to the DOM, so it puts a concrete colour on every mark; the CSS tokens colour
 * the legend swatches that claim to describe those marks. If the two drift, the
 * legend lies — and it is a bug that survives review, because each half looks
 * correct in isolation.
 *
 * model/plot.ts is authoritative. This script only rewrites the region between
 * the BEGIN/END markers, so the surrounding comments and hand-written tokens
 * are preserved. test/tokens.test.ts is the actual guarantee: this script is a
 * convenience, and a convenience can fall out of use.
 */

import { NEUTRAL, PALETTE, RAMP_HIGH, RAMP_LOW } from "../src/model/plot";

const TOKENS = new URL("../src/styles/tokens.css", import.meta.url).pathname;
const BEGIN = "  /* ---- BEGIN GENERATED PALETTE ---- */";
const END = "  /* ---- END GENERATED PALETTE ---- */";

function block(): string {
  const lines = PALETTE.map((hex, i) => `  --pbui-cat-${i + 1}: ${hex};`);
  lines.push(`  --pbui-ramp-low: ${RAMP_LOW};`);
  lines.push(`  --pbui-ramp-high: ${RAMP_HIGH};`);
  lines.push(`  --pbui-neutral: ${NEUTRAL};`);
  return lines.join("\n");
}

const css = await Bun.file(TOKENS).text();
const start = css.indexOf(BEGIN);
const end = css.indexOf(END);

if (start < 0 || end < 0) {
  console.error(`could not find the generated-palette markers in ${TOKENS}`);
  process.exit(1);
}

const next = `${css.slice(0, start + BEGIN.length)}\n${block()}\n${css.slice(end)}`;

if (next === css) {
  console.log("tokens.css palette already matches model/plot.ts");
} else {
  await Bun.write(TOKENS, next);
  console.log(`wrote ${PALETTE.length} categorical tokens + ramp + neutral to tokens.css`);
}
