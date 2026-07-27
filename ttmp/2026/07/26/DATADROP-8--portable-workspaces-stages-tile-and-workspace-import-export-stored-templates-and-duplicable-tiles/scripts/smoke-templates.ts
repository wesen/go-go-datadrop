/**
 * Save a workspace as a template, reload the browser, load it back.
 *
 * `test/templates.test.ts` covers the library against a fake `localStorage`,
 * which is where the caps and the refusals belong. What this adds is the one
 * thing a fake cannot check: that the round trip **survives a reload**, which
 * is the entire reason a template is not just a clipboard copy.
 *
 * ## What it asserts
 *
 * 1. "Save as a template …" on a workspace chip stores something and confirms.
 * 2. The account stage has a `templates` workspace, and the library shows the
 *    saved template with its summary.
 * 3. After a full page reload the template is still there — this is the step
 *    the fake-storage tests cannot make.
 * 4. "Load" opens the import dialog with the template's text already in it and
 *    the line saying it came from a template, and confirming adds the workspace.
 * 5. Deleting asks first, and only deleting asks.
 *
 * ## Usage
 *
 *     bun run --cwd=ui dev &
 *     bun run ttmp/…/scripts/smoke-templates.ts
 *
 * It clears `datadrop-templates` on the way in, so it does not accumulate
 * across runs. It leaves the layout key alone.
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
await page.evaluate(() => localStorage.removeItem("datadrop-templates"));

/* 1 — save a workspace as a template -------------------------------------- */

await page.selectOption('select[aria-label="stage"]', "stage-work");
await page.locator('[data-ptype="workspace"]').first().click({ button: "right" });
await page.locator('[role="menu"]').getByText("Save as a template").click();
await page.waitForSelector('[role="dialog"]');
const saved = await page.evaluate(
  () => document.querySelector('[role="dialog"]')?.textContent ?? "",
);
check(saved.includes("Saved as a template"), "saving should confirm");
await page.locator('[role="dialog"] button:has-text("OK")').click();

const storedBefore = await page.evaluate(() => {
  const raw = localStorage.getItem("datadrop-templates");
  return raw ? (JSON.parse(raw).templates as Array<{ name: string; kind: string }>) : [];
});
check(storedBefore.length === 1, "exactly one template should be stored");
check(storedBefore[0]?.kind === "workspace", "it should be a workspace template");

/* 2 & 3 — the library, before and after a reload --------------------------- */

const openLibrary = async () => {
  await page.selectOption('select[aria-label="stage"]', "stage-account");
  await page.locator('[data-ptype="workspace"]').filter({ hasText: "templates" }).first().click();
  await page.waitForSelector('section[aria-label="templates"]', { timeout: 10_000 });
  return page.evaluate(
    () => document.querySelector('section[aria-label="templates"]')?.textContent ?? "",
  );
};

const library = await openLibrary();
check(library.includes(storedBefore[0]?.name ?? "—"), "the library should list the template");
check(/\d+ of 50 saved/.test(library), "the library should say how full it is");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-ptype="tile"]', { timeout: 20_000 });
const afterReload = await openLibrary();
check(
  afterReload.includes(storedBefore[0]?.name ?? "—"),
  "the template should survive a reload — this is what a template is FOR",
);

/* 4 — load it ------------------------------------------------------------- */

await page.locator('section[aria-label="templates"] button:has-text("Load")').first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
const loading = await page.evaluate(() => {
  const area = document.querySelector(
    'textarea[aria-label="workspace bundle"]',
  ) as HTMLTextAreaElement | null;
  return {
    text: document.querySelector('[role="dialog"]')?.textContent ?? "",
    prefilled: (area?.value ?? "").length,
  };
});
check(loading.prefilled > 0, "the dialog should open with the template's text in it");
check(
  loading.text.includes("Loaded from a stored template"),
  "the dialog should say where the text came from",
);
await page.locator('[role="dialog"] button:has-text("Add workspace")').click();
const added = await page.evaluate(() => ({
  dialogOpen: !!document.querySelector('[role="dialog"]'),
  chips: [...document.querySelectorAll('[data-ptype="workspace"]')].map(
    (n) => n.getAttribute("aria-label") ?? "",
  ),
}));
check(!added.dialogOpen, "the dialog should close once the workspace is added");
check(added.chips.length >= 3, "the account stage should have gained a workspace");

/* 5 — deletion asks -------------------------------------------------------- */

await page.selectOption('select[aria-label="stage"]', "stage-account");
await page.locator('[data-ptype="workspace"]').filter({ hasText: "templates" }).first().click();
await page.waitForSelector('section[aria-label="templates"]');
await page.locator('section[aria-label="templates"] button:has-text("▸")').first().click();
await page.locator('section[aria-label="templates"] button:has-text("Delete")').first().click();
const confirming = await page.evaluate(
  () => document.querySelector('section[aria-label="templates"]')?.textContent ?? "",
);
check(confirming.includes("permanently?"), "deleting a template should ask first");
await page.locator('section[aria-label="templates"] button:has-text("Delete it")').click();
const storedAfter = await page.evaluate(() => {
  const raw = localStorage.getItem("datadrop-templates");
  return raw ? (JSON.parse(raw).templates as unknown[]) : [];
});
check(storedAfter.length === 0, "confirming should delete it");

console.log(
  JSON.stringify(
    { storedBefore, libraryHead: afterReload.slice(0, 140), loading, added, failures },
    null,
    2,
  ),
);
process.exit(failures.length === 0 ? 0 : 1);
