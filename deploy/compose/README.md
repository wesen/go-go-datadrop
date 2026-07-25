# The local stack

datadrop with a self-hosted Zitadel, so that signup, sessions and API tokens can
be exercised end to end.

```bash
make compose-up            # from the repository root
```

Then open **http://datadrop.test:7070/ui/**.

| | |
|---|---|
| Workbench | http://datadrop.test:7070/ui/ |
| datadrop API | http://datadrop.test:7070/v1/ |
| Zitadel console | http://zitadel.test:17070/ |
| Zitadel admin | `zitadel-admin@zitadel.zitadel.test` / `Password1!` |

First boot takes thirty to ninety seconds while Zitadel initialises its event
store. `--wait` covers it.

## One manual step

Add to `/etc/hosts`:

```
127.0.0.1 zitadel.test datadrop.test
```

Check it:

```bash
curl -sS http://zitadel.test:17070/debug/healthz
```

**Why not `*.localhost`, which browsers resolve for free?** Because RFC 6761
reserves `localhost` and every subdomain of it for loopback, and resolvers
honour that *before* reading `/etc/hosts`. Inside a container
`zitadel.localhost` therefore means that container, and neither a docker
network alias nor an `extra_hosts` entry can override it — `curl` goes straight
to `::1`, then `127.0.0.1`, with the entry sitting in `/etc/hosts` unread.

`.test` is reserved too, but carries no resolution rule, so it can be pointed at
127.0.0.1 for you and at the proxy inside the network. One line of setup buys a
name that means the same thing in both places, which is what an OIDC issuer
requires.

## The two other things that go wrong

**`ZITADEL_FIRSTINSTANCE_*` applies only on first init.** Change the domain, the
ports or the machine-user names and restart, and nothing happens — the instance
already exists. The reset destroys the database:

```bash
make compose-nuke
```

**A stale bootstrap volume.** `docker compose down` without `-v` keeps the
volume holding the machine tokens while discarding the database that issued
them. The symptom is `provision` exiting with "the machine PAT was rejected".
Same fix: `make compose-nuke`.

## What is in it

| Service | Why |
|---|---|
| `postgres` | Zitadel's event store. datadrop keeps its own SQLite file. |
| `zitadel-api` | The OIDC provider, the APIs, the console. |
| `zitadel-login` | The login and registration UI — a separate Next.js service since Login v2. |
| `proxy` | Traefik. Puts each service on one hostname and one port, which the OIDC issuer identity requires. |
| `provision` | One-shot: enables self-registration, creates the project and OIDC application, writes the client credentials to a shared volume. Exits. |
| `datadrop` | The application. Waits for `provision` to complete. |

## Using the CLI against it

```bash
export DATADROP_URL=http://datadrop.test:7070
export DATADROP_TOKEN=local-root-token      # the root break-glass from .env

datadrop list
```

For a *user's* credential, sign in at the workbench, open the **account**
workspace, and mint one in the tokens tile. It looks like `ddp_…` and works with
the CLI unchanged.

## Not for production

- Plain HTTP, so session cookies carry no `Secure` attribute.
- `--oidc-require-verified-email=false`, because this stack has no SMTP service
  and a self-registered user could otherwise never verify. The server's own
  default is `true`.
- `devMode: true` on the OIDC application, which is what permits a plain-`http`
  redirect URI.
- Default passwords throughout `.env.example`.

See design guide §13 for what changes for a real deployment.
