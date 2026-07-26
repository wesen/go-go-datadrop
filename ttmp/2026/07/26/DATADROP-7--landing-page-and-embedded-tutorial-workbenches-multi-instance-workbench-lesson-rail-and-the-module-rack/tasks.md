# Tasks

## TODO

- [x] Phase 1 — De-singleton the store: makeStore seeds its own document, save/load take a key, usePersistence, and a guard test that the module exports no instance <!-- t:6nz9 -->
- [x] Phase 2 — Split WorkbenchShell from the application: move the signed-out gate, the ?first=1 read and the persistence effect up; drop height:100vh; add WorkbenchInstance and the per-instance app allow-list <!-- t:c22i -->
- [x] Phase 3 — The fixture base query: serve tables from a fixture map on the store's extra argument, honour the row budget, and round-trip every endpoint back to a SourceRef <!-- t:ihfj -->
- [ ] Phase 4 — The rail components: Tick (adopted by the four tutorial tiles in the same commit), LessonStep, PredictPrompt, HintList, GoalItem, LessonRail, BriefChecklist <!-- t:6q7n -->
- [ ] Phase 5 — The module rack: ModuleCard, CheatCard, ModuleRack, and a five-row card for every one of the 21 registered applications <!-- t:gc0c -->
- [ ] Phase 6 — The four tracks and the brief, retargeted onto our committed fixtures; wedgeOf; and the anti-rot test that every run satisfies its own done <!-- t:y1ar -->
- [ ] Phase 7 — The page: TourSection, LandingPage, reset-by-remount, sticky nav, and a render with the API returning 500 <!-- t:xqnm -->
