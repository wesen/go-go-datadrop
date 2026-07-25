---
Title: Implementation diary
Ticket: DATADROP-5
Status: active
Topics:
    - auth
    - oidc
    - zitadel
    - docker-compose
    - accounts
    - upload
    - tokens
    - frontend
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Step-by-step record of implementing DATADROP-5 — what was built, what broke, and where the code disagreed with the design."
LastUpdated: 2026-07-25T12:56:37.72995236-04:00
WhatFor: Reviewing DATADROP-5, and continuing it if someone else picks it up.
WhenToUse: Read alongside the design guide; the guide says what was intended, this says what happened.
---

# Diary

## Goal

Implement DATADROP-5 — user accounts against a self-hosted Zitadel — in the
eight phases the design guide lays out, recording at each step what was built,
what failed, and where the code disagreed with the design.

## Step 1: The ticket and the guide

Before any code, the analysis. The existing system has exactly one credential —
a static bearer token — and the six concrete things that breaks are enumerated
in guide §2. The design that follows exists to fix those six and nothing else,
which is the check against scope creep for every later step.

The research phase was worth its cost. Zitadel's current compose deployment is
materially different from what most third-party write-ups describe: the login UI
is now a separate Next.js service authenticating as a machine user, which forces
a reverse proxy into the stack, which is what makes the issuer-URL trap (§13.2)
unavoidable rather than incidental. Reading upstream's actual compose file and
`cmd/setup/steps.yaml` rather than a blog post is what produced a `FirstInstance`
configuration that should work on the first run.

### Prompt Context

**User prompt (verbatim):** "Let's add user signup, using zitadel in a docker compose setup, and a set of easy tiles and hardwired workspace for users to a) signup b) manage their profile c) upload datasets d) create tokens.

Create a new docmgr ticket, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a docmgr ticket for adding real user accounts backed by a self-hosted Zitadel in docker compose, plus four self-service tiles (signup, profile, dataset upload, token management) in a fixed workspace; write an intern-facing analysis/design/implementation guide into the ticket and push it to the reMarkable.

**Inferred user intent:** Move the project from a single shared static token to a multi-user system a stranger can sign up for, with the security-relevant decisions settled and written down before implementation starts — so they are reviewable rather than emergent.

### What I did

- Verified Zitadel specifics against primary sources rather than prose:
  upstream `deploy/compose/docker-compose.yml`, `cmd/setup/steps.yaml` (the
  authoritative `FirstInstance` block), `proto/zitadel/management.proto` and
  `admin.proto` (REST paths and enum values), and the OIDC endpoint reference.
- Read the whole current auth surface: `pkg/server/middleware.go`, `server.go`,
  `pkg/cli/serve.go`, both migrations, the dataset and blob handlers,
  `pkg/client/client.go`, and the frontend's `api/client.ts`, `pbui/`, `store/`
  and `apps/registry.ts`.
- `docmgr ticket create --ticket DATADROP-5`; eight phase tasks; index rewritten
  with the decision table.
- Wrote the design guide — 3 241 lines, 23 sections, 14 design records
  (DR-18…DR-31), 4 diagrams.
- Uploaded to `ai/2026/07/25/` on the reMarkable; confirmed with `rmapi ls`.

### Why

The decisions in this ticket — where a credential lives, what revocation costs,
whether a token can escalate — are exactly the kind that become permanent by
accident if they are made while writing handlers. Writing them down with their
alternatives first means they can be argued with.

### What worked

- Reading the code before designing found three gaps the design has to close,
  which would otherwise have surfaced mid-implementation.
- Grounding §13 in upstream's actual compose file means the stack reflects the
  login-v2 architecture rather than a two-versions-ago mental model.

### What didn't work

- `docmgr ticket list` silently omitted DATADROP-5 while `--ticket DATADROP-5`
  still resolved for `task add` and `doc add`. Cause: a `RelatedFiles` note
  beginning with a double quote — `Note: "Every endpoint here is a GET" — …` —
  is invalid YAML (a quoted scalar with trailing content). The ticket was
  dropped from the index with no error at all. Fixed by rewording so the note
  does not start with a quote.
- `pandoc` refused the guide with `YAML parse exception at line 9, column 2,
  while scanning a block scalar`, pointing at the frontmatter, which was valid.
  Actual cause: pandoc reads any `---` … `---` region in the document as a
  metadata block, and §4.1's markdown table begins with `|`, which YAML reads as
  a block-scalar indicator. Bisected by chunking the body on `---` boundaries.
  Fixed by converting the 21 body separators to `***`.
- `docmgr doc relate` merged a new note with an existing one into a YAML block
  scalar (`Note: |-`) with duplicated text. Deduped by hand.

### What I learned

- `ZITADEL_FIRSTINSTANCE_*` applies **only** on first init. Changing one and
  restarting does nothing; the reset is `docker compose down -v`. This is the
  single most expensive thing not to know about the stack.
- The v1 `management`/`admin` REST APIs are deprecated in favour of Connect-RPC
  v2 services, which carry no `google.api.http` annotations — so their paths
  cannot be read off the protos and must be verified against a running
  instance. The provisioning script therefore uses v1, which is verifiable.
- `UpdateLoginPolicy` is a full replacement, not a patch. A `PUT` carrying only
  `allowRegister: true` zeroes `allowUsernamePassword` and locks every human out
  of an instance whose only other credential is a machine PAT.

### What was tricky to build

Deciding what *not* to put in Zitadel. It has organisations, projects, roles and
grants, and modelling drop membership on them is superficially attractive. The
argument that settled it is availability: §1.2 promises that a Zitadel outage
affects only new sign-ins, and that is only keepable if no request handler ever
calls the identity provider. Once stated that way the boundary in §5.4 follows
mechanically, and §17.4 step 12 turns it into a test.

### What warrants a second pair of eyes

- §7.2 — rights as the intersection of membership and credential scope,
  computed per request. This is the decision an optimiser will "fix" by caching
  rights on the token, at which point revoking membership stops revoking access.
- §8.5 — the CSRF origin check, the control most likely to be forgotten on a
  future endpoint, which is why it lives inside `authorizeDrop` rather than
  beside it.
- §12.4's `GET /v1/users/lookup?email=` — an existence oracle over email
  addresses. Restricted and audited, but an invite flow is the better answer.

### What should be done in the future

- An invite flow keyed on email, replacing the lookup endpoint.
- Mailpit in the compose stack so email verification is exercised locally and
  `--oidc-require-verified-email` can stay true everywhere.
- `datadrop login` via OAuth device-code flow.

### Code review instructions

Read the guide §1–5 (analysis), §6–12 (server), §13 (stack), §14–15 (frontend).
§19 is the decision list; disagreements are best raised against a DR number.

### Technical details

| Verified fact | Source |
|---|---|
| `ZITADEL_FIRSTINSTANCE_PATPATH` writes an IAM_OWNER machine PAT | `cmd/setup/steps.yaml` |
| Login v2 is a separate service reading a PAT from a shared volume | upstream `deploy/compose/docker-compose.yml` |
| `POST /management/v1/projects/{projectId}/apps/oidc` | `proto/zitadel/management.proto:3632-3636` |
| `PUT /admin/v1/policies/login`, field `allow_register` | `proto/zitadel/admin.proto:2762`, `policy.proto` |
| `OIDC_AUTH_METHOD_TYPE_BASIC`, `OIDC_APP_TYPE_WEB` | `proto/zitadel/app.proto:198-209` |
| Masterkey must be exactly 32 characters | upstream `.env.example` |
