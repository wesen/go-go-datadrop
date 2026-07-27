# Changelog

## 2026-07-25

- Initial workspace created


## 2026-07-25

Created DATADROP-5 and wrote the 3200-line analysis/design/implementation guide: Zitadel OIDC signup, BFF sessions, ddp_ API tokens, per-drop ownership and membership, a self-provisioning docker compose stack, and four account tiles in two hardwired workspaces. Fourteen design records (DR-18..DR-31) and an eight-phase plan.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/server/middleware.go — the current auth model this ticket replaces
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ui/src/api/client.ts — the read-only invariant this ticket narrowly retires


## 2026-07-25

Implemented all seven phases: pkg/auth pure core, migration 0003, authorization applied across every handler in one commit, OIDC sign-in and signup, the self-provisioning compose stack, four account tiles in two hardwired workspaces, the browser uploader, and sharing. ~50 new tests, lint clean, verified live against a Zitadel stack.

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/deploy/compose/docker-compose.yml — the local stack, including the .test hostname finding
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/pkg/auth/role.go — EffectiveRole and Authorize — the whole decision


## 2026-07-25

Playbook: how to test it and how to run Storybook; fixed make ui-test/ui/ui-dev, which used a bun --cwd form that exits 0 without running the script; added make storybook and build-storybook

### Related Files

- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/Makefile — bun --cwd=ui, with the equals sign; storybook targets
- /home/manuel/workspaces/2026-07-24/datadrop-mcp/go-go-datadrop/ttmp/2026/07/25/DATADROP-5--user-accounts-zitadel-signup-sessions-api-tokens-and-the-account-workspace/scripts/sharing-matrix.py — the nine-row authorization matrix, made durable and re-runnable


## 2026-07-26

Closed: Zitadel signup, sessions, API tokens and the account workspace complete, with the token-handling invariants recorded in DR-28 and guarded by api-surface.test.ts.

