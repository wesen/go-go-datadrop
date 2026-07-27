/**
 * Every control that draws its own background is legible against it.
 *
 * `test/tokens.test.ts` checks the *token sheet*: that `--pbui-faint` clears
 * 4.5:1 on `--pbui-pane` and on `--pbui-pane-alt`, and so on. What it cannot
 * check is a *composition* — an element whose colour is inherited from one
 * place and whose background is set in another.
 *
 * ## What it found
 *
 * DATADROP-8 put the first `<select>` on the inverted masthead, and it rendered
 * as a blank white box:
 *
 *     getComputedStyle(select)  →  { color: "rgb(255,255,255)",
 *                                    background: "rgb(255,255,255)" }
 *
 * `SelectInput.root` says `color: inherit`; `Surface`'s `.inverted` re-points
 * `--pbui-ink` to paper for every descendant, which is exactly right for text
 * on the dark bar; and `.framed` paints `--pbui-pane` behind itself. Three
 * correct decisions composing into 1.00:1. Typecheck, lint and every test were
 * green, and the control was legible only by tabbing to it and reading its
 * value out of the DOM.
 *
 * The fix is `--pbui-ink-on-pane` — a token `.inverted` deliberately does not
 * re-point — used by both `SelectInput` variants and by `TextArea`.
 *
 * ## What it asserts
 *
 * For every `<select>`, `<input>`, `<textarea>` and `<button>` on screen: the
 * computed colour and the *nearest opaque* computed background differ by at
 * least 3:1. 3:1 rather than 4.5:1 because several of these are 700-weight at
 * 13px, which WCAG counts as large text — the check is a smoke alarm for the
 * 1.00:1 class of mistake, not a substitute for the token test.
 *
 * ## Usage
 *
 *     bun run --cwd=ui dev &
 *     bun run ttmp/…/scripts/smoke-contrast.ts
 *
 * Exits 0 on success, 1 if anything is below the threshold, 2 on the hard
 * timeout.
 */
import { chromium } from "./playwright";

const URL = process.env.DATALAB_URL ?? "http://localhost:5173/static/";
const THRESHOLD = 3;

setTimeout(() => {
  console.error("HARD TIMEOUT");
  process.exit(2);
}, 60_000);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-ptype="tile"]', { timeout: 20_000 });

const findings = await page.evaluate((threshold: number) => {
  const parse = (value: string): [number, number, number] | null => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value);
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null; // transparent
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };

  const luminance = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  /** The nearest ancestor that actually paints something. */
  const backgroundOf = (element: Element): [number, number, number] => {
    let node: Element | null = element;
    while (node) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour) return colour;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  const out: Array<{ what: string; ratio: number; colour: string; background: string }> = [];
  for (const element of document.querySelectorAll("select, input, textarea, button")) {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    // A disabled control clears 3:1 too — "you may not press this" is
    // information and is useless if the label is unreadable — but its opacity
    // is deliberate and would be measured as a failure here.
    if ((element as HTMLInputElement).disabled) continue;

    const colour = parse(style.color);
    if (!colour) continue;
    const background = backgroundOf(element);
    const r = ratio(colour, background);
    if (r < threshold) {
      out.push({
        what: `${element.tagName.toLowerCase()}[${element.getAttribute("aria-label") ?? (element.textContent ?? "").trim().slice(0, 24)}]`,
        ratio: Math.round(r * 100) / 100,
        colour: style.color,
        background: `rgb(${background.join(", ")})`,
      });
    }
  }
  return out;
}, THRESHOLD);

console.log(JSON.stringify({ threshold: THRESHOLD, findings }, null, 2));
process.exit(findings.length === 0 ? 0 : 1);
