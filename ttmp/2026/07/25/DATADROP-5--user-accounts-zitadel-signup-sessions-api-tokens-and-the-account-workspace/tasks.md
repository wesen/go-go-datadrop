# Tasks

## TODO

- [x] Phase 0: pkg/auth pure core — Principal, ScopeSet, Role, ddp_ token mint/parse/verify, effectiveRole; no HTTP, no SQL <!-- t:0bmt -->
- [x] Phase 1: migration 0003_accounts.sql plus store/{users,sessions,tokens,members}.go and drops.owner_id; cascade + sweeper tests <!-- t:hjmy -->
- [x] Phase 2: authorization applied everywhere at once — resolver middleware, authorize/authorizeDrop/checkOrigin, every handler converted, auth modes, GET /v1/me <!-- t:1gf6 -->
- [x] Phase 3: OIDC — pkg/auth/oidc.go, handlers_auth.go, JIT provisioning, sessions, sign-out, fake Provider tests <!-- t:vrw0 -->
- [x] Phase 4: deploy/compose — postgres, zitadel-api, zitadel-login, traefik, provision.sh, Dockerfile, make targets; idempotent on second run <!-- t:p7ml -->
- [x] Phase 5: account tiles — session slice, four presentation types + descriptors, new atoms, signin/profile/tokens/upload tiles, two pinned workspaces, signed-out gate <!-- t:9kx8 -->
- [x] Phase 6: uploader — batch state machine, browser hashing, mount fast path, resume, and the draft listing endpoint <!-- t:rwtx -->
- [x] Phase 7: sharing and docs — membership endpoints, members UI, datadrop whoami, README, residual-risk diary entry <!-- t:oqg0 -->
