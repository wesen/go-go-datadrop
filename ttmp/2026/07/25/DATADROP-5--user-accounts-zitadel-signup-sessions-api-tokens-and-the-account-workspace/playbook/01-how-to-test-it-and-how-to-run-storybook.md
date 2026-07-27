---
Title: How to test it, and how to run Storybook
Ticket: DATADROP-5
Status: review
Topics:
    - auth
    - oidc
    - zitadel
    - docker-compose
    - accounts
    - upload
    - tokens
    - frontend
    - storybook
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://Makefile
      Note: every target below; ui-test and storybook were fixed here after bun silently no-opped on the space-separated --cwd form
    - Path: repo://deploy/compose/README.md
      Note: the stack, the one /etc/hosts line, and the two failure modes that need compose-nuke
    - Path: repo://ui/.storybook/main.ts
      Note: the story glob and the viteFinal override that stops Storybook writing over the embedded bundle
    - Path: repo://ui/test/api-surface.test.ts
      Note: the change-detector over the mutating endpoints; it is supposed to fail when the surface grows
    - Path: repo://pkg/cli/whoami.go
      Note: datadrop whoami — the first thing to run when a credential does not work
ExternalSources: []
Summary: "Every way to exercise DATADROP-5, from `go test` to a browser signup, plus how to run Storybook and what is actually in it."
LastUpdated: 2026-07-25T15:05:00.000000000-04:00
WhatFor: "Verifying the user-accounts work by hand, and developing UI components against stories."
WhenToUse: "After a checkout, before a review, or when a credential is being refused and it is not clear why."
---

# How to test it, and how to run Storybook

## Purpose

DATADROP-5 spans four layers that fail in different ways: Go authorization
logic, a TypeScript state machine, a compose stack with an identity provider in
it, and a browser flow that leaves the application entirely and comes back. Each
has its own check, and they are not substitutes for each other. This playbook
lists all of them in the order of increasing setup cost, so that the cheapest
check that could have caught a given defect is the one that runs first.

## Environment Assumptions

- `go` (toolchain 1.25.5) with **`GOWORK=off`** on every invocation. The parent
  `go.work` requires Go 1.26.1; without the override every Go command fails
  before it starts.
- `bun` 1.2.13 for anything under `ui/`.
- `docker` with the compose plugin, for the stack.
- Python 3 for the sharing matrix. Standard library only.

## Commands

### 1. The offline suites — no stack, no browser, seconds

```bash
GOWORK=off go test ./...      # or: make test
make ui-test                  # typecheck, then 166 bun tests
make lint                     # golangci-lint, GOWORK=off
```

`make ui-test` runs `tsc -b --noEmit` and then `bun test`. Both must be present:
the bun suite does not typecheck, and `tsc` does not run anything.

Two of the UI tests are change detectors and are *meant* to fail when the
surface they pin changes:

- `ui/test/api-surface.test.ts` pins the exact set of mutating endpoints. Adding
  a mutation fails it. Read the diff, decide the mutation belongs, update the
  literal.
- the layer test rejects an `api` import from `components/molecules`. The fix is
  to move the component beside its app, not to widen the rule.

### 2. The stack

```bash
make compose-up      # 30-90s on first boot while Zitadel initialises
```

**One manual step, and nothing signs in without it.** The OIDC issuer is
`http://zitadel.test:17070`, and the *browser* has to resolve that name to
reach the login page:

```bash
echo "127.0.0.1 zitadel.test" | sudo tee -a /etc/hosts
curl -sS http://zitadel.test:17070/debug/healthz
```

Without the line the stack still comes up healthy — nothing inside it needs host
DNS — and the sign-in button leads to a browser error. The symptom on the server
side, if a *host-run* datadrop is pointed at the same issuer, is a startup
failure that names the cause exactly:

```
datadrop: OIDC discovery at http://zitadel.test:17070 failed; ...
  dial tcp: lookup zitadel.test: no such host
```

That is DR-26 working: a misconfigured identity provider refuses to start rather
than starting with authentication quietly disabled.

Why not `*.localhost`, which needs no setup at all: RFC 6761 reserves `localhost`
and every subdomain of it for loopback, and resolvers honour that *before*
reading `/etc/hosts` — so inside a container `zitadel.localhost` means that
container, and neither a network alias nor `extra_hosts` can override it. Full
account in `deploy/compose/README.md`.

### 3. The credential, from a terminal

```bash
curl -sS http://localhost:7070/v1/me | jq
curl -sS -H "Authorization: Bearer local-root-token" http://localhost:7070/v1/me | jq

GOWORK=off go run ./cmd/datadrop whoami \
    --addr http://localhost:7070 --token local-root-token
```

`whoami` exists because a 403 cannot distinguish "wrong token" from "wrong
user" from "missing scope" from "not a member". It answers all four, and it
prints the token *id* — the public half, the one an audit row carries — never
the secret.

Anonymous against this stack answers `authenticated: false`, `kind: anonymous`,
`scopes: ["drops:read"]`. That last field is not a mistake: a scope limits a
credential, it never grants, and anonymous carries `drops:read` so that
`public_read` drops stay readable with no credential at all.

### 4. The authorization matrix, end to end

`ttmp/.../scripts/sharing-matrix.py` drives two real users through nine rows
with their own `ddp_` tokens. The setup is in the script's docstring; it runs a
throwaway datadrop **inside the compose network**, which is what lets it work
without the `/etc/hosts` line and without a browser.

The row the script exists for is the last one. Bob's membership is removed, and
the *same* bearer string he was already holding stops working — nothing was done
to the token. An implementation that resolved rights once and cached them on the
token would pass all eight rows above it and fail only that one (DR-24).

### 5. The browser, which is the only thing that checks the rest

Open **http://localhost:7070/ui/**.

| What to exercise | Where | What proves it |
|---|---|---|
| Signup | `welcome` workspace, signin tile, **Create account** | Zitadel's registration form appears; you return signed in |
| Sign-in | same tile | the shell stops showing the signed-out gate |
| Profile | `account` workspace | your email and the drops you belong to |
| Tokens | `account` workspace | the secret is shown **once**; reload and it is gone forever |
| Upload | `account` workspace | drop CSVs, *or* the **Choose CSV files…** button; commit; the dataset opens as a typed table |
| Sharing | profile tile, member list | add by email, change role, remove |
| Sign-out | shell | returns to the gate; the cookie is gone |

Then take the token you minted and use it from the CLI unchanged — that is the
whole point of two credential kinds resolving to one `Principal`:

```bash
export DATADROP_URL=http://localhost:7070
export DATADROP_TOKEN=ddp_...
datadrop list
```

Two things worth deliberately breaking:

- **Interrupt an upload** (reload mid-batch). Reopening the same dataset resumes
  against the draft rather than restarting, which is what `GET
  .../datasets/{d}/drafts` exists for. Without it the version number is lost,
  the API will not admit the draft exists, and its blob references keep garbage
  collection from reclaiming the bytes.
- **Upload a file over 64 MiB.** The browser stops hashing above that limit
  (Web Crypto has no streaming digest), so the mount fast path is skipped and
  the server hashes while writing. The upload must still succeed.

## Storybook

```bash
make storybook          # http://localhost:6006
make build-storybook    # static build into ui/storybook-static
```

Both targets are new; before today Storybook had no `make` entry point at all.

**What is in it is thin, and knowing that is part of using it.** Five stories in
two files:

- `Design System/Foundation/Tokens` — the token sheet, rendered rather than
  tabulated, because a table of hex values cannot show that `--pbui-faint` is
  still legible at 8.5px.
- `Design System/PBUI/Playground` — three stories, including `AcceptFlow`, a
  play function that drives the accept protocol end to end against fixtures.

The four tiles this ticket added — signin, profile, tokens, upload — have **no
stories**. That is a gap, not a decision, and it is the direct reason three
defects in them were found only by opening a browser: identity-provider prose
shown in token mode, an empty "Signed in on" heading, and a tooltip reading "you
are a admin". All three are states a story could have pinned.

`ui/.storybook/main.ts` overrides `base` and `outDir` back to their defaults.
Without that override Storybook inherits `vite.config.ts`, whose `outDir` points
into the Go tree, and a Storybook build overwrites the embedded UI bundle.

## Exit Criteria

- `GOWORK=off go test ./...` — all packages ok.
- `make ui-test` — typecheck clean, 166 tests pass.
- `make lint` — clean.
- `sharing-matrix.py` — nine rows `ok`, exits 0.
- A browser can sign up, mint a token, upload a CSV, and share a drop; the
  minted token then works from the CLI unchanged.

## Notes

**`bun --cwd ui run <script>` does not run the script.** It prints bun's usage
page, lists the available scripts, and **exits 0**. A make target written that
way passes without having done anything. The working form uses an equals sign:
`bun run --cwd=ui typecheck`. `bun install --cwd ui` and `bun test --cwd ui`
both accept the space-separated form, which is what made this hard to spot —
`make ui-test` appeared to pass while only ever running the second of its two
commands. Verified on bun 1.2.13; the Makefile now uses `--cwd=` throughout and
carries the explanation.

**The stack fails in two ways that look like bugs and are not.**
`ZITADEL_FIRSTINSTANCE_*` applies only on first init, so changing a domain or a
port and restarting does nothing; and `docker compose down` without `-v` keeps
the volume holding the machine tokens while discarding the database that issued
them, which surfaces as `provision` reporting a rejected machine PAT. Both are
fixed by `make compose-nuke`, which destroys the database on purpose.

**This stack is not a security model.** Plain HTTP, so session cookies carry no
`Secure` attribute; `--oidc-require-verified-email=false`, because there is no
SMTP service and a self-registered user could otherwise never verify (the
server's own default is `true`); `devMode: true` on the OIDC application;
default passwords throughout `.env.example`.
