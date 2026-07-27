-- Initial schema for the go-go-datadrop v0.1 MVP.
--
-- See ttmp/2026/07/24/DATADROP-1--*/design/02-intern-implementation-guide.md §8
-- for the rationale behind every column, in particular:
--
--   * why `events` carries a `stream` column that the ticket's draft schema
--     omitted (guide §16.1);
--   * why `stream_heads` exists instead of computing MAX(seq)+1 (guide §6.3);
--   * why timestamps are RFC3339 TEXT rather than integer epochs (guide §8.4);
--   * why `audit_log.drop_name` is deliberately not a foreign key (guide §8.2).

CREATE TABLE drops (
    name        TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    retention   TEXT,
    public_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
    id          TEXT PRIMARY KEY,
    drop_name   TEXT NOT NULL REFERENCES drops (name) ON DELETE CASCADE,
    stream      TEXT NOT NULL DEFAULT 'events',
    seq         INTEGER NOT NULL,
    source      TEXT,
    type        TEXT,
    subject     TEXT,
    time        TEXT NOT NULL,
    received_at TEXT NOT NULL,
    data        TEXT NOT NULL,
    meta        TEXT,
    UNIQUE (drop_name, stream, seq)
);

CREATE INDEX idx_events_drop_stream_time ON events (drop_name, stream, time);
CREATE INDEX idx_events_drop_stream_recv ON events (drop_name, stream, received_at);

-- O(1) per-(drop, stream) sequence allocator. Reserved inside the same
-- transaction as the event insert.
CREATE TABLE stream_heads (
    drop_name TEXT NOT NULL REFERENCES drops (name) ON DELETE CASCADE,
    stream    TEXT NOT NULL,
    sequence  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (drop_name, stream)
);

CREATE TABLE schemas (
    drop_name  TEXT NOT NULL REFERENCES drops (name) ON DELETE CASCADE,
    stream     TEXT NOT NULL,
    version    INTEGER NOT NULL,
    spec       TEXT NOT NULL,
    mode       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (drop_name, stream, version)
);

-- Not a foreign key on drop_name: the audit trail must outlive the drop.
CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    actor     TEXT,
    action    TEXT NOT NULL,
    drop_name TEXT,
    detail    TEXT
);

CREATE INDEX idx_audit_ts ON audit_log (ts);
