/**
 * Render every story in a built Storybook and fail on any that errors.
 *
 * `test/stories.test.ts` proves a story *exists* and that its title has the
 * right prefix; it parses the file with a regular expression and never imports
 * it, deliberately — importing a story pulls in React, the CSS modules and the
 * whole component tree, which turns a 30 ms test into a bundling exercise.
 *
 * The gap that leaves is the obvious one: a story can exist, carry a correct
 * title, and throw the moment it renders. This closes it, in the one place
 * where paying the bundling cost is already unavoidable — a Storybook that has
 * been built.
 *
 * It also screenshots a named subset, which is how "look at the rendered
 * output" becomes something a reviewer can do in one command rather than by
 * clicking through a sidebar.
 *
 * ## What it asserts
 *
 * For every story in `storybook-static/index.json`:
 *
 * 1. The preview iframe reaches the "story rendered" state rather than
 *    Storybook's error overlay.
 * 2. No uncaught page error and no console error, other than the network noise
 *    a story with no backend produces.
 *
 * ## Usage
 *
 *     bun run --cwd=ui build-storybook
 *     python3 -m http.server 6008 -d ui/storybook-static &
 *     bun run ttmp/…/scripts/smoke-stories.ts
 *
 * Environment: `STORYBOOK_URL` (default `http://localhost:6008`),
 * `STORY_FILTER` (a substring of the story id — run one group at a time),
 * `SHOT_DIR` (write PNGs of matching stories there).
 *
 * A plain `python3 -m http.server` rather than `serve`: `serve` rewrites
 * `/iframe.html?id=…` to `/iframe` and drops the query string, which renders
 * Storybook's "No Preview" panel and looks exactly like a broken story.
 *
 * Exits 0 when every story rendered, 1 otherwise, 2 on the hard timeout.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "./playwright";

const BASE = process.env.STORYBOOK_URL ?? "http://localhost:6008";
const FILTER = process.env.STORY_FILTER ?? "";
const SHOT_DIR = process.env.SHOT_DIR ?? "";

setTimeout(() => {
  console.error("HARD TIMEOUT");
  process.exit(2);
}, 300_000);

interface Entry {
  id: string;
  title: string;
  name: string;
  type?: string;
}

const index = (await (await fetch(`${BASE}/index.json`)).json()) as {
  entries: Record<string, Entry>;
};
const stories = Object.values(index.entries).filter(
  (e) => e.type !== "docs" && e.id.includes(FILTER),
);

if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const failures: Array<{ id: string; why: string }> = [];

for (const story of stories) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  const onError = (e: Error) => errors.push(`pageerror: ${e.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);

  try {
    await page.goto(`${BASE}/iframe.html?id=${story.id}&viewMode=story`, {
      waitUntil: "domcontentloaded",
    });
    // Storybook marks the root when a story has finished rendering, and
    // replaces the body with `.sb-show-errordisplay` when it threw.
    await page.waitForFunction(
      () =>
        document.body.classList.contains("sb-show-main") ||
        document.body.classList.contains("sb-show-errordisplay") ||
        document.body.classList.contains("sb-show-nopreview"),
      undefined,
      { timeout: 15_000 },
    );
    const state = await page.evaluate(() => ({
      errored: document.body.classList.contains("sb-show-errordisplay"),
      nopreview: document.body.classList.contains("sb-show-nopreview"),
      message: document.querySelector("#error-message")?.textContent ?? "",
    }));
    if (state.errored) failures.push({ id: story.id, why: `threw: ${state.message.slice(0, 160)}` });
    else if (state.nopreview) failures.push({ id: story.id, why: "no preview" });

    if (SHOT_DIR) {
      await page.screenshot({ path: `${SHOT_DIR}/${story.id}.png` });
    }
  } catch (error) {
    failures.push({ id: story.id, why: String(error).slice(0, 160) });
  }

  // The API noise a story with no backend produces is not the story's fault.
  const real = errors.filter(
    (e) => !/502|Failed to load resource|net::ERR|Bad Gateway|createRoot\(\)/.test(e),
  );
  if (real.length > 0) failures.push({ id: story.id, why: `console: ${real[0]}` });

  page.off("console", onConsole);
  page.off("pageerror", onError);
}

console.log(JSON.stringify({ checked: stories.length, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
