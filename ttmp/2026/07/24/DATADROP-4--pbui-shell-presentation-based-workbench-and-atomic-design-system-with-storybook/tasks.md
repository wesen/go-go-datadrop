# Tasks

## TODO

- [x] Phase 0 — Demolition and foundations: walk the §4.4 salvage list into the diary, delete ui/src/App.tsx and ui/src/components/, bun remove bootstrap, keep model+api+export+test. Visual foundation: reset.css with a focus-visible ring, tokens.css (palette generated from model/plot.ts, --pbui-faint darkened to #696e75 for contrast), scrollbars.css, foundation/ and layout/ primitives, the ten rules of §10.3 as a token-sheet story. Machinery: layer directories, import-boundary lint rule, Storybook 9 with the three decorators, committed fixtures (guide §4.4, §10.3, §11, §15, DR-13, DR-17) <!-- t:igzx -->
- [ ] Phase 1 — PBUI core proven in Storybook: PbuiProvider, Presentation, registry, field/source/doc descriptors, ObjectMenu, AcceptBanner, MouseDocLine, and the chip atoms; the Playground story with a filtered accept is the acceptance test (guide §8, DR-10) <!-- t:syyt -->
- [ ] Phase 2 — Store: world and layout slices, the §16.2 reducer test list, selector factories, defensive localStorage persistence; still nothing on screen (guide §7, §14.1, §16.2) <!-- t:zmyw -->
- [ ] Phase 3 — The shell, and the app runs again: split tree, tile chrome, snapping dividers, drag-to-dock, workspace strip, status bar, launcher, app registry, document bars, pages/Workbench, plus source/pipeline/encoding/chart/table apps. Ends the dark period — run make ui, check the binary, extend Playwright. Acceptance: the build workspace does everything the deleted App.tsx did (guide §9, §17) <!-- t:16z9 -->
- [ ] Phase 4 — Remaining applications: gallery, compare, inspector, watchlist, trace, charts, about, and the eight remaining presentation-type descriptors (guide §12) <!-- t:0hyh -->
- [ ] Phase 5 — Multiple documents and snapshots: several live documents, snapshot/restore/fork, compare pins, permalink round trip (guide §7.3, §12.7, §12.8) <!-- t:avzo -->
- [ ] Phase 6 — Tutorials and polish: four tutorial workspaces with working run buttons, live glossary, seeded tutorial drop, keyboard and a11y work, performance caps (guide §12.12, §14, §15) <!-- t:obnd -->

