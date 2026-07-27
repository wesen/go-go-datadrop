# Changelog

## 2026-07-26

- Initial workspace created


## 2026-07-26

Created DATADROP-8 and wrote the design guide: stages above workspaces, tile/workspace/stage bundles, clipboard export and import, a localStorage template library, and duplicable tiles. 2 607 lines, four parts, sixteen decision records DR-58..DR-73, seven phases in tasks.md. Built to PDF (43 pages, zero missing glyphs) and uploaded to the reMarkable at Projects/2026/07. Not implemented.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/26/DATADROP-8--portable-workspaces-stages-tile-and-workspace-import-export-stored-templates-and-duplicable-tiles/design/01-stages-bundles-and-the-clipboard-analysis-design-and-implementation-guide-for-portable-workspaces.md — The guide


## 2026-07-26

Phase 1: stages above workspaces — Stage/StageChrome, stageId on Workspace, the mirrored space pointer with a per-reducer invariant test, spaces.ts becomes stages.ts with four pinned stages, persisted layout v1 to v2 with a migration, StageBar in the masthead, the signed-out gate sets a stage. Two defects found only by looking at the rendered page: a white-on-white select on the inverted masthead (new --pbui-ink-on-pane token) and a stage switcher that could strand the reader on the sign-in stage. (commit 9dc985c)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/stages.ts — The pinned stages and the merge asymmetry


## 2026-07-26

Phase 2: tile identity — an optional leaf label with renameLeaf and duplicateLeaf, duplicable/singleton required on all 25 application descriptors with a guard test that names the file, and a picker that greys a singleton already open or an application the stage does not offer, with the reason inline. Two defects found by clicking: double-click-to-rename lost a fight with the object menu (rename is now the tile title's default verb, which also gives it a keyboard route), and InlineRename never focused itself. (commit da29ec2)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/organisms/Tile/options.ts — The three picker rules, pure and tested with literals


## 2026-07-26

Phase 3: the portable format — model/portable.ts (envelope, PortableNode indexing documents by array position, LIMITS, REASONS, parseBundle, describeBundle) and store/bundles.ts (both conversions, ids minted by the caller). findSecrets moved to model/secrets.ts and now guards durable storage plus both directions of a bundle. 46 tests; the id, sharing and credential guards were each verified by breaking them. (commit e80ec0c)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/model/portable.ts — The bundle format and its validator


## 2026-07-26

Phase 4: the verb seam widened — actionsForVerb over whole state returning thunks, applyLayoutVerb.ts, ClipboardPort on the thunk extra argument, effects.ts, TileRef/WorkspaceRef/StageRef and the tile/workspace/stage descriptors, pendingImport and renamingId with save() enumerating layout fields. Right-clicking a tile now produces a menu; the workspace strip's 'R for duplicate / delete' is true. Found by clicking: the stage bar's menu button opened and closed its own menu in one event. (commit 88ec889)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/pbui/descriptors/tile.ts — The tile's menu — the shortest complete statement of what the ticket does


## 2026-07-26

Phase 5: the dialogs — TextArea, Dialog, BundleDialog, a live describeBundle verdict, an export confirmation that says what a bundle does not contain, and three reusable smoke scripts in the ticket. Firefox verification found two complete failures of the import flow that were invisible in Chromium: readText() never settles there (the dialog never opened), and the dialog focused its own close button (the field could not be pasted into). A contrast sweep found the phase-1 white-on-white defect repeated on Button and IconButton. (commit 26b5170)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/clipboard.ts — READ_TIMEOUT — Firefox's readText neither resolves nor rejects


## 2026-07-26

Phase 6: the template library — store/templates.ts (one localStorage key, three caps, a bundle stored verbatim), TemplateTable, TemplatesApp as the 26th application on the account stage's new templates workspace, and Save-as-a-template on all three object menus. Loading a template is an import, so it goes through the same dialog and validator. Only deletion confirms. 19 tests against a fake localStorage, plus a smoke script that proves the round trip survives a reload. (commit b710bea)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/templates.ts — One key, three caps, and a Bundle stored verbatim

