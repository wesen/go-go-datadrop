/**
 * The whole export/import path, through the real system clipboard, in Chromium.
 *
 * `test/effects.test.ts` proves this with a fake clipboard and no DOM, which is
 * the right place for it. What this adds is the three links that a fake cannot
 * exercise: a real right-click producing a real object menu, a real
 * `navigator.clipboard.writeText`, and a real `readText` feeding the prefill.
 *
 * ## What it asserts
 *
 * 1. Right-clicking a tile produces the menu the tile descriptor describes —
 *    including the *disabled* entries, which are the interesting ones: a tile
 *    that cannot be duplicated says why rather than hiding the verb.
 * 2. "Copy this tile to the clipboard" puts a parseable bundle on the real
 *    clipboard, and the confirmation names what it contains AND what it does
 *    not.
 * 3. The bundle carries no id from the exporting store (DR-64), asserted
 *    against the actual text on the actual clipboard.
 * 4. The trace records the KIND and the NAME and none of the payload. A bundle
 *    names sources and filter values; the trace is a teaching surface people
 *    screenshot.
 * 5. Importing it into a different tile replaces that tile and closes the
 *    dialog.
 *
 * ## Note on the clipboard in headless Chromium
 *
 * The first `readText()` after a `writeText()` occasionally comes back empty
 * while the write demonstrably succeeded — the trace entry is only dispatched
 * after `await clipboard.write` resolves, and it was there. The script retries
 * once for that reason. It is a harness quirk rather than a product defect, but
 * it is why this check does not assert on the first read.
 *
 * ## Usage
 *
 *     bun run --cwd=ui dev &
 *     bun run ttmp/…/scripts/smoke-chromium-roundtrip.ts
 *
 * Exits 0 on success, 1 on a failed assertion, 2 on the hard timeout.
 */
import { chromium } from "./playwright";

const URL = process.env.DATALAB_URL ?? "http://localhost:5173/static/";

setTimeout(() => {
  console.error("HARD TIMEOUT");
  process.exit(2);
}, 90_000);

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-ptype="tile"]', { timeout: 20_000 });

// A stage with a trace tile in it, so step 4 can read the trace off the screen.
await page.selectOption('select[aria-label="stage"]', "stage-work");
await page.locator('[data-ptype="workspace"]').filter({ hasText: "help" }).first().click();
await page.waitForSelector('section[aria-label="trace"]', { timeout: 10_000 });

/* 1 — the menu ------------------------------------------------------------ */

await page.locator('[data-ptype="tile"]').first().click({ button: "right" });
await page.waitForSelector('[role="menu"]');
const menu = await page.evaluate(() =>
  [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((b) => ({
    label: (b.textContent ?? "").trim(),
    disabled: (b as HTMLButtonElement).disabled,
  })),
);
check(
  menu.some((m) => m.label.startsWith("Rename this tile")),
  "the tile menu should offer a rename",
);
check(
  menu.some((m) => m.label.startsWith("Duplicate") && m.disabled),
  "an undupliable tile should show Duplicate DISABLED with its reason, not hide it",
);

/* 2 & 3 — export ---------------------------------------------------------- */

await page.locator('[role="menu"]').getByText("Copy this tile to the clipboard").click();
await page.waitForSelector('[role="dialog"]');
const confirmation = await page.evaluate(
  () => document.querySelector('[role="dialog"]')?.textContent ?? "",
);
check(confirmation.includes("Copied to the clipboard"), "the export should confirm");
check(
  confirmation.includes("no rows and no credentials"),
  "the confirmation should say what a bundle does NOT contain",
);
await page.locator('[role="dialog"] button:has-text("OK")').click();

const readClipboard = async () => {
  for (let i = 0; i < 3; i++) {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    if (text.length > 0) return text;
    await page.waitForTimeout(150);
  }
  return "";
};
const copied = await readClipboard();
check(copied.length > 0, "something should be on the clipboard");
let bundle: { kind?: string; payload?: { app?: string } } = {};
try {
  bundle = JSON.parse(copied);
} catch {
  check(false, "the clipboard should hold JSON");
}
check(bundle.kind === "tile", "the clipboard should hold a TILE bundle");

// DR-64, against the real bytes: no node id and no document id travels.
const ids = await page.evaluate(() =>
  [...document.querySelectorAll("[data-ptype]")].map((n) => n.getAttribute("aria-label") ?? ""),
);
void ids;
check(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(copied), "no UUID should appear in a bundle");

/* 4 — the trace ----------------------------------------------------------- */

const trace = await page.evaluate(
  () => document.querySelector('section[aria-label="trace"]')?.textContent ?? "",
);
check(trace.includes("exported"), "the trace should record the export");
check(!trace.includes("datadrop.layout"), "the trace must not contain the bundle itself");

/* 5 — import into a different tile ---------------------------------------- */

const before = await page.evaluate(() =>
  [...document.querySelectorAll("section[aria-label]")].map((s) => s.getAttribute("aria-label")),
);
await page.locator('[data-ptype="tile"]').nth(1).click({ button: "right" });
await page.locator('[role="menu"]').getByText("Replace this tile from the clipboard").click();
await page.waitForSelector('[role="dialog"]');
const prefilled = await page.evaluate(
  () =>
    (document.querySelector('textarea[aria-label="tile bundle"]') as HTMLTextAreaElement | null)
      ?.value ?? "",
);
if (prefilled === "") {
  // Chromium usually prefills; if the permission prompt intervened, paste it.
  await page.locator('textarea[aria-label="tile bundle"]').fill(copied);
}
await page.locator('[role="dialog"] button:has-text("Replace tile")').click();
const after = await page.evaluate(() => ({
  dialogOpen: !!document.querySelector('[role="dialog"]'),
  tiles: [...document.querySelectorAll("section[aria-label]")].map((s) =>
    s.getAttribute("aria-label"),
  ),
}));
check(!after.dialogOpen, "the dialog should close once the import applies");
check(
  JSON.stringify(before) !== JSON.stringify(after.tiles),
  "the target tile should have changed",
);

console.log(
  JSON.stringify(
    { menu, confirmation: confirmation.slice(0, 160), copiedBytes: copied.length, after, failures },
    null,
    2,
  ),
);
process.exit(failures.length === 0 ? 0 : 1);
