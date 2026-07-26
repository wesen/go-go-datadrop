# Tasks

## TODO

- [x] Phase 1 — Scaffolding: pkg/cli/section.go (client section for --addr/--token), exit.go (exitOn), rows.go (one projection per response type, flattening through pkg/tabular), rows_test.go pinning the key sets <!-- t:ksjx -->
- [x] Phase 2 — One verb end to end: convert 'list' alone; settle section attachment, parser config, ShortHelpSections, --print-schema; check whether --print-parsed-fields redacts --token <!-- t:szrk -->
- [x] Phase 3 — Reading verbs: query, tail, inspect, whoami as GlazeCommands; export stays a WriterCommand; tail --follow defaults --stream true and exits 0 on interrupt <!-- t:prgs -->
- [x] Phase 4 — The exit-code contract: thread exitOn through every converted verb, get TestExitCodes green, and settle the datadrop:/Error: message prefix <!-- t:oq2c -->
- [x] Phase 5 — Writes and datasets: create, push, schema put/show, dataset push/list/show/rm/import/gc as GlazeCommands; dataset get, serve, healthcheck as BareCommands <!-- t:alzr -->
- [ ] Phase 6 — Delete pkg/cli/output.go, add the --output ndjson deprecation shim and warning, write the 'cli-output' help page into pkg/doc/topics, update README and docker-compose <!-- t:cw3q -->
