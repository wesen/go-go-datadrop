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
bun run ttmp/.../scripts/smoke-templates.ts
```

`smoke-stories.ts` needs a built Storybook rather than the dev server:

```bash
bun run --cwd=ui build-storybook
python3 -m http.server 6008 -d ui/storybook-static &
SHOT_DIR=/tmp/shots bun run ttmp/.../scripts/smoke-stories.ts
```

Use `python3 -m http.server`, not `serve`: `serve` rewrites
`/iframe.html?id=…` to `/iframe` and drops the query, which renders
Storybook's "No Preview" panel and looks exactly like a broken story.

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
| `smoke-contrast.ts` | Every control on screen has a readable computed colour against its own computed background. | The stage switcher rendered white-on-white (1.00:1): `Surface`'s `.inverted` re-points `--pbui-ink` to paper for every descendant, which is right for text and wrong for a control that paints `--pbui-pane` behind itself. Then, after that was fixed for `SelectInput`, it found the same thing at 1.13:1 on the `▾` `IconButton` — fixing one atom did not fix the class. Both fixed with `--pbui-ink-on-pane`. |
| `smoke-templates.ts` | Save a workspace as a template, **reload the page**, load it back, delete it through the confirmation. | Nothing yet — but the reload is the step `test/templates.test.ts` cannot make against a fake `localStorage`, and it is the entire reason a template is not just a clipboard copy. |
| `smoke-stories.ts` | Every story in a built Storybook actually renders, with no error overlay and no console error. Optionally screenshots them all. | Closes the gap `test/stories.test.ts` leaves by design: that test parses story files with a regular expression and never imports them, so a story can exist, carry the right title, and throw on render. 328 stories, ~2 minutes. |

## Why they hard-exit

Playwright's `browser.close()` does not always return under `bun` on this
machine, so each script calls `process.exit()` when it is done and installs a
hard timeout. Without the timeout a hung browser hangs the shell, which is
exactly what happened the first time `readText()` was awaited without a race.
