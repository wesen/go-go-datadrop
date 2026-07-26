# Changelog

## 2026-07-26

- Initial workspace created


## 2026-07-26

DATADROP-7 opened: imported sources/pbui-landing.jsx (2719 lines, five embedded workbenches with predicate-driven lesson rails), analysed it against our tree, and wrote the guide. Central finding: exactly one runtime import of the store singleton exists across 246 files (main.tsx:9), so multi-instance embedding is the removal of seven named singletons rather than a rewrite. Seven phases, DR-45 to DR-56, fourteen new components

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/pages/Workbench/Workbench.tsx — Four of the seven singletons, all of them application concerns in the shell
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/store/index.ts — makeStore is already a factory; the singleton beside it is what has to go

