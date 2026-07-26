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

