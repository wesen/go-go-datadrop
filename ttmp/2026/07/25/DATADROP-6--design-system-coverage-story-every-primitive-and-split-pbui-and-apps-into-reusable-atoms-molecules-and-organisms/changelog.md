# Changelog

## 2026-07-25

- Initial workspace created


## 2026-07-25

Analysis and design: read the datadrop UI and the rag-evaluation-site reference, measured the duplication (42 raw buttons, 6 drifted style constants, 4 identical input literals), and wrote the 1745-line guide with DR-32 through DR-39 and seven implementation phases

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/AGENT.md — gained the standing diary-and-commit rule
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/test/layers.test.ts — the graph whose one incidental organisms-to-apps edge shaped DR-33


## 2026-07-25

Guide converted to a 30-page PDF and uploaded to reMarkable at Projects/2026/07; needed a DejaVu font switch plus a Noto Sans Symbols2 fallback for U+2316, because xelatex drops missing glyphs silently

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/25/DATADROP-6--design-system-coverage-story-every-primitive-and-split-pbui-and-apps-into-reusable-atoms-molecules-and-organisms/reference/01-diary.md — step 4 records the pandoc invocation and the glyph fix


## 2026-07-25

Phase 1: the six control atoms (commit 0ab9e4e). reset.css strips buttons to text, so Button needs variant=bare|framed — 29 of the 42 hand-written buttons were deliberately bare, not unstyled. The planned dim prop is gone: every dimming call site also set disabled, so the opacity was the disabled treatment

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/atoms/Button/Button.module.css — the two treatments, and the 0.4 disabled opacity phase 6 owns


## 2026-07-25

Phase 2: substitution complete (commit 6e80eda). 42 buttons, 9 selects, 12 inputs and all six btn style objects gone; inline styles 80 to 51. Found a third button treatment (raised) that tokens.css had named and nothing implemented, and four elements that must stay raw

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/apps/SourceApp/SourceApp.tsx — all three interesting substitution cases in one file


## 2026-07-25

Phase 3: 24 stories written and ui/test/stories.test.ts turned on (commit 156b210). Storybook 5 to 83 stories; deleted the empty organisms/StatusBar directory; verified the coverage test fails when a story is removed

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/test/stories.test.ts — six checks, including the title prefix and the empty-directory guard


## 2026-07-25

Phase 4: 19 new components with 59 stories, Storybook now 142 (commit fa934fc). ChannelRow exists once instead of twice; formatBytes moved to model/format.ts because molecules may not import apps; four proposed components dropped for want of a call site

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/components/molecules/ChannelRow/ChannelRow.tsx — the component that existed twice


## 2026-07-25

Phase 5: DR-33 appkit move and five presentational organisms (commit c3c3788). The five account apps drop from 1262 to 658 lines; Storybook at 180. Found and fixed a hole in layers.test.ts: an unknown layer was silently unconstrained

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/test/layers.test.ts — the graph after DR-33, plus the new every-source-directory guard


## 2026-07-25

Phase 6: ui/GUIDELINES.md, test/no-raw-controls.test.ts and the deferred disabled-contrast fix (commit 2895585). 177 tests, 180 stories, zero hand-written form controls. The new guard found InlineRename had been built in phase 4 and never adopted

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/GUIDELINES.md — the policy in one place, each rule naming its test


## 2026-07-25

Follow-ups: v0.5 project report pushed to the go-go-parc vault (72590db), and GUIDELINES.md gained a procedural section 8 on adding a component, an application or a hardwired workspace (453bef6)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/GUIDELINES.md — section 8 is the authoring procedure, built from the ticket's own mistakes

