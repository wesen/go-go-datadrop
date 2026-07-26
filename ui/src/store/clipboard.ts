/**
 * The clipboard, as a port on the store's thunk extra argument (DR-66).
 *
 * `makeStore` already injects the fixture map this way, and the docstring on
 * `MakeStoreOptions.fixtures` explains why that channel was chosen: it is the
 * only per-store channel a base query can read, so its scope is exactly one
 * store's scope and no call site above it knows it exists. The clipboard needs
 * the same three properties, plus one more that matters here: **export becomes
 * testable with no DOM.** A test builds a store with a fake clipboard that
 * records what it was given, dispatches the export thunk and asserts on the
 * JSON. `bun test` never touches a browser API and nothing mocks `navigator`.
 *
 * ## Write and read are not symmetric, and a design that assumes they are will
 * work on your machine
 *
 * | | `writeText` | `readText` |
 * |---|---|---|
 * | Chromium | works from a user gesture | prompts for `clipboard-read` |
 * | Firefox  | works from a user gesture | **not implemented for web content** |
 * | Safari   | works from a user gesture | gesture + a paste confirmation |
 * | `bun test` | absent | absent |
 *
 * The Firefox row decides the design. There is no permission to request and no
 * flag to pass; a page cannot read the clipboard. An import flow built on
 * `read()` is an import flow that does not exist for a large share of users,
 * and — worse — the failure is a rejected promise inside a click handler, so
 * the button appears to do nothing.
 *
 * Hence the asymmetry in the interface below: `read` resolves `null` rather
 * than throwing, because refusal is the *expected* case and an exception is the
 * wrong shape for an expected case. `write` throws, because a failed write is
 * genuinely exceptional and the user must be told the copy did not happen.
 */
export interface ClipboardPort {
  write(text: string): Promise<void>;
  /**
   * Resolves null when the platform will not allow a read. Never throws, and
   * — the part that is easy to miss — **always settles**. See `READ_TIMEOUT`.
   */
  read(): Promise<string | null>;
}

/**
 * How long to wait for a clipboard read before giving up on it.
 *
 * **Firefox's `readText()` neither resolves nor rejects for web content.** Not
 * "rejects with a permission error", which is what the guard below was
 * originally written for — it simply never settles. Found by opening the
 * application in Firefox, where the import dialog therefore never appeared at
 * all: `beginImport` awaited a promise that had no outcome, and the menu entry
 * looked like a dead control. Typecheck, lint and 343 tests were green, and
 * Chromium was fine.
 *
 * 700 ms is longer than a real read takes anywhere it works — Chromium answers
 * an already-granted permission in single-digit milliseconds — and short enough
 * that a user who clicked "Replace this tile from the clipboard …" does not
 * notice the wait before the dialog opens empty and focused.
 */
export const READ_TIMEOUT = 700;

export const browserClipboard: ClipboardPort = {
  async write(text) {
    if (!navigator.clipboard?.writeText) throw new Error("this browser has no clipboard");
    await navigator.clipboard.writeText(text);
  },
  async read() {
    // Everything here is allowed to fail, and failing is not an error: the
    // dialog opens empty and focused, which is the path rather than a degraded
    // version of one. A read that never answers is a failure like any other,
    // and is raced rather than awaited.
    try {
      if (!navigator.clipboard?.readText) return null;
      return await Promise.race([
        navigator.clipboard.readText(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT)),
      ]);
    } catch {
      return null;
    }
  },
};

/**
 * A clipboard that refuses both ways.
 *
 * The default when a store is built without one — a story, a test, an embedded
 * instance nobody wired. Export then reports "the copy did not happen" rather
 * than silently succeeding into nowhere, which is the failure mode worth
 * having: a user who is told nothing was copied tries again, and a user who is
 * told it worked pastes an empty clipboard into a chat message.
 */
export const noClipboard: ClipboardPort = {
  async write() {
    throw new Error("this workbench has no clipboard");
  },
  async read() {
    return null;
  },
};
