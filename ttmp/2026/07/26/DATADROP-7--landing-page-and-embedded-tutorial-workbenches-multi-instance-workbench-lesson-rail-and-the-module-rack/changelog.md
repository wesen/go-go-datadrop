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


## 2026-07-26

Phase 2: the shell splits from the application, and WorkbenchInstance embeds it (commit 24d0a07). WorkbenchShell now has no effects at all; the four session concerns moved up. DR-51 height, DR-53 app scope, DR-55 provider placement. Verified in a browser: two instances side by side, left reaches 2 documents while right stays at 1, scoped picker offers 11 options against 63. Found that a select whose value is outside its options is a silent data-loss bug, and that a mistyped CSS custom property has no guard anywhere in the tree

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/pages/Workbench/WorkbenchShell.tsx — What is left of the shell once the session concerns leave


## 2026-07-26

Phase 3: fixtures answer instead of the network (commit 8302e2c). Interception at the base query, with the map on the store's thunk extra argument — the only per-store channel a base query can read — so no call site above it changes. client.ts gains PATHS because a built RTK endpoint does not expose its query at runtime, which is what makes the round-trip test able to fail. Verified in a browser with no server: 365 marks, 203 table rows, zero requests to /v1/. 204 tests

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/api/fixtures.ts — Listings derived from the sources, so a tour cannot name a drop it has no table for


## 2026-07-26

Phase 4: the lesson rail and completion by predicate (commit f7b4261). One atom, four molecules, two organisms, seven story files. Three defects found in a browser that a green suite and a clean build did not: auto-advance made the watched follow-up unreachable and made pressing the run button feel like progress; a brief goal was satisfied by null === null when two tiles were both unbound; and the raw-controls guard rejected two hand-written buttons, both of which were better as Button

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/organisms/LessonRail/LessonRail.tsx — Only a self completion advances — a watched step stays open so its nudge is reachable


## 2026-07-26

Phase 5: the module rack and a card for every application (commit 7fe48c1). tour/ is a new layer that may not import components, which is what keeps a predicate testable with no DOM. The rack's two groups derive from AppDescriptor.docBound rather than a hand-kept list. Writing the nine undescribed cards was the real work: a fixed slot is a question you cannot skip, and it caught four gaps in what we knew about our own applications. 209 tests

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/tour/modules.tsx — The vocabulary, in one place, with a test that keeps it complete


## 2026-07-26

Phase 6: the four tracks, the brief, and the anti-rot test (commit 01eab25). Fifteen lessons and a five-goal capstone, retargeted onto our committed fixtures. test/lessons.test.ts runs every ▶ and asks its own predicate; it failed twice immediately. B3 was uncompletable because leaf() defaults docId to null, so both tiles followed the active document and the lesson's own premise was unreachable. C6's predicate silently required C2 to have happened. Both fixed; 226 tests

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/test/lessons.test.ts — One fresh store per lesson — the discomfort that causes is the information


## 2026-07-26

Phase 7: the tour page (commit 99f4fb8). Six sandboxed workbenches down one scrolling page; main.tsx routes /ui/tour without a server change. Verified in a browser with no server: 6 shells, 1825 marks, zero requests to /v1/, and §A at 1/4 while §B, §C and the brief stay at 0. Found two defects — SourcePanel offered a bearer token with nothing to authenticate to, which was also a --auth=none product bug since DATADROP-5, and Product() built a store in a render body. Closes the CSS token guard deferred since phase 2. All seven phases done; 229 tests

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/main.tsx — One bundle, routed by path; the / redirect is deliberately untouched

