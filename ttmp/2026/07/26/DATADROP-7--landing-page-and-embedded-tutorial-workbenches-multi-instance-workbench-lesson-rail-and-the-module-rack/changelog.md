# Changelog

## 2026-07-26

- Initial workspace created


## 2026-07-26

DATADROP-7 opened: imported sources/pbui-landing.jsx (2719 lines, five embedded workbenches with predicate-driven lesson rails), analysed it against our tree, and wrote the guide. Central finding: exactly one runtime import of the store singleton exists across 246 files (main.tsx:9), so multi-instance embedding is the removal of seven named singletons rather than a rewrite. Seven phases, DR-45 to DR-56, fourteen new components

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/pages/Workbench/Workbench.tsx — Four of the seven singletons, all of them application concerns in the shell
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/index.ts — makeStore is already a factory; the singleton beside it is what has to go


## 2026-07-26

Ticket committed as f858f68; guide built to a 27-page PDF and uploaded to Projects/2026/07 on the reMarkable. The pandoc playbook corrects DATADROP-6's font fallback — DejaVu Serif lacks U+2713, which a per-family fc-list check hides


## 2026-07-26

Phase 1: the store is a factory and only a factory (commit 4796da2). Removed export const store, made the persistence key a parameter defaulting to null, and moved the document seed into makeStore. Found two defects one store could not reveal: layoutSlice's initialState is evaluated once at module load so every unpreloaded store shared a workspace id, and the fallback layout was one launcher tile, so the shell's own story had been rendering an empty workbench. 187 tests

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/index.ts — The factory, and the comment describing what one store could not reveal

