# DATADROP-8 smoke-test scripts

Browser checks that exercise the things `bun test` structurally cannot: a real
clipboard, a real focus trap, a real object menu, and a real Firefox.

Every defect these found was invisible to `bun run --cwd=ui typecheck`,
`bun run --cwd=ui lint` and the whole test suite at the time. That is the point
of keeping them: the repository's standing convention is *read the rendered
output after the build is green*, and these are what "read the rendered output"
means for this ticket.

## Running them

All of them assume the dev server is up:

```bash
bun run --cwd=ui dev            # serves http://localhost:5173/static/
```

Then, from the repository root:

```bash
bun run ttmp/.../scripts/smoke-firefox-import.ts     # the one that is not optional
bun run ttmp/.../scripts/smoke-chromium-roundtrip.ts
bun run ttmp/.../scripts/smoke-contrast.ts
```

They print JSON and exit non-zero on a failed assertion, so they can be chained
in a shell or wired into a check later. They need Playwright's browsers:

```bash
bunx --bun playwright install firefox chromium     # run from ui/
```

## The scripts

| Script | What it proves | What it found |
|---|---|---|
| `smoke-firefox-import.ts` | The import dialog opens **empty and focused** in Firefox, with no console error, and a pasted bundle can be committed. | `navigator.clipboard.readText()` in Firefox neither resolves *nor rejects*. `beginImport` awaited it, so the dialog never opened at all and the menu entry looked like a dead control. Fixed by racing the read against `READ_TIMEOUT` in `ui/src/store/clipboard.ts`. |
| `smoke-chromium-roundtrip.ts` | Right-click → export → right-click another tile → import → the tile is replaced, using the real system clipboard. | That the whole path works, and that the trace records the kind and the name and none of the payload. |
| `smoke-contrast.ts` | Every control on the inverted masthead has a readable computed colour against its own computed background. | The stage switcher rendered white-on-white (1.00:1): `Surface`'s `.inverted` re-points `--pbui-ink` to paper for every descendant, which is right for text and wrong for a control that paints `--pbui-pane` behind itself. Fixed with `--pbui-ink-on-pane`. |

## Why they hard-exit

Playwright's `browser.close()` does not always return under `bun` on this
machine, so each script calls `process.exit()` when it is done and installs a
hard timeout. Without the timeout a hung browser hangs the shell, which is
exactly what happened the first time `readText()` was awaited without a race.
