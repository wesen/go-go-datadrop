-- Datasets: large, finite, immutable bodies of data with a manifest attached.
--
-- See ttmp/2026/07/24/DATADROP-2--*/design/01-intern-implementation-guide.md §7
-- for the rationale. The load-bearing points:
--
--   * `state` is the commit boundary. Every read path filters on
--     state = 'committed'; a draft must never be observable, because serving a
--     half-uploaded dataset produces silently wrong analyses.
--   * blobs are keyed by content digest, so identical bytes are stored once no
--     matter how many versions reference them.
--   * title/license/row_count are extracted from the manifest into columns so
--     that listing does not have to parse every manifest. The manifest itself
--     is stored verbatim, so nothing a producer writes is lost.

-- Content-addressed bytes. One row per distinct digest.
CREATE TABLE blobs (
    digest     TEXT PRIMARY KEY,        -- "sha256:<64 lowercase hex>"
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

-- A stable name within a drop. Holds no content of its own.
--
-- next_version is a monotonic allocator, exactly like stream_heads.sequence for
-- events. It must NOT be derived from MAX(version) over dataset_versions:
-- deleting a version would then let the next open reuse its number, and a
-- citation to "version 3" would silently start resolving to different content.
CREATE TABLE datasets (
    drop_name    TEXT NOT NULL REFERENCES drops (name) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    next_version INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (drop_name, name)
);

-- An immutable numbered snapshot: manifest, optional schema, and files.
CREATE TABLE dataset_versions (
    drop_name    TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    version      INTEGER NOT NULL,
    state        TEXT NOT NULL,               -- 'draft' | 'committed'
    manifest     TEXT NOT NULL DEFAULT '{}',  -- verbatim JSON
    schema_spec  TEXT,                        -- optional JSON Schema, verbatim
    title        TEXT,                        -- extracted from the manifest
    license      TEXT,                        -- extracted
    row_count    INTEGER,                     -- extracted; NULL when unknown
    file_count   INTEGER NOT NULL DEFAULT 0,
    total_bytes  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    committed_at TEXT,                        -- NULL while draft
    PRIMARY KEY (drop_name, dataset_name, version),
    FOREIGN KEY (drop_name, dataset_name)
        REFERENCES datasets (drop_name, name) ON DELETE CASCADE
);

-- Supports "highest committed version", which is what `latest` resolves to.
CREATE INDEX idx_dataset_versions_state
    ON dataset_versions (drop_name, dataset_name, state, version);

-- A logical path within a version, pointing at a blob.
CREATE TABLE dataset_files (
    drop_name    TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    version      INTEGER NOT NULL,
    path         TEXT NOT NULL,               -- "data/readings.csv"
    digest       TEXT NOT NULL REFERENCES blobs (digest),
    size_bytes   INTEGER NOT NULL,
    media_type   TEXT,
    PRIMARY KEY (drop_name, dataset_name, version, path),
    FOREIGN KEY (drop_name, dataset_name, version)
        REFERENCES dataset_versions (drop_name, dataset_name, version) ON DELETE CASCADE
);

-- Garbage collection asks "is this digest referenced anywhere". Without this
-- index that question is a full scan of every file row on every sweep.
CREATE INDEX idx_dataset_files_digest ON dataset_files (digest);
