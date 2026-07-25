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

## Step 2: Phase 0 — the pure core

`pkg/auth` with no HTTP, no SQL and no network: `Principal`, `ScopeSet`, `Role`,
the `ddp_` token format, and `EffectiveRole`/`Authorize`. The whole point of the
phase is that the authorization rules become testable with literals, so the
matrix in guide §17.2 can be written out exhaustively rather than sampled.

Writing the tests found a real bug in my own design before a single handler
existed, which is the argument for this phase in one sentence.

### Prompt Context

**User prompt (verbatim):** "Implement the ticket, keep a detailed diary at every step, commit as you go."

**Assistant interpretation:** Work through DATADROP-5's eight phases in order, recording a diary step per phase and committing each phase separately.

**Inferred user intent:** A reviewable trail — code and reasoning committed together, so the implementation can be picked up or audited without re-deriving why anything is the way it is.

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 0`

### What I did

- `pkg/auth/principal.go` — `Kind`, `Principal`, `Label()`, context helpers.
- `pkg/auth/scope.go` — four scopes, `ScopeSet`, parse/validate, stable ordering.
- `pkg/auth/role.go` — three roles, `AtLeast`, `DropACL`, `EffectiveRole`,
  `Authorize`.
- `pkg/auth/token.go` — mint, parse, hash, verify; plus id/session/flow value
  generation.
- `pkg/auth/auth_test.go` — 16 tests including the full authorization matrix.

### Why

Guide §10.2: an authorization test that needs an HTTP server and a database is a
test nobody writes exhaustively, and exhaustively is the only way worth writing
them. Keeping the decision function pure is what makes the matrix cheap.

### What worked

- `Authorize(principal, acl, requiredRole, requiredScope)` as a single pure
  function reads well at the call site and made every matrix row a one-liner.
- Passing `DropACL` as an argument rather than looking it up means the tests
  need no store at all.

### What didn't work

**`Allowed` denied everything to anonymous, which would have broken
`public_read`.** My first draft had:

```go
case KindAnonymous:
    return false
```

`EffectiveRole` correctly gives an anonymous caller `RoleReader` on a
`public_read` drop, but `Authorize` then failed the scope half and returned
false. Every anonymous read of a public drop would have 401'd — a straight
regression against v0.1 behaviour, in the one code path with no test coverage
upstream because it needs no credential.

The fix is a reframing rather than a special case: a scope limits the
*credential*, it never grants. An anonymous caller's credential permits reading;
whether there is anything to read is `EffectiveRole`'s business. So
`Anonymous()` carries `ScopeDropsRead` and `Allowed` has no anonymous branch at
all. Two matrix rows pin it — "anonymous reads a public drop" and "anonymous
cannot write a public drop".

`Anonymous` also became a function rather than a package variable, because
`ScopeSet` is a map and a shared mutable map held by every anonymous request is
a bad thing to leave lying around.

### What I learned

- `RoleNone.AtLeast(RoleNone)` must be **false**. `RoleNone` is the absence of a
  role, not a weak role, so a naive `rank >= rank` comparison makes a stranger
  satisfy a `RoleNone` requirement — and any handler that forgot to name a role
  would open. The `rank > 0` guard and its test row exist for that.
- Unknown scopes must be preserved on parse, not dropped. A scope written by a
  newer version and read by an older one that silently disappears *widens* the
  token by forgetting what it was limited to.

### What was tricky to build

The interaction between the two halves of an authorization decision. It is
tempting to fold scope into role, and the two really are different: role answers
"what is this person to this drop", scope answers "what did they permit this
particular credential to do". Keeping them separate is what makes DR-24
expressible at all, and `TestRemovingAMemberNarrowsTheirTokensImmediately` is
the property written down — it fails the moment anyone caches rights on a token.

### What warrants a second pair of eyes

- `ScopeSet.Has` treats `ScopeAdmin` as implying every other scope. That is a
  deliberate UI affordance (otherwise the box labelled "admin" does the least),
  but it does mean an admin-scoped token is unrestricted *within the holder's
  own rights*.
- `EffectiveRole`'s fall-through to `public_read` after the members lookup: a
  member row is consulted first, so a `reader` row on a public drop is
  indistinguishable from no row. That is intended and harmless today; it would
  matter if a future "denied" role existed.

### What should be done in the future

- Nothing from this step. The phase is self-contained.

### Code review instructions

Start at `pkg/auth/role.go:EffectiveRole` and `Authorize` — they are the whole
decision. Then `auth_test.go:TestAuthorizationMatrix`, which is the
specification in executable form.

```bash
GOWORK=off go test ./pkg/auth/ -count=1 -v
```

`GOWORK=off` is needed throughout: a parent `go.work` requires Go 1.26.1 and the
toolchain here is 1.25.5. The Makefile already sets it on every target.

### Technical details

Token format, as minted:

```
ddp_7f3k9m2qx4vb3_8h2n6p4r9tzw3xk5mcqf7bdy1sav0jne
     ^13 chars      ^32 chars
     8 bytes        20 bytes = 160 bits
```

Lowercase base32 (`abcdefghijklmnopqrstuvwxyz234567`), no padding, parsed
case-insensitively.

## Step 3: Phase 1 — the schema and the stores

Migration 0003 and four new store files: users, sessions (plus the sign-in
flows), API tokens, and membership. Nothing in `pkg/server` changes yet, which
is what makes this phase safe to land on its own — the tables exist and are
exercised, and no request path has been touched.

The interesting work was not the SQL. It was deciding what each query must
refuse, and then writing the test that proves it refuses.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 1 of the plan — the accounts schema and its store layer.

**Inferred user intent:** (see Step 2)

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 1`

### What I did

- `pkg/store/migrations/0003_accounts.sql` — `users`, `sessions`, `auth_flows`,
  `api_tokens`, `drop_members`, and `drops.owner_id`.
- `pkg/datadrop/account.go` — `User`, `Session`, `APIToken`, `Member`,
  `AuthFlow`, the token request/response types, and `ParseExpiresIn`.
- `pkg/store/users.go`, `sessions.go`, `tokens.go`, `members.go`.
- `pkg/store/drops.go` — `owner_id` throughout, plus a `queryDrops` helper so
  `ListDrops` and `VisibleDrops` share one column list and one scanner.
- `pkg/store/errors.go` — `ErrConflict`, distinct from `ErrAlreadyExists`.
- `pkg/store/accounts_test.go` — 17 tests.

### Why

Guide §11. The three properties worth restating: users key on
`(issuer, subject)` and never on email; sessions store the SHA-256 of the cookie
rather than the cookie; and no refresh token is stored at all (DR-20).

### What worked

- `DropACL` as a plain struct that `EffectiveRole` consumes means the store and
  the pure decision function meet at a value, and both are testable alone.
- `ClaimDrop`'s `WHERE ... AND owner_id IS NULL` makes the claim atomic for
  free: two people racing for one drop cannot both win, and the loser gets a
  409 rather than silently stealing it.
- Adding `owner_id` to `drops` needed a `dropColumns` constant. That turned out
  to matter immediately — `VisibleDrops` and `ListDrops` would otherwise have
  been two column lists to keep in step.

### What didn't work

Two tests failed on the first run, and both were bugs in the tests rather than
in the code — but they were the *useful* kind, because they exposed a fail-open
default worth writing down.

```
--- FAIL: TestExpiryIsEnforcedWithoutTheSweeper
    accounts_test.go:285: an idle session resolved
--- FAIL: TestStaleAuthFlowIsBurnedNotReusable
    accounts_test.go:325: a stale flow was accepted (err = <nil>)
```

I had written "already stale" as a **negative** duration — `GetSession(ctx, raw,
-time.Second)` and `TakeAuthFlow(ctx, "old", -time.Second)`. Both APIs treat a
non-positive limit as "this check is disabled", so the guard was skipped and the
assertion tested nothing. Fixed by backdating the row instead: the session's
`last_seen_at` is pushed two hours into the past and the check runs with a real
one-minute idle.

The underlying observation is worth keeping: **"0 means no limit" is a fail-open
default on a security deadline.** It is the right ergonomics for an optional
idle timeout, but it means a caller who forgets to configure one silently gets
none. So `Session.Expired` now says so in its doc comment, the responsibility
for supplying a real value is pinned on the server config, and the absolute
deadline deliberately has no such escape. The idle test now also asserts the
*positive* case — `idle=0` still resolves — so the assertion is about idleness
rather than accidentally about expiry.

### What I learned

- SQLite's `ALTER TABLE ... ADD COLUMN` with a `REFERENCES` clause is fine here
  precisely because the column is nullable: SQLite requires an added column with
  a foreign key to default to NULL, which is exactly what DR-25 wanted anyway.
- `PRAGMA foreign_keys(on)` was already in the DSN
  (`store.go:dsnForPath`), with a comment warning that copying the reference
  implementation's DSN verbatim would silently disable it. The cascade test
  passes because of that, and now fails loudly if it is ever lost.

### What was tricky to build

**Token resolution ordering.** `ResolveAPIToken` compares the secret hash
*before* checking `revoked_at` and `expires_at`. The natural order is the
reverse — cheap checks first — and it is wrong: it turns the endpoint into an
oracle for "does this token id exist and is it live", answerable without knowing
the secret. Every failure path also returns the same `ErrNotFound`, for the same
reason.

**`last_used_at` would have been a write per request.** A busy ingest loop
would turn one indexed read into one write, and SQLite writes serialise behind a
single connection — so the credential check would have become the bottleneck of
the ingest path it is supposed to guard. `touchToken` throttles to one write per
minute per token via a `sync.Map` on the `Store`, and a failed write is logged
at debug rather than failing the request.

**Two implementations of one rule.** `VisibleDrops` filters in SQL because a
listing is the one place the number of drops is unbounded; `EffectiveRole`
decides per drop in Go. Two implementations drift, so
`TestVisibleDropsAgreesWithEffectiveRole` asserts they agree across the whole
fixture — five principals against four drops — rather than spot-checking.

### What warrants a second pair of eyes

- The `VisibleDrops` SQL predicate against `auth.EffectiveRole`. The agreement
  test covers the current fixture; a new rule added to one and not the other
  would only be caught if the fixture grows to exercise it.
- `SetMember`'s refusal to touch the owner returns `ErrConflict`. If a future
  "transfer ownership" endpoint appears it must go through a different path,
  not by relaxing this.
- `DropACL` is read on every authorized request: one primary-key lookup plus
  one indexed member scan. That is the deliberate price of DR-24, but it is the
  thing to measure first if request latency ever becomes a question.

### What should be done in the future

- Ownership transfer, which is deliberately absent: today the only ways a drop
  changes hands are a claim on an unowned drop and a database edit.
- `usersByID` builds an `IN (?, ?, …)` list. Fine for a member list; it would
  need chunking if it were ever used for something unbounded.

### Code review instructions

Start with the migration, which carries the reasoning. Then
`pkg/store/tokens.go:ResolveAPIToken` (check ordering) and
`pkg/store/members.go:DropACL` / `VisibleDrops`.

```bash
GOWORK=off go test ./pkg/store/ -count=1 -run 'Account|User|Token|Session|Drop|Member|Claim|Visible|Sweep|AuthFlow'
```

### Technical details

The tables added, and the one column:

```
users(id, issuer, subject, email, name, created_at, last_seen_at, disabled)
      UNIQUE (issuer, subject)
sessions(id = sha256(cookie), user_id, created_at, last_seen_at, expires_at,
         id_token, user_agent, ip)
auth_flows(state, nonce, verifier, return_to, created_at)
api_tokens(id, user_id, name, secret_hash, scopes, created_at, expires_at,
           last_used_at, revoked_at)
drop_members(drop_name, user_id, role, added_at, added_by)
drops.owner_id  -- nullable; NULL on every pre-existing row
```

## Step 4: Phase 2 — authorization, applied everywhere at once

The resolver middleware, `authorize`/`authorizeDrop`/`checkOrigin`, all 26
handler call sites converted, the three auth modes, `GET /v1/me`, the member and
claim endpoints, and the `serve` flag surface. One commit, deliberately: a
half-converted handler table is a system where some endpoints check ownership
and some do not, which is worse than either end state and invisible to any test
that only exercises the happy path.

No OIDC yet. `--auth=token` maps the static token to the root principal, so the
whole existing suite runs on the new code path — which is how this phase proves
it did not break anything before there is anything new to break.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 2 — replace the token check with the principal/role/scope model across the entire HTTP surface.

**Inferred user intent:** (see Step 2)

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 2`

### What I did

- `pkg/server/middleware.go` rewritten: `principalMiddleware`, `resolve`,
  `authorize`, `authorizeDrop`, `denyUnauthenticated`, `checkOrigin`.
- `pkg/server/server.go`: auth modes, `OIDCConfig`, `ExternalURL`, the new
  routes, and the resolver added innermost in the chain.
- `pkg/server/handlers_me.go`, `handlers_members.go`, `cookies.go` — new.
- All 26 call sites in the existing handlers converted.
- `pkg/server/problem.go`: `CodeForbidden`, `CodeCrossOrigin`, `CodeConflict`.
- `pkg/cli/serve.go`: eleven new flags with environment fallbacks, and
  `resolveAuth`, which refuses to start on a misconfiguration that would fail
  open.
- `pkg/server/authz_test.go` — 13 tests, including a 20-row HTTP authorization
  matrix and a 16-route CSRF enumeration.

### Why

Guide §7 and §8.5. The two rules being enforced: rights are the intersection of
membership and credential scope computed per request (DR-24), and a
cookie-authenticated unsafe method must carry a matching `Origin` (DR-21).

### What worked

- **The whole pre-existing suite passed on the first run after the conversion.**
  That is the payoff for making `New` infer `AuthToken` when a token is set: no
  test needed editing, so any breakage would have been a real behaviour change
  rather than a fixture mismatch.
- Putting `checkOrigin` *inside* `authorizeDrop` rather than beside it means
  there is no way to authorize a mutating request without passing through it.
  The enumeration test then fires all sixteen mutating routes with a foreign
  origin and asserts the CSRF code specifically — not merely a 403, which any
  permissions failure would also produce.
- `authorizeDrop(w, r, dropName, role, scope)` reads at the call site almost
  exactly like the `if !s.authenticate(w, r)` it replaced, so the diff over the
  handlers is mechanical and reviewable.

### What didn't work

- `golangci-lint` rejected four `switch` statements for `exhaustive` and two
  named returns. Both are house rules worth keeping — naming `KindAnonymous`
  explicitly rather than letting it fall to `default` is exactly the kind of
  thing that should be deliberate in an authorization type.
- `envOr` already existed in `pkg/cli/root.go`; I added a second one. Removed.
- My first pass at trimming the unused cookie helpers deleted
  `clearSessionCookie` too, which *is* used — by revoking your own session from
  the profile tile. Caught by the build.

### What I learned

**`handleListDrops` had to change behaviour, and the old comment explains why
it could not stay.** It read:

> Listing reveals which drops exist, which is metadata about every drop rather
> than about one — so it always requires the token, even when some individual
> drops are public_read.

That reasoning was correct when there was one global answer. With ownership the
answer is per-caller, so there is no longer anything global to protect: an
anonymous caller now sees exactly the `public_read` drops, which is precisely
what they could already discover by guessing names. The new comment says so and
names the change, because silently inverting an access rule is the kind of thing
that should never be discovered by reading a diff.

**A nonexistent drop must return 401 to an anonymous caller and 404 to a signed-in
one.** Otherwise the endpoint answers "does this drop exist" to the whole
internet. Two matrix rows pin both halves.

### What was tricky to build

**Ordering.** Eight handlers called `authenticate` *before* parsing the drop
name, which was fine when the decision did not depend on the target and is not
fine now. Every one had to be reordered so the name is known first. Mechanical,
but exactly the kind of edit where doing four of eight and moving on leaves a
system that looks converted and is not — which is the argument for landing the
phase as one commit.

**Deciding what `POST /v1/drops/{name}/claim` requires.** It cannot use
`authorizeDrop`: an unowned private drop gives an ordinary user *no* role, so
requiring one would make it claimable only by root — and the whole point is that
the person already using it can adopt it. What bounds it instead is the store's
atomic `UPDATE … WHERE owner_id IS NULL`: the first claim wins, a second gets a
409, and an owned drop can never be taken. That is a case where the safety
property lives in the SQL rather than in the handler, so both say so.

**A drop created with the static token is unowned.** The root principal has no
user id. Attributing its drops to "root" would invent an owner nobody can sign
in as, so `handleCreateDrop` leaves `owner_id` empty and the drop is claimable
like any other legacy one.

### What warrants a second pair of eyes

- `resolve` in `middleware.go`. It is forty lines and every branch is a
  security decision. In particular: bearer beats cookie, an invalid credential
  yields anonymous rather than an error, and the static token comparison comes
  first and is constant-time.
- `checkOrigin` treats an **absent** `Origin` on a cookie-authenticated unsafe
  request as a failure. That is deliberate, and it is the line most likely to be
  "fixed" by someone debugging a client that does not send one.
- The session touch happens on the read path inside `resolveSession`. One
  indexed UPDATE per authenticated request; acceptable now, and the first thing
  to throttle if it ever is not.

### What should be done in the future

- Rate-limit `HEAD /v1/blobs/{digest}` and `GET /v1/users/lookup`. Both are
  documented oracles, both are currently only bounded by authentication.
- `annotateRoles` reads the ACL once per drop in a listing. Fine at current
  scale; a join would be better if a deployment ever has thousands.

### Code review instructions

`pkg/server/middleware.go` first — if you read one file, read that one. Then
`authz_test.go:TestHTTPAuthorizationMatrix` and
`TestCSRFCoversEveryMutatingRoute`.

```bash
GOWORK=off go test ./pkg/server/ -count=1 -run 'Authorization|CSRF|Me|Token|Claim|AuthNone|TokenMode' -v
GOWORK=off golangci-lint run
```

### Technical details

Verified live against a running server in token mode:

```
$ curl -s localhost:7071/v1/me
{"auth_mode":"token","authenticated":false,"kind":"anonymous",
 "scopes":["drops:read"],"signup_enabled":false}

$ curl -s localhost:7071/v1/drops          # anonymous
{"count":1,"drops":[{"name":"lab","public_read":true,"your_role":"reader"}]}
```

`your_role` is what lets the UI grey out an action it knows will 403 rather than
offering it and failing.

## Step 5: Phase 3 — OIDC

`pkg/auth/oidc.go` behind a three-method `Provider` interface, the three sign-in
endpoints, just-in-time provisioning, sessions, sign-out, and the auth sweeper.
Sixteen tests, none of which needs an identity provider running.

The interface is the whole point of the phase. Every failure path in the
callback handler is a security property — a replayed state, a callback with no
flow cookie, a refused exchange, an unverified email, a disabled account — and
not one of them is reachable in a test that needs a live Zitadel. Behind a fake
provider they are each one field assignment away.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue with phase 3 — the OIDC relying party and the sign-in flow.

**Inferred user intent:** (see Step 2)

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 3`

### What I did

- `pkg/auth/oidc.go` — `Claims`, `Provider`, `DiscoverProvider`,
  `DiscoverWithRetry`, and the real implementation over `coreos/go-oidc` and
  `x/oauth2`.
- `pkg/server/handlers_auth.go` — `/v1/auth/login`, `/callback`, `/logout`,
  plus `safeReturnPath` and `clientIP`.
- `pkg/server/cookies.go` — the setters, now that something installs them.
- `pkg/store/{users,sessions}.go` — `GetUserBySubject`, `GetSessionByID`.
- `pkg/server/server.go` — `SetOIDCProvider`, `Config.RedirectURI`, the routes,
  and `sweepAuth`.
- `pkg/cli/serve.go` — discovery with retry at startup.
- `pkg/server/auth_flow_test.go` — 16 tests over a fake provider.

### Why

Guide §8.2. And DR-18: nothing here hard-codes a provider endpoint. The
authorization, token and end-session URLs all come out of the discovery
document, which is what makes swapping Zitadel for Keycloak a configuration
change rather than a code change.

### What worked

- **Three methods was the right size for `Provider`.** `AuthCodeURL`,
  `Exchange`, `EndSessionURL` — the fake is about thirty lines and it records
  the state, nonce and verifier the handler sent, so the tests can assert PKCE
  and the nonce are genuinely in play rather than merely generated.
- Discovery-with-retry at startup rather than a restart policy. The compose
  stack launches datadrop the moment provisioning exits, and Zitadel may still
  be finishing first-boot projections; retrying for a minute and saying so beats
  dying and being restarted by Docker with no explanation.
- Every callback failure redirects to `/ui/?auth_error=<code>` rather than
  rendering a page. Nicer, and it means provider-supplied text is never
  reflected into an HTML response — asserted by a test that sends
  `error_description=%3Cscript%3E`.

### What didn't work

- `go mod tidy` removed `go-oidc` and `x/oauth2` immediately after I added them,
  because nothing imported them yet. Ordinary, but worth knowing before
  concluding the module cache is broken: add the dependency in the same change
  that uses it.
- My first pass at trimming phase 2's not-yet-used cookie helpers took
  `clearSessionCookie` with them, which *is* used. Caught by the build; restored
  here alongside the setters that finally have callers.

### What I learned

**The flow needs a cookie as well as a database row.** My first sketch stored
`state` in `auth_flows` and checked the callback against it. That is not enough:
anyone who observes a callback URL — a proxy log, a referrer header, a shoulder
— could redeem it, because the row does not know which browser it belongs to.
Adding a short-lived `dd_flow` cookie carrying the same state means the callback
must arrive in the browser that started the flow. `TestCallbackRequiresTheFlowCookie`
covers both halves: no cookie, and someone else's cookie.

**A first sign-in and a signup are the same code path.** The only difference on
our side is `prompt=create` on the way out and a `first=1` on the way back. That
is the entire payoff for putting registration at the provider, and it is why
there is no signup handler.

### What was tricky to build

**`safeReturnPath`.** An unvalidated `return` parameter is an open redirect, and
an open redirect on a login endpoint is a phishing primitive: an attacker sends
a victim to our *real* sign-in page and receives them, authenticated, on their
own site. The non-obvious case is `//evil.example`, which starts with `/` and is
protocol-relative — a browser treats it as a host. The check is: must start with
`/`, must not start with `//`, and must parse with no scheme and no host. The
test table includes `/\evil.example` as a deliberate *pass*, because that really
is a path.

**Storing the ID token.** It is the one OIDC artefact we keep, purely as
`id_token_hint` for RP-initiated logout, and it contains PII. It has no useful
JSON tag on `datadrop.Session`, and `handleListSessions` builds its own wire
struct rather than serialising the store type — so the token cannot escape later
by someone adding a tag to it.

**`clientIP` deliberately ignores `X-Forwarded-For`.** Behind an untrusted proxy
that header is attacker-controlled, and a "your sessions" list that confidently
shows a forged address is worse than one showing the proxy's.

### What warrants a second pair of eyes

- `handleAuthCallback` end to end. It is the longest security-relevant function
  in the ticket and the order of its checks matters: state cookie, then flow
  row (single-use), then exchange, then verified-email, then provisioning, then
  disabled, then session.
- `DiscoverProvider` does not use `oidc.InsecureIssuerURLContext`. That is
  deliberate — see the doc comment and guide §13.2 — and it means the compose
  stack must give the browser and the container the same issuer URL, which §13.3
  arranges with a network alias and matching ports.
- `sweepAuth` runs only in oidc mode. Harmless elsewhere, but it means a
  deployment that switches modes without a restart keeps stale rows.

### What should be done in the future

- The idle timeout is enforced but never surfaced: a user whose session lapses
  sees a 401 with no explanation. The SPA should notice and re-run the sign-in
  redirect, which is usually invisible because the provider session is still
  live.
- `DiscoverWithRetry`'s 20×3s is hard-coded. Fine for compose; a flag if anyone
  runs this where the provider takes longer.

### Code review instructions

`pkg/server/handlers_auth.go` first, then `auth_flow_test.go` — the fake
provider at the top of that file is the cheapest way to understand the flow.

```bash
GOWORK=off go test ./pkg/server/ -count=1 -run 'SignIn|Signup|Callback|Logout|Return|Unverified|Disabled|AuthEndpoints' -v
```

### Technical details

New dependencies, both pure Go with small trees:

```
github.com/coreos/go-oidc/v3 v3.20.0
golang.org/x/oauth2 v0.36.0
github.com/go-jose/go-jose/v4 v4.1.4   (indirect, JWKS)
```

PKCE, from `x/oauth2`:

```go
url := cfg.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(nonce))
tok, err := cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
```

Used on a *confidential* client, which is not redundant: RFC 9700 recommends
PKCE for every client because it binds the code to the party that requested it
independently of the client secret.

## Step 6: Phase 4 — the compose stack

`deploy/compose/`: PostgreSQL, Zitadel, Zitadel's login UI, Traefik, a one-shot
provisioning job, and datadrop. `make compose-up` on a clean machine takes about
80 seconds and ends with a working OIDC relying party.

Five things broke on the way, and four of them were mine. The most interesting
one falsified a design decision from the guide.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Mid-turn correction (verbatim):** "us 7070 and 17070 r so, *8080 is overloaded"

**Mid-turn question (verbatim):** "why do we still have localhost:8080/ui in those logs?"

**Assistant interpretation:** Build the local stack; use 7070 and 17070 rather than 8080; and fix the startup line that advertises an unreachable URL.

**Inferred user intent:** (see Step 2). The port change was concrete — another Zitadel stack is already running on this machine, which is also why foreign Traefik labels turned up in ours.

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 4`

### What I did

- `deploy/compose/{docker-compose.yml,.env.example,provision.sh,Dockerfile.datadrop,README.md}`
- `pkg/cli/healthcheck.go` — a probe the distroless image can actually run.
- `pkg/cli/serve.go` — `uiURL` now prefers the external URL.
- `Makefile` — `compose-up`, `compose-down`, `compose-nuke`, `compose-logs`.

### What worked

- `depends_on: {provision: {condition: service_completed_successfully}}` makes
  `up --wait` correct rather than racy: datadrop cannot start before the client
  credentials exist on the volume.
- Provisioning by search rather than by a marker file. The second run found the
  application, regenerated its secret, and carried on.
- The two startup warnings both fired against the real stack, unprompted:
  plaintext HTTP, and a root token alongside OIDC.

### What didn't work

**1. `*.localhost` cannot be reached from inside a container — the guide's fix
was wrong.**

Guide §13.2 says to give the proxy a network alias of `zitadel.localhost` so one
URL means the same thing to the browser and to the container. It does not work,
and the failure is instructive:

```
$ getent hosts zitadel.localhost      # inside the container
10.77.0.2   zitadel.localhost         # DNS says: the proxy

$ curl -v http://zitadel.localhost:17070/debug/healthz
* Host zitadel.localhost:17070 was resolved.
*   Trying [::1]:17070...             # ...but curl goes to loopback
```

RFC 6761 reserves `localhost` **and every subdomain of it** for loopback, and
resolvers honour that *before* consulting `/etc/hosts` — so inside a container
`zitadel.localhost` means that container. Neither the network alias nor an
`extra_hosts` entry can override it; I tried both, and watched curl ignore an
`/etc/hosts` line that was demonstrably present. `getent` asks DNS and reports
the proxy; `curl` does not, and that discrepancy is what made this take three
attempts.

The fix is `.test`, which RFC 6761 also reserves but gives no resolution rule,
so it can be pointed at 127.0.0.1 for the browser and at the proxy inside the
network. Cost: one `/etc/hosts` line, which the README already anticipated as a
fallback and now states as a requirement. The guide's §13.2 needs correcting.

**2. Traefik picked up another project's labels.** The docker provider reads the
whole socket, and this machine already runs an unrelated Zitadel stack — which
is also why 8080 was taken. Symptom: a stream of `EntryPoint doesn't exist`
errors for routers I never wrote, and foreign routers competing for the same
hostnames. Fixed with
`--providers.docker.constraints=Label(`datadrop.stack`,`true`)` and a label on
each of our three routed services.

**3. `up --wait` reported the stack healthy while datadrop crash-looped.**

```
datadrop: store: ping SQLite: unable to open database file (14)
```

Two bugs at once. The volume: Docker initialises a named volume from the image's
directory including its ownership, and `/data` did not exist in the image, so it
arrived owned by root and the distroless `nonroot` user could not write. Fixed
by creating `/data` in the build stage owned by 65532 and copying it with
`--chown`. And the reason nobody noticed: **there was no healthcheck**, because
the distroless image has no shell for one to run in. So `datadrop healthcheck`
now exists — twenty lines, probes `/healthz`, and it earned itself immediately
by catching the next failure.

**4. My own secret hardening locked out the process that reads the secret.**

```
datadrop: read /bootstrap/datadrop-client-secret: permission denied
```

`chmod 600` in a script running as root, read by a container running as 65532.
The symptom is maddening because it comes from a container that has just
successfully migrated its database — so storage plainly works. Fixed with a
`chown 65532` beside the `chmod`.

**5. Zitadel rejects an update that changes nothing.** The second `up` failed
with a 400 from `UpdateLoginPolicy`. Reasonable for an event-sourced store, and
it means a blind write is not idempotent. The step now reads the policy and
skips the write when `allowRegister` is already true — which on Zitadel v4 it
already is by default, so the step is usually a no-op. It stays because a
version where it is not would otherwise fail silently at the moment a stranger
tries to sign up.

### What I learned

- **`getent` and `curl` do not resolve names the same way.** `getent` consults
  NSS; libc's resolver applies RFC 6761 shortcuts first. A name that `getent`
  resolves correctly can still be unreachable.
- Zitadel omits the port from the issuer when the `Host` header omits it. My
  first check used `-H "Host: zitadel.test"` and got `issuer: http://zitadel.test`,
  which looked like a misconfiguration and was not — real clients always send
  the port. Worth knowing before chasing it.
- `ZITADEL_EXTERNALPORT` and friends really are first-init only, as documented.
  Every reset in this step was `down -v`.

### What was tricky to build

The layered failures. Each fix revealed the next one — hostname, then labels,
then volume ownership, then file ownership, then idempotency — and only the
healthcheck turned that from "the stack seems up but nothing works" into a
sequence of specific errors. Adding an honest health probe *before* debugging
would have been faster than adding it in the middle.

### What warrants a second pair of eyes

- The fixed subnet `10.77.0.0/24` and proxy IP `10.77.0.2`. Deterministic, and
  it will collide on a host that already uses that range. Both are in `.env`.
- `devMode: true` on the OIDC application, which is what permits a plain-`http`
  redirect URI. Must go for anything real.
- The provisioning job regenerates the client secret on every run where the
  application already exists. Safe here because the only holder is the datadrop
  container being restarted alongside; it would not be safe if anything else
  held that credential.

### What should be done in the future

- Correct guide §13.2 and §13.3: the alias-plus-`.localhost` scheme does not
  work, and the reason is worth keeping because it is genuinely surprising.
- Mailpit, so `--oidc-require-verified-email` can stay true locally.
- A `compose-smoke` target that drives sign-in headlessly, so the stack's
  health is checkable without a browser.

### Code review instructions

`deploy/compose/docker-compose.yml` top to bottom — the comments carry the
reasoning. Then `provision.sh`. Then:

```bash
make compose-nuke && make compose-up && make compose-up   # twice: idempotency
```

### Technical details

Verified against the running stack, through the published port with a `Host`
header (this machine has no `/etc/hosts` entry):

```
GET /v1/auth/login?intent=signup
302 http://zitadel.test:17070/oauth/v2/authorize
    ?client_id=383368137703161860
    &code_challenge=…&code_challenge_method=S256
    &nonce=…&prompt=create
    &redirect_uri=http%3A%2F%2Fdatadrop.test%3A7070%2Fv1%2Fauth%2Fcallback
    &response_type=code&scope=openid+profile+email&state=…
Set-Cookie: dd_flow=…; Path=/v1/auth/; Max-Age=300; HttpOnly; SameSite=Lax
```

`prompt=create`, S256 PKCE, a nonce, a matching redirect URI, and the flow
cookie scoped to `/v1/auth/`.

## Step 7: Phase 4, continued — the secure-context consequence

Switching the stack to `.test` fixed the resolution problem and quietly created
another, which the server's own startup warning pointed at:

```
WRN session cookies will be sent without the Secure attribute over plaintext
    HTTP, and the browser will not expose crypto.subtle to the upload tile
    external_url=http://datadrop.test:7070
```

That second clause is the one that matters. Browsers treat only `localhost`,
`127.0.0.1`, `::1` and `*.localhost` as *potentially trustworthy* over plain
HTTP. `datadrop.test` is none of those, so `crypto.subtle` is undefined — and
the upload tile's whole reason for hashing files in the browser is to let the
server skip bytes it already holds (DR-30). A `.test` address would have been a
perfectly good URL attached to a silently degraded uploader.

### What I did

Realised that **only the issuer has to resolve identically from both sides**.
Nothing inside the network ever calls datadrop by its public name; the browser
is its only caller. So datadrop moved to plain `http://localhost:7070` and only
Zitadel keeps a `.test` name.

The result is better on three counts: the workbench is a secure context, so the
uploader works locally; the `/etc/hosts` line is now needed only for the
identity provider; and the plaintext warning stopped firing, which is the
`PotentiallyTrustworthy` check confirming the improvement rather than me
asserting it.

I also added redirect-URI reconciliation to the provisioning script. Moving the
address exposed the gap: the application had `datadrop.test` registered, and a
redirect URI must match character for character or sign-in fails at the provider
with an error page that mentions nothing about datadrop. The script now compares
and updates — guarded, because Zitadel still rejects a no-op update with a 400.

### What worked

Following the flow all the way into Zitadel without a browser:

```
$ curl -so /dev/null -w '%{redirect_url}' 'http://localhost:7070/v1/auth/login?intent=signup'
http://zitadel.test:17070/oauth/v2/authorize?client_id=…&prompt=create&…

$ curl -so /dev/null -w '%{http_code} %{redirect_url}' --resolve zitadel.test:17070:127.0.0.1 "$L"
302 http://zitadel.test:17070/ui/v2/login/login?authRequest=V2_383369312510935044
```

Zitadel issuing an `authRequest` rather than an error means it accepted both the
client id and the redirect URI. `--resolve` is what makes this checkable on a
machine with no `/etc/hosts` entry.

### What I learned

**A warning I wrote in phase 2 caught a regression I introduced in phase 4.**
`PotentiallyTrustworthy` exists because the Secure cookie attribute and
`crypto.subtle` are governed by the same browser rule, and putting them in one
function meant one hostname change surfaced both consequences at once. Worth
remembering when tempted to inline a two-line predicate.

### What warrants a second pair of eyes

- datadrop and Zitadel now sit on different hostname schemes, which reads as an
  inconsistency until you know why. `.env.example` explains it where someone
  changing the address will actually look.
- Redirect-URI reconciliation regenerates the client secret on every re-run of
  the provisioning job. Fine while the datadrop container is the only holder.

### Code review instructions

```bash
make compose-up
curl -s http://localhost:7070/v1/me | jq '{auth_mode, provider}'
```

## Step 8: Phase 5 — the account tiles

Four tiles, four presentation types, three atoms, two hardwired workspaces, one
signed-out gate. The interesting part was not writing them; it was what looking
at them in a browser showed.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Build the frontend half — sign-in, profile, tokens and upload tiles in fixed workspaces, and retire the read-only invariant narrowly.

**Inferred user intent:** (see Step 2)

**Commit (code):** see `git log` for `feat(DATADROP-5): phase 5`

### What I did

- `ui/src/api/client.ts` — `credentials: "same-origin"`, six account endpoints,
  and both stale security comments rewritten.
- `ui/src/pbui/{types,verbs}.ts` — `user`, `token`, `member`, `upload` and nine
  new verbs.
- `ui/src/pbui/descriptors/{user,token,member,upload}.ts`.
- `ui/src/components/atoms/{UserChip,TokenChip,RoleBadge}`.
- `ui/src/apps/{SignInApp,ProfileApp,TokensApp,UploadApp}` — upload is a stub
  until phase 6.
- `ui/src/store/spaces.ts` — `pinnedSpaces`, `mergePinned`, fixed ids.
- `ui/src/store/persist.ts` — pinned spaces restored from code, not storage.
- `ui/src/components/pages/Workbench` — the signed-out gate and the `first=1`
  landing.
- `ui/test/api-surface.test.ts` and four new descriptor tests; 152 tests total.

### What worked

- **The layer test passed unchanged.** Four new presentation types, four
  descriptors, three atoms and four apps, and not one edge needed adding to the
  graph — because descriptors hold no components and apps may already reach
  everything below them. That is DATADROP-4's boundary paying a dividend a
  ticket later.
- The verbs-as-data seam held again. `createToken` carries a name and scopes,
  the trace renders it, and the secret is in neither.
- The tokens tile's disabled mint form is the "show the rule, do not hide it"
  principle working in a real screen: a token-authenticated caller sees the
  whole form greyed with *"a token may not mint another token — otherwise
  revoking a leaked credential would leave whatever it created still working"*.

### What didn't work

**Three things only a browser showed**, all found by rendering the account
workspace against a running server:

1. **"you are a admin".** In the `RoleBadge` tooltip, which a screen reader
   reads aloud.
2. **The identity-provider prose appeared in token mode.** "Your name, email,
   password and two-factor settings live in the identity provider" — describing
   a system that is not there. Gated on `me.provider`.
3. **A "Signed in on" heading with nothing under it** for the root principal,
   which has no sessions. Gated on `me.kind === "session"`.

None of these would have failed a test, and all three are the kind of thing that
makes an interface feel unfinished.

**One test needed changing rather than fixing.** `mergePinned` prepends the
hardwired spaces, so "a currentSpaceId naming a missing space falls back to the
first" now falls back to `welcome`. The property under test is the fallback, not
the identity of the space — so the assertion changed and a comment says why,
rather than the behaviour being bent to keep an old expectation.

**`defaultSpaces()` briefly made everyone land in `welcome`,** because the
pinned spaces are prepended and `currentSpaceId` was `spaces[0]`. Now it names
`build` explicitly, and the signed-out gate is the only thing that forces
`welcome`.

**`make ui` was broken and had been for some time.** `bun --cwd ui install`
makes bun look for a *script* named `install`:

```
error: Script not found "install"
```

The correct form is `bun install --cwd ui`. Nobody had noticed because the built
assets are committed, so the target is only run when the frontend changes.

### What I learned

- `api.endpoints[name].useMutation` is the cheapest honest way to tell an RTK
  Query mutation from a query without reaching into internals. The
  `api-surface` test uses it to pin the exact mutating set.
- `fetchBaseQuery`'s `credentials` option is swallowed by a closure and is not
  reachable from the built `api` object. An unreachable security-relevant
  setting is exactly the kind that gets changed without anyone noticing, so that
  assertion reads the source file — the same tactic `layers.test.ts` uses.

### What was tricky to build

**The asymmetry in `mergePinned`.** Pinned spaces are taken wholesale from code
so that a tile added in a release actually appears; everything else comes from
storage so a user's arrangement survives. The consequence — tiles a user adds to
a pinned space are lost on reload — is the intended meaning of "hardwired" and
would read as a bug without the ⌾ marker and the tooltip on the strip.

**Deciding where the signed-out gate goes.** One gate at the shell, not a check
per tile (DR-31). A per-tile check is a promise to remember it on every future
tile, and that promise is always broken. It is not a security boundary either
way — the server denies the data regardless — but it is the difference between a
sign-in screen and twelve tiles all saying "401".

### What warrants a second pair of eyes

- `api-surface.test.ts` is a change-detector by design. If it fails, the right
  response is to read the new mutation and decide, not to update the literal.
- The tokens tile holds the minted secret in component state. That is the only
  place it exists in the browser, and the panel is dismissed irreversibly. Worth
  checking nothing else ever reads `minted`.
- `SignInApp` renders provider error codes through a lookup table. A code with
  no entry falls back to generic text; provider-supplied text is never rendered.

### What should be done in the future

- The upload tile is a stub. Phase 6.
- Membership editing has descriptors and verbs but no tile: the profile tile
  lists drops without a member editor. Phase 7.
- An expired session shows a 401 with no explanation; the SPA should notice and
  re-run the sign-in redirect, which is usually invisible.

### Code review instructions

`ui/src/api/client.ts` first — the two rewritten comments are the argument for
everything else. Then `store/spaces.ts` and `persist.ts` for DR-29, and
`pages/Workbench` for the gate.

```bash
cd ui && bun run typecheck && bun test
```

### Technical details

Verified in a browser against a live server, in both modes:

| | oidc (compose) | token (local) |
|---|---|---|
| workspace strip | hidden | shown |
| forced workspace | `welcome` | none |
| sign-in tile | sign-in + create-account links | token field |
| profile tile | user, drops, sessions | "root principal — no user record" |
| tokens tile | mint form live | mint form disabled, with the reason |
