/**
 * Load Playwright out of `ui/node_modules`, from a script that does not live
 * anywhere near it.
 *
 * These smoke tests sit in the ticket rather than in `ui/`, because they are
 * evidence about one ticket rather than part of the build. That means a bare
 * `import { firefox } from "playwright"` fails — bun resolves from the
 * importing file, and `ttmp/.../scripts/` has no `node_modules` above it:
 *
 *     error: Cannot find package 'playwright' from '…/scripts/smoke-…​.ts'
 *
 * The alternatives were `NODE_PATH=…/ui/node_modules bun run …`, which is a
 * thing to remember and therefore a thing to forget, and a relative
 * `../../../../../../ui/node_modules/playwright`, which breaks the moment the
 * ticket directory moves. This walks up from the script until it finds the
 * checkout's `ui/node_modules`, so the scripts run from any directory.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function uiPackageJson(from: string): string {
  let dir = from;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "ui", "package.json");
    if (existsSync(candidate) && existsSync(join(dir, "ui", "node_modules"))) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(
    "could not find ui/node_modules above this script — run `bun install` in ui/ first",
  );
}

const require = createRequire(uiPackageJson(import.meta.dir));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the require is untyped by construction
const playwright = require("playwright") as typeof import("playwright");

export const { firefox, chromium } = playwright;
