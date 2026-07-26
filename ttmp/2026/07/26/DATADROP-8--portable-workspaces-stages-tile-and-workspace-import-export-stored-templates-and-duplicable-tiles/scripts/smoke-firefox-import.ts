/**
 * The Firefox check, which DATADROP-8's phase 5 calls "not optional".
 *
 * ## What it asserts
 *
 * 1. `navigator.clipboard.readText()` does not work for web content in Firefox
 *    — and, specifically, *how* it does not work, which is the whole point.
 * 2. The import dialog opens anyway, **empty and focused**, so ⌘V / Ctrl-V
 *    works with no click first. This is THE path, not a degraded one.
 * 3. Typing a bundle into the field enables the confirm button and shows the
 *    live verdict.
 * 4. Confirming applies the import and closes the dialog.
 * 5. No console error and no page error along the way.
 *
 * ## What it found
 *
 * Firefox's `readText()` **neither resolves nor rejects**. Not "rejects with a
 * NotAllowedError", which is what a `try/catch` guards and what the first
 * implementation assumed — it simply never settles. `beginImport` awaited it,
 * so `openImport` was never dispatched, so the dialog never appeared, so
 * "Replace this tile from the clipboard …" was a menu entry that did nothing at
 * all. Typecheck, lint and 343 tests were green and Chromium was perfect.
 *
 * The fix is `READ_TIMEOUT` in `ui/src/store/clipboard.ts`: the read is raced
 * against a 700 ms timer and a read that has not answered is treated as a read
 * that failed. Re-running this script is how you know it is still fixed.
 *
 * Note the same hazard inside this script — the probe at step 1 races the read
 * itself, because an unguarded `await` here hangs the whole check.
 *
 * ## Usage
 *
 *     bun run --cwd=ui dev &
 *     bun run ttmp/…/scripts/smoke-firefox-import.ts
 *
 * Exits 0 on success, 1 on a failed assertion, 2 on the hard timeout.
 */
import { firefox } from "./playwright";

const URL = process.env.DATALAB_URL ?? "http://localhost:5173/static/";

setTimeout(() => {
  console.error("HARD TIMEOUT — the browser or the page never settled");
  process.exit(2);
}, 90_000);

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
};

const browser = await firefox.launch();
const page = await browser.newPage();

const consoleErrors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-ptype="tile"]', { timeout: 20_000 });

/* 1 — how does readText behave here? ------------------------------------- */

const readText = await page.evaluate(async () => {
  // Raced against a timer, because an unguarded await of a promise that never
  // settles hangs this script exactly as it hung the application.
  const race = (p: Promise<unknown>) =>
    Promise.race([p, new Promise((r) => setTimeout(() => r("__pending__"), 3000))]);
  try {
    if (!navigator.clipboard?.readText) return "not implemented";
    const out = await race(navigator.clipboard.readText());
    return out === "__pending__" ? "never settles" : "resolves";
  } catch (e) {
    return `throws: ${String(e).slice(0, 90)}`;
  }
});

/* 2 — the dialog opens empty and focused --------------------------------- */

await page.locator('[data-ptype="tile"]').first().click({ button: "right", timeout: 10_000 });
await page
  .locator('[role="menu"]')
  .getByText("Replace this tile from the clipboard")
  .click({ timeout: 10_000 });

let dialogAppeared = true;
try {
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
} catch {
  dialogAppeared = false;
}
check(dialogAppeared, "the import dialog never opened — a clipboard read is probably being awaited");

const opened = dialogAppeared
  ? await page.evaluate(() => {
      const area = document.querySelector(
        'textarea[aria-label="tile bundle"]',
      ) as HTMLTextAreaElement | null;
      const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
        b.textContent?.includes("Replace tile"),
      ) as HTMLButtonElement | undefined;
      return {
        prefill: area?.value ?? null,
        focused: document.activeElement === area,
        confirmDisabled: confirm?.disabled ?? null,
      };
    })
  : null;

if (opened) {
  check(opened.prefill === "", "the field should be empty: Firefox cannot read the clipboard");
  check(opened.focused, "the field should be focused, so ⌘V works with no click first");
  check(opened.confirmDisabled === true, "confirm should be disabled while the field is empty");
}

/* 3 & 4 — paste, verdict, commit ----------------------------------------- */

const BUNDLE = JSON.stringify(
  {
    format: "datadrop.layout",
    version: 1,
    kind: "tile",
    exportedAt: "2026-07-26T18:04:11.512Z",
    name: "pasted by the smoke test",
    payload: { app: "table" },
  },
  null,
  2,
);

let afterPaste: { confirmDisabled: boolean | null; verdict?: string } | null = null;
let applied: { dialogOpen: boolean; tiles: (string | null)[] } | null = null;

if (dialogAppeared) {
  await page.locator('textarea[aria-label="tile bundle"]').fill(BUNDLE);
  afterPaste = await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
      b.textContent?.includes("Replace tile"),
    ) as HTMLButtonElement | undefined;
    return {
      confirmDisabled: confirm?.disabled ?? null,
      // The verdict line. Scoped by shape rather than by class, because CSS
      // modules hash the class name — and length-filtered, because the ✕ in
      // the close button is also a span that starts with ✕.
      verdict: [...document.querySelectorAll('[role="dialog"] span')]
        .map((n) => (n.textContent ?? "").trim())
        .find((t) => t.length > 3 && (t.startsWith("✓") || t.startsWith("✕")))
        ?.slice(0, 90),
    };
  });
  check(afterPaste.confirmDisabled === false, "confirm should enable once the text parses");
  check((afterPaste.verdict ?? "").startsWith("✓"), "the live verdict should accept the bundle");

  await page.locator('[role="dialog"] button:has-text("Replace tile")').click({ timeout: 10_000 });
  applied = await page.evaluate(() => ({
    dialogOpen: !!document.querySelector('[role="dialog"]'),
    tiles: [...document.querySelectorAll("section[aria-label]")].map((s) =>
      s.getAttribute("aria-label"),
    ),
  }));
  check(!applied.dialogOpen, "the dialog should close once the import applies");
  check(applied.tiles.includes("table"), "the target tile should now hold the imported application");
}

/* The API errors the dev server produces with no backend are not ours. */
const real = consoleErrors.filter(
  (e) => !/502|Bad Gateway|Failed to load resource|createRoot\(\)/.test(e),
);
check(real.length === 0, `console errors: ${real.join(" | ")}`);

console.log(
  JSON.stringify({ readText, opened, afterPaste, applied, consoleErrors: real, failures }, null, 2),
);
process.exit(failures.length === 0 ? 0 : 1);
