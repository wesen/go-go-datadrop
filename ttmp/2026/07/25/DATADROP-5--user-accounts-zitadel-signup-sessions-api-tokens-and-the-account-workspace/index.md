---
Title: 'User accounts: Zitadel signup, sessions, API tokens and the account workspace'
Ticket: DATADROP-5
Status: complete
Topics:
    - auth
    - oidc
    - zitadel
    - docker-compose
    - accounts
    - upload
    - tokens
    - frontend
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://pkg/server/middleware.go
      Note: the entire current auth model — authenticate, authorizeRead, ActorLabel "token"; the file this ticket replaces
    - Path: repo://pkg/server/server.go
      Note: Config.Token, the route table, and the middleware chain that gains a principal resolver
    - Path: repo://pkg/cli/serve.go
      Note: the flag surface that gains --auth, --oidc-*, --external-url
    - Path: repo://pkg/store/migrations/0001_init.sql
      Note: drops has no owner column; audit_log.actor is a constant
    - Path: repo://pkg/server/handlers_datasets.go
      Note: the open/upload/commit triad, and the includeDrafts=false read that hides a client's own draft
    - Path: repo://pkg/server/handlers_blobs.go
      Note: handleUploadDatasetFile and the digest mount fast path the browser uploader exploits
    - Path: repo://ui/src/api/client.ts
      Note: its header comment claims every endpoint is a GET — the invariant this ticket retires, narrowly and provably
    - Path: repo://ui/src/store/spaces.ts
      Note: the workspace presets that gain the two hardwired spaces
ExternalSources:
    - https://zitadel.com/docs/self-hosting/deploy/compose
    - https://zitadel.com/docs/apis/openidoauth/endpoints
    - https://datatracker.ietf.org/doc/html/rfc9700
Summary: 'Adds real user accounts to go-go-datadrop: OIDC sign-in and self-service signup against a self-hosted Zitadel, server-side sessions, user-scoped API tokens, per-drop ownership and membership, a docker compose stack that provisions itself, and four new PBUI tiles in two hardwired workspaces.'
LastUpdated: 2026-07-26T18:15:53.241790885-04:00
WhatFor: ""
WhenToUse: ""
---


# User accounts: Zitadel signup, sessions, API tokens and the account workspace

## Overview

DATADROP-1 through DATADROP-4 built a system with exactly one credential: a
static bearer token passed to `datadrop serve --token`. Everyone who can write
holds the same string, `audit_log.actor` is the literal constant `"token"`
(`pkg/server/middleware.go:27`), and the only expressible sharing rule is the
per-drop `public_read` boolean — so the two available states are "everyone with
the token" and "the entire internet".

This ticket introduces people.

- **Identity comes from Zitadel**, a self-hosted OIDC provider running in the
  compose stack beside datadrop. It owns passwords, MFA, email verification and
  the registration form. We never store a password and never write a login form.
- **Authorization stays here.** A `users` table keyed on `(issuer, subject)`,
  an `owner_id` on drops, a `drop_members` table with three roles, and API
  tokens that *narrow* their owner's rights rather than carrying rights of their
  own.
- **Two credential kinds, one `Principal`.** A browser gets an HttpOnly session
  cookie from a backend-for-frontend flow; the CLI and CI get `ddp_…` tokens
  that work with today's client unchanged. Both resolve through one function.
- **Four new tiles in two hardwired workspaces**: `signin`, `profile`, `tokens`
  and `upload`, in `welcome` and `account` — defined in code, re-created on
  every load, and not deletable.

The design goal to keep in view: **a Zitadel outage affects only new sign-ins.**
Existing sessions and every API token keep working, because authorization is
entirely local and no request handler ever calls the identity provider.

## Note for anyone reading AGENT.md

Two overrides, both deliberate and both explained in the guide.

`AGENT.md` says to use bootstrap CSS for web applications. It has been otherwise
indicated for this application since DATADROP-4; the four new tiles use the same
tokens, CSS modules and `data-part` contract as every other tile.

`AGENT.md` says not to add backwards-compatibility layers. The `--auth=token`
mode is not one — it is a supported deployment mode for headless single-user
installations and an operator break-glass, and it is what keeps the CLI smoke
tests free of a browser dependency. DR-26 says so, so that a later reader does
not delete it as cruft.

## Key Links

- **Design guide**: [design/01-user-accounts-with-zitadel-analysis-design-and-implementation-guide.md](./design/01-user-accounts-with-zitadel-analysis-design-and-implementation-guide.md)
  — 3 200 lines: analysis (§1–5), server design (§6–12), the compose stack
  (§13), the frontend (§14–15), plan and reference (§16–21). Read it before
  writing code. §7.2 and §8.5 are the two sections to read twice.
- **Preceding tickets**: DATADROP-3 (the table endpoints and `pkg/webui`),
  DATADROP-4 (the PBUI shell and design system this ticket adds tiles to).
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## The decisions, in brief

Full statements with alternatives and costs are in guide §19.

| | |
|---|---|
| DR-18 | Zitadel is an OIDC provider, not a dependency — standard OIDC only, no SDK at runtime |
| DR-19 | The backend holds the tokens; the browser holds a cookie (BFF) |
| DR-20 | No refresh token is stored — we call no API on the user's behalf |
| DR-21 | CSRF is defended by an `Origin` check, `SameSite=Lax` behind it |
| DR-22 | Two credential kinds, one `Principal` |
| DR-23 | `ddp_<id>_<secret>`, SHA-256 of the secret half — no KDF, and why |
| DR-24 | Rights are the intersection of membership and scope, per request |
| DR-25 | Existing drops stay unowned; guessing an owner is a silent grant |
| DR-26 | Three auth modes; misconfiguration fails closed |
| DR-27 | The workbench stops being read-only — narrowly, and pinned by a test |
| DR-28 | A token's presentation value never contains its secret |
| DR-29 | Hardwired workspaces are code-defined, fixed-id, merged over storage |
| DR-30 | The browser hashes before it uploads, up to 64 MiB |
| DR-31 | One signed-out gate at the shell, not per tile |

## Status

Current status: **review**

## Topics

- auth
- oidc
- zitadel
- docker-compose
- accounts
- upload
- tokens
- frontend

## Tasks

See [tasks.md](./tasks.md) for the current task list — eight phases, ordered so
the system is never running with half-applied authorization.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
