-- Accounts: users, sessions, API tokens, and per-drop membership.
--
-- See ttmp/2026/07/25/DATADROP-5--*/design/01-*.md §11 for the rationale. The
-- load-bearing points:
--
--   * users are keyed on (issuer, subject), never on email. `sub` is the only
--     stable identifier an OIDC provider promises; email addresses change and
--     are reused. `email` and `name` here are a refreshed-at-sign-in cache and
--     are never authoritative. Any query with `WHERE email` is a bug.
--   * we mint our own user id rather than using `sub` as the primary key. `sub`
--     is an opaque provider string of unbounded shape, and ours appears in
--     foreign keys, audit rows and log lines; a local identifier means changing
--     identity provider does not rewrite half the database.
--   * sessions store the SHA-256 of the cookie value, not the value. A dump of
--     this file must not hand over live sessions.
--   * NO refresh token is stored. datadrop calls no API on the user's behalf,
--     so the only thing a refresh token could do here is extend a lifetime we
--     already control directly (DR-20). The one OIDC artefact kept is the ID
--     token, needed as `id_token_hint` for RP-initiated logout, and it is
--     deleted with the session row.
--   * drops.owner_id is NULLable and existing rows stay NULL. Guessing an owner
--     at migration time is a silent grant of access to data, performed when
--     nobody is watching (DR-25). Unowned is not unprotected: only the root
--     principal, or public_read, opens such a drop until it is claimed.

CREATE TABLE users (
    id           TEXT PRIMARY KEY,          -- "usr_" + 26 base32 chars
    issuer       TEXT NOT NULL,             -- the OIDC issuer URL
    subject      TEXT NOT NULL,             -- the OIDC `sub`
    email        TEXT,                      -- cache, not authoritative
    name         TEXT,                      -- cache, not authoritative
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    disabled     INTEGER NOT NULL DEFAULT 0,
    -- Not `subject` alone: `sub` is unique only within an issuer. Including it
    -- means pointing a deployment at a second provider produces distinct users
    -- rather than a silent account merge.
    UNIQUE (issuer, subject)
);

CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,          -- hex sha256 of the cookie value
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    -- Absolute, and never extended by activity. Extending on use is how a
    -- session becomes immortal, and an immortal session is a credential with
    -- no expiry wearing a different hat. Idle timeout is enforced against
    -- last_seen_at at resolve time.
    expires_at   TEXT NOT NULL,
    id_token     TEXT,                      -- for end_session only; contains PII
    user_agent   TEXT,
    ip           TEXT
);
CREATE INDEX idx_sessions_user   ON sessions (user_id);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);

-- A sign-in in progress: the state, nonce and PKCE verifier for one redirect.
--
-- In the database rather than in memory so that a restart mid-flow produces a
-- clean "please try again" rather than a mystery, and so that a second process
-- is not a rewrite. Deleted on use — the state must be single-use — and swept
-- after five minutes.
CREATE TABLE auth_flows (
    state      TEXT PRIMARY KEY,
    nonce      TEXT NOT NULL,
    verifier   TEXT NOT NULL,
    return_to  TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_auth_flows_created ON auth_flows (created_at);

CREATE TABLE api_tokens (
    id           TEXT PRIMARY KEY,          -- the public half; safe to log
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    -- SHA-256, not a slow KDF. The secret is 160 bits from crypto/rand, so it
    -- is not brute-forceable at any cost and a KDF would only add latency to
    -- every request. The rule for passwords is the opposite; the difference is
    -- entropy (DR-23).
    secret_hash  TEXT NOT NULL,
    scopes       TEXT NOT NULL,             -- space-separated
    created_at   TEXT NOT NULL,
    expires_at   TEXT,                      -- NULL = no expiry
    last_used_at TEXT,
    -- A soft delete: the audit trail must still be able to resolve a revoked
    -- token's id to the person who held it.
    revoked_at   TEXT
);
CREATE INDEX idx_api_tokens_user ON api_tokens (user_id);

ALTER TABLE drops ADD COLUMN owner_id TEXT REFERENCES users (id);
CREATE INDEX idx_drops_owner ON drops (owner_id);

CREATE TABLE drop_members (
    drop_name TEXT NOT NULL REFERENCES drops (name) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role      TEXT NOT NULL,               -- 'reader' | 'writer' | 'admin'
    added_at  TEXT NOT NULL,
    added_by  TEXT,                        -- user id, for the audit trail
    PRIMARY KEY (drop_name, user_id)
);
-- "Which drops may I see" is the query behind every listing the UI does.
-- Without this index it is a full scan on every page load.
CREATE INDEX idx_drop_members_user ON drop_members (user_id);
