# Changelog

## 2026-07-26

- Initial workspace created


## 2026-07-26

Created DATADROP-9 and wrote the design guide: nineteen CLI verbs classified into GlazeCommand (15), WriterCommand (1) and BareCommand (3); a client section replacing the persistent --addr/--token flags; the row shape as a pinned contract flattened through pkg/tabular; and the three properties a naive conversion destroys (exit codes, NDJSON, export's server-side streaming). 1 115 lines, eleven decision records DR-74..DR-84, six phases. PDF (20 pages, zero missing glyphs) uploaded to the reMarkable at Projects/2026/07. Not implemented.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/26/DATADROP-9--glazed-verbs-convert-the-cli-to-glazed-commands-with-structured-output/design/01-rows-instead-of-renderers-analysis-design-and-implementation-guide-for-converting-the-datadrop-cli-to-glazed-commands.md — The guide


## 2026-07-26

Phase 1: client section, exit-code helper, row projections and their guard test (commit 62e53d4)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/rows.go — The row shapes DR-79 makes a public API


## 2026-07-26

Phase 2: 'list' converted to a GlazeCommand; wiring, short help and env loading settled; --print-parsed-fields token leak confirmed and closed with fields.TypeSecret (commit fe5523f)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/build.go — The parser config every converted verb shares


## 2026-07-26

Phase 3: query/tail/inspect/whoami as GlazeCommands, export as a WriterCommand; --stream renamed to --drop-stream after a fatal collision with glazed's flag; tail --follow made to actually stream (commit 55e8b67)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/events/tail.go — Why tail defaults to --stream and --table-format markdown


## 2026-07-26

Phase 4: exit-code contract pinned by pkg/cli/exit_test.go and verified by removing WithExitCodes; prefix settled on 'datadrop: ' (commit c759e77)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/cli/exit_test.go — The fast proof of the exit-code mapping


## 2026-07-26

Phase 5: the remaining fourteen verbs converted; read.go/push.go/dataset.go/output.go deleted; --flatten and dataset import --format renamed; tree guard tests added (commit 34b9ce4)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/cmd/datadrop/tree_test.go — Guards the command surface and the --format/--output rule


## 2026-07-26

Phase 6: --output ndjson deprecation shim, the cli-output help page, and the README Output section; the guide's template replacement does not work in glazed v1.3.8 and export --format ndjson is named instead (commit 3eb3a29)

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/doc/topics/06-cli-output.md — The help page a script author reads

