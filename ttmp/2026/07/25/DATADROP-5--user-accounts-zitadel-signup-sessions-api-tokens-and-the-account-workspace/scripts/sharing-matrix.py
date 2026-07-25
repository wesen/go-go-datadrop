#!/usr/bin/env python3
"""The authorization matrix, checked against a running server with two real users.

This is the end-to-end counterpart to pkg/server's table tests. It exists
because one property of DR-24 cannot be observed from inside a unit test
without asserting on an implementation detail: that revoking a membership
narrows a token that was minted before the revocation and never touched
afterwards. Here it is observed the only way that proves it — by replaying the
same bearer string and watching it stop working.

The server it talks to must be in **oidc** mode: `--auth token` accepts only the
static root token and answers 401 to every `ddp_` credential, which is what the
whole matrix is made of. OIDC mode in turn needs the issuer to resolve, so the
throwaway server runs inside the compose network rather than on the host — that
way the check needs no `/etc/hosts` entry and no browser:

    D=/tmp/dd5-matrix && mkdir -p $D && chmod 777 $D
    docker compose cp datadrop:/bootstrap/datadrop-client-id     $D/client-id
    docker compose cp datadrop:/bootstrap/datadrop-client-secret $D/client-secret

    # --user $(id -u): so the host can write the same SQLite file the server
    # reads. Without it the server creates it as uid 65532 and this script
    # fails with "attempt to write a readonly database".
    docker run -d --rm --name dd-matrix --user $(id -u):$(id -g) \
        --network datadrop --add-host zitadel.test:10.77.0.2 \
        -p 127.0.0.1:7075:7075 -v $D:/data datadrop-datadrop \
        serve --db /data/dd.db --blobs /data/blobs --addr 0.0.0.0:7075 \
        --auth oidc --oidc-issuer http://zitadel.test:17070 \
        --oidc-client-id-file /data/client-id \
        --oidc-client-secret-file /data/client-secret \
        --oidc-require-verified-email=false \
        --external-url http://127.0.0.1:7075 --token tok

    DATADROP_BASE=http://127.0.0.1:7075 DATADROP_DB=$D/dd.db \
        DATADROP_ROOT_TOKEN=tok python3 sharing-matrix.py
    docker rm -f dd-matrix

The two users are inserted directly, which is what a sign-in would have done;
skipping the browser is what keeps the check runnable from a terminal. The root
token creates the drop and is never used again — every request in the matrix
below carries a user's own `ddp_` token, so nothing being asserted depends on
the root path.

Last run: all nine rows as expected, 2026-07-25.
"""

import hashlib
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("DATADROP_BASE", "http://127.0.0.1:7075")
DB = os.environ.get("DATADROP_DB", "/tmp/dd5c/dd.db")
ROOT = os.environ.get("DATADROP_ROOT_TOKEN", "tok")


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, (json.loads(raw) if raw else None)


db = sqlite3.connect(DB)

# Two users, provisioned the way a sign-in would provision them.
for uid, sub, email in [
    ("usr_ada", "sub-ada", "ada@example.org"),
    ("usr_bob", "sub-bob", "bob@example.org"),
]:
    db.execute(
        "INSERT OR IGNORE INTO users"
        "(id,issuer,subject,email,name,created_at,last_seen_at,disabled)"
        " VALUES(?,?,?,?,?,'2026-07-25T00:00:00.000Z','2026-07-25T00:00:00.000Z',0)",
        (uid, "https://idp.example/", sub, email, email.split("@")[0]),
    )
db.commit()

call("POST", "/v1/drops", ROOT, {"name": "shared"})
db.execute("UPDATE drops SET owner_id='usr_ada' WHERE name='shared'")
db.commit()

ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"


def mint(user, scopes):
    """Mint a token the way POST /v1/me/tokens does: store only the SHA-256."""

    def b32(n):
        return "".join(ALPHABET[b >> 3] for b in os.urandom(n))

    tid, secret = b32(13), b32(32)
    db.execute(
        "INSERT INTO api_tokens(id,user_id,name,secret_hash,scopes,created_at)"
        " VALUES(?,?,?,?,?,'2026-07-25T00:00:00.000Z')",
        (tid, user, "t", hashlib.sha256(secret.encode()).hexdigest(), scopes),
    )
    db.commit()
    return f"ddp_{tid}_{secret}"


# Both tokens carry every scope, so nothing below is explained by a missing
# scope. What changes across the matrix is membership alone.
ada = mint("usr_ada", "drops:read drops:write admin")
bob = mint("usr_bob", "drops:read drops:write admin")

checks = [
    ("bob reads ada's drop", call("GET", "/v1/drops/shared", bob)[0], 403),
    ("ada adds bob as reader",
     call("PUT", "/v1/drops/shared/members/usr_bob", ada, {"role": "reader"})[0], 204),
    ("bob reads it now", call("GET", "/v1/drops/shared", bob)[0], 200),
    ("bob writes", call("POST", "/v1/drops/shared/events", bob, {"t": 1})[0], 403),
    ("ada promotes him to writer",
     call("PUT", "/v1/drops/shared/members/usr_bob", ada, {"role": "writer"})[0], 204),
    ("bob writes now", call("POST", "/v1/drops/shared/events", bob, {"t": 1})[0], 201),
    ("bob tries to demote the owner",
     call("PUT", "/v1/drops/shared/members/usr_ada", bob, {"role": "reader"})[0], 403),
    ("ada removes bob", call("DELETE", "/v1/drops/shared/members/usr_bob", ada)[0], 204),
    # DR-24, and the row this script exists for: nothing was done to bob's
    # token, and it has already lost the drop. An implementation that resolved
    # rights once and cached them on the token would pass every row above and
    # fail this one.
    ("bob's SAME token writes", call("POST", "/v1/drops/shared/events", bob, {"t": 2})[0], 403),
]

ok = True
for label, got, want in checks:
    mark = "ok " if got == want else "FAIL"
    if got != want:
        ok = False
    print(f"{mark}  {label:<32} {got} (want {want})")

status, body = call("GET", "/v1/users/lookup?email=bob@example.org", ada)
print(f"\nlookup by email -> {status} {body}")
print("\nALL AS EXPECTED" if ok else "\nSOMETHING IS WRONG")
sys.exit(0 if ok else 1)
