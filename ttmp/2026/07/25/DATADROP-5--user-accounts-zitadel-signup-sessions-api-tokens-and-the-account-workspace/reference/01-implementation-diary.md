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
