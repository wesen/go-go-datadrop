---
Title: Implementation diary
Ticket: DATADROP-2
Status: active
Topics:
    - backend
    - server
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/07/24/DATADROP-2--dataset-upload-and-retrieval-bulk-datasets-with-manifests-and-schemas/design/01-intern-implementation-guide.md
      Note: The specification this diary records the implementation of
ExternalSources: []
Summary: "Chronological record of implementing DATADROP-2: content-addressed blob storage, immutable dataset versions with manifests, streaming upload and download, and materialization into event streams."
LastUpdated: 2026-07-24
WhatFor: "Record what was built, what failed, and what a reviewer should check while implementing DATADROP-2."
WhenToUse: "Read before resuming DATADROP-2; append a step after every meaningful change."
---

# Implementation diary

## Goal

Capture the implementation of dataset upload and retrieval: a content-addressed
blob store, immutable versioned datasets carrying manifests and schemas,
streaming upload and download with integrity verification, and a bridge that
materializes dataset rows into the v0.1 event streams.

---

## Step 1: Scope the ticket and write the specification

DATADROP-1 shipped an event store: small JSON payloads, appended one at a time,
capped at a 1 MiB request body. This ticket adds the object that model cannot
express — a large, finite, immutable body of data with a description attached.
The step produced the ticket, an eleven-task plan, and a specification aimed at
someone who has read the v0.1 guide and now needs to understand why datasets are
a different shape rather than merely bigger events.

The design work that mattered was not choosing the storage layout; it was
establishing that a dataset is not a stream, and deriving the data model from
that difference rather than from convenience. Four properties fall out of the
comparison and each one determines a schema or protocol decision.

### Prompt Context

**User prompt (verbatim):** "Create a new ticket to add big dataset upload, instead of just streaming data points. The idea is that one uploads full datasets and their manifest / schema, similar to wolfram datadrop features, and allows them to be retrieved as well.

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Assistant interpretation:** Create a docmgr ticket for bulk dataset upload — full datasets plus manifest and schema, with retrieval — then write a long-form intern-facing analysis, design, and implementation guide with prose, bullets, pseudocode, diagrams, API references and file references; store it in the ticket and upload it to reMarkable. A follow-up instruction set the goal to build the ticket, keeping a frequent detailed diary and committing at intervals.

**Inferred user intent:** Extend the product from streaming telemetry to published research artifacts, which is the half of the Wolfram Data Drop model that v0.1 does not cover, and do it from a written specification rather than by improvisation.

### What I did

- Created ticket `DATADROP-2` ("Dataset upload and retrieval: bulk datasets with
  manifests and schemas", topics `backend,server,design`).
- Re-read the upstream design sections that already specify this layer:
  §7.1 (assets as content-addressed blobs), §7.2 (the drop as a capsule),
  §12.4 (imports, and the provenance a generated event must carry), §20.5 (the
  metadata-database / object-storage split), §20.7 (cold storage, deferred), and
  §22.3 (export as "assets plus manifest").
- Wrote `design/01-intern-implementation-guide.md`, sixteen sections: the gap in
  v0.1, the dataset model, four arguments for why a dataset is not a stream, five
  design commitments, an architecture diagram, the blob store with its write-path
  pseudocode, the SQL data model, the manifest, the three-phase upload protocol
  with a sequence diagram, retrieval, materialization, full HTTP and CLI
  references, a package plan with an eleven-step order, a review checklist, and a
  deferral table.
- Populated `tasks.md` with the eleven tasks from guide §13.2.

### Why

The v0.1 ticket demonstrated that a scope document without a specification costs
a full re-derivation later: `design/01-mvp-design.md` said "port the
hub/broadcaster pattern" without saying what the pattern was, and recovering that
took a day of reading reference code. This ticket has no reference implementation
to fall back on — there is no OpenDrop asset layer in the imported archives — so
the specification has to carry the whole design.

### What worked

- Deriving the data model from the stream/dataset comparison rather than from
  storage convenience produced answers that are easy to defend. "Two events with
  identical payloads are two events; two uploads of identical bytes are one blob"
  determines immediately that the blob key is a digest and not a position, and
  that dedup is a modelling consequence rather than an optimization.
- Naming the commit boundary as a *design commitment* rather than as an
  implementation detail. Every read path filtering `state = 'committed'` is the
  kind of invariant that is obvious once stated and invisible once forgotten, so
  it appears in §4, in the schema comment, and as the first line of the review
  checklist.
- Writing §9.1 as a rejection of the obvious multipart design, with three
  concrete reasons, rather than presenting the staged protocol as self-evidently
  correct. The multipart ordering problem — a manifest after the file part cannot
  be validated until 400 MB has already been written — is the sort of thing that
  is only obvious in retrospect.

### What didn't work

- `docmgr doc add --doc-type design-doc` again created a `design-doc/` directory
  rather than using the ticket's `design/`. Same behaviour as DATADROP-1; moved
  the file and removed the empty directory. Worth a docmgr issue rather than
  repeating the workaround a third time.

### What I learned

- The upstream design already contains most of this ticket, scattered across six
  sections that never appear together. §7.1 defines assets, §12.4 defines the
  provenance a materialized event carries, §20.5 defines the storage split, and
  §22.3 defines export. Nobody reading any one of them would conclude that a
  dataset object exists; reading all six makes it obvious. That is an argument
  for the guide's §16.2 cross-reference table, which is the only place those six
  are collected.
- The design's `.dropbundle` export format (§22.3) and the archive endpoint in
  this ticket are the same artifact viewed from two directions. Making the
  archive a tar of `manifest.json` + `schema.json` + files means dataset export
  and drop export can eventually share a format rather than diverging.

### What was tricky to build

Nothing was built in this step; the difficulty was in scoping. Three decisions
took the most deliberation and each is recorded in the guide with its rationale.

**Whether to include materialization into a stream at all.** It is arguably a
separate ticket: it touches the v0.1 append path, it needs CSV and NDJSON
parsers, and a full implementation wants a job system. It is included because
without it the product is two unrelated features sharing a binary. With it, a
dataset is the origin of a stream and every derived event points back at the
exact bytes and row it came from — which is the property that makes the whole
thing one system. The compromise is that v0.2's import is synchronous and
row-capped, which is useful immediately and does not prejudge the job design.

**Whether blob deletion should be reference-counted.** A counter on the `blobs`
row is the obvious design and it is wrong for this codebase: it adds a write to
every upload path, it must be decremented correctly on every deletion path
including cascades, and a counter that drifts either leaks storage forever or
deletes live data. An explicit sweep is O(files) per run, runs rarely, and is
auditable by inspection. The grace period is what makes it safe, and the reason
it is needed — a blob written into a draft whose `dataset_files` row does not yet
exist is momentarily unreferenced — is exactly the kind of race that a counter
would also have to handle.

**Where the commit boundary lives.** A separate `dataset_drafts` table would
make the invisibility of drafts structural rather than a filter everyone must
remember. It was rejected because promoting a draft would then be a delete plus
an insert across two tables, and the version number would have to survive that
transition, which is more moving parts than a single `UPDATE`. The cost is the
remembered filter, and the mitigation is that it is stated three times in the
guide.

### What warrants a second pair of eyes

- The decision to make import part of this ticket rather than the next one. If
  tasks 1–8 land and task 9 is deferred, the ticket is still coherent; the
  reverse is not true.
- The manifest's recognized-field set (`title`, `license`, `row_count`). Anything
  extracted into a column is effectively frozen, because removing it later means
  a migration. Three fields is a deliberately small commitment, but it is worth
  confirming that nothing else deserves indexing before the migration is written.
- `--max-upload-bytes` defaulting to 5 GiB. That is a policy choice, not a
  technical limit, and it is the only thing standing between a public deployment
  and a filled disk.

### What should be done in the future

- Resolve whether `pkg/blob` should be defined as an interface from the start or
  made one when the S3 backend arrives. The guide assumes a concrete struct now;
  a reviewer may reasonably prefer the interface up front.
- Confirm the archive format against the design's `.dropbundle` before it ships,
  so drop export and dataset export do not diverge.

### Code review instructions

Nothing to review as code yet. To review the specification:

- `design/01-intern-implementation-guide.md` §3 first — the four arguments for
  why datasets are not streams. Every schema decision traces back to one of them.
- §4 (design commitments) and §14.2 (review checklist) together: the checklist
  should assert exactly the commitments, and any drift between the two is a bug
  in the specification.
- §6.3's write-path pseudocode against §14.1's blob test table: each of the four
  load-bearing details should have a test that fails if it is removed.

### Technical details

**Task list**

| # | Task |
|---|---|
| 1 | `pkg/blob` — content-addressed store, standalone |
| 2 | Migration 0002 + domain types |
| 3 | `pkg/store/datasets.go` — draft/committed state machine |
| 4 | Upload endpoints |
| 5 | Download endpoints |
| 6 | Listing and inspection |
| 7 | Archive (streaming tar) |
| 8 | CLI |
| 9 | Import (materialization) |
| 10 | Deletion and GC |
| 11 | Tests and docs |

**The five design commitments, condensed**

1. Blobs are addressed by content hash, never by a generated identifier.
2. A version is invisible until committed.
3. Committed versions are immutable.
4. Uploads and downloads stream; neither buffers a whole file.
5. A blob is never visible at its final path until complete and verified.

**Upstream design sections this ticket implements**

| Section | Contribution |
|---|---|
| §7.1 | Assets as content-addressed blobs |
| §7.2 | The drop as a portable capsule with a manifest |
| §12.4 | Imports; the provenance a generated event must carry |
| §20.5 | Metadata database vs. object storage |
| §22.3 | Export as "assets plus manifest" |

---

## Step 2: Task 1 — the content-addressed blob store

The blob store is the foundation the rest of the ticket sits on, so it was built
first and in isolation: no HTTP, no SQLite, no knowledge of what a dataset is. It
maps a SHA-256 digest to bytes on the filesystem and exposes `Put`, `Open`,
`Stat`, `Exists`, `Delete`, `GC`, and `SweepTemp`. That is the entire surface.

Keeping it that narrow is deliberate. The eventual S3 backend has to replace
exactly these seven operations and nothing else, and the way to guarantee that is
to make it impossible for the package to depend on anything above it.

### Prompt Context

**User prompt (verbatim):** "Build DATADROP-2, keep a frequent detailed diary,commit at appropriate intervals."

**Assistant interpretation:** Implement the ticket task by task, appending a
diary step as each lands rather than writing it up at the end, and committing at
task boundaries.

**Inferred user intent:** A working dataset layer, built from the specification
written in Step 1, with the process reviewable as it happens.

**Commit (code):** `7174ee6` — "feat(DATADROP-2): task 1 — content-addressed blob store"

### What I did

- `pkg/blob/digest.go` — `Digest`, `ParseDigest`, and the two-level fanout path
  derivation.
- `pkg/blob/store.go` — `Open` (which sweeps `tmp/`), `Put`, `Open`, `Stat`,
  `Exists`, `Delete`, `GC`, `SweepTemp`.
- `pkg/blob/store_test.go` — 20 tests.

### Why

Every later task depends on bytes being stored correctly, and "correctly" here
means two properties that are invisible in normal operation and only manifest
under failure: a partial upload must never become visible, and a caller must
never be able to place chosen bytes at another file's address. Both are cheap to
implement and expensive to retrofit, and neither is observable in a happy-path
test, so both got dedicated tests.

### What worked

- Writing the tests against *properties* rather than methods. `TestFailedPutLeavesNoTrace`
  and `TestInterruptedPutPublishesNothing` both assert on the state of the whole
  store afterwards — zero blob files, zero temp files — rather than on a return
  value. That is the only way to catch a cleanup path that is simply missing.
- `countBlobFiles` walking the store and asserting `1` after writing identical
  content twice. Deduplication is easy to claim and easy to get subtly wrong; a
  file count is unambiguous.
- Feeding `ParseDigest` genuinely hostile input, including `sha256:../../../../etc/passwd`.
  The digest becomes a filesystem path, so the parser is the path-traversal
  defence. Testing it with one malformed value would have proved much less.

### What didn't work

Nothing failed outright in this step. `mmdc` could not launch a browser in this
environment, which mattered later (Step 4) but not here.

### What I learned

- The correct ordering in `Put` is *write, then check for an existing blob*, not
  the reverse. Checking first and skipping the write looks like an optimization
  and is a race: two concurrent writers of the same new blob both observe it
  missing, and both proceed. Writing unconditionally and discarding on collision
  is correct under concurrency and costs one temp file in the rare case where the
  collision actually happens.

### What was tricky to build

**The interaction between `Sync`, `Rename`, and the deferred cleanup.** Three
operations have to happen in one specific order and each guards a different
failure:

- `Sync` before `Rename`, because `os.Rename` is atomic with respect to the
  *directory entry*, not with respect to the data. Renaming first and syncing
  later leaves a window in which a crash produces a file that exists at its final
  path with unwritten contents — which is precisely the "partial blob that a
  reader treats as complete" case the design forbids.
- The temp file must live on the same filesystem as the destination, because
  `os.Rename` across filesystems either fails or degrades to a copy, and a copy
  is not atomic. This is why `tmp/` is a subdirectory of the store root rather
  than `os.TempDir()`.
- The deferred cleanup needs a `renamed` flag. A bare `defer os.Remove(tempPath)`
  would delete the blob it had just published, since after a successful rename
  the temp path no longer refers to the temp file — it refers to nothing, but on
  some orderings it would refer to the published file.

**GC's grace period.** The naive sweep — delete everything not in the referenced
set — deletes bytes out from under an in-flight upload, because a blob written
moments ago for a draft version whose `dataset_files` row has not yet been
inserted is legitimately unreferenced. The grace period is what closes that
window, and `TestGCRespectsTheGracePeriod` is its specification. The test for the
opposite behaviour passes `minAge = -1` to disable the check, which is documented
as test-only precisely because using it in production would reintroduce the race.

### What warrants a second pair of eyes

- `GC` skips files whose names do not parse as digests and logs a warning rather
  than deleting them. That is the conservative choice — never delete a file whose
  provenance is unknown — but it means a corrupted store accumulates junk that
  only a human will clear.
- `TestPutHandlesLargeContent` uses 8 MiB and verifies the digest. It does not
  measure memory, so a `ReadAll`-based implementation would also pass it. It is a
  smoke test for the streaming path, not a proof, and the doc comment says so.

### What should be done in the future

- Decide whether `pkg/blob.Store` should become an interface now or when the S3
  backend arrives. The guide §15 assumes the latter.

### Code review instructions

- `pkg/blob/store.go` `Put` — the four numbered details in the doc comment, each
  with a corresponding test.
- `pkg/blob/digest.go` `ParseDigest` — strictness is the traversal defence.
- `GC`'s grace period, against `TestGCRespectsTheGracePeriod`.

```bash
GOWORK=off go test ./pkg/blob/... -count=1 -v
```

---

## Step 3: Tasks 2 and 3 — schema, domain types, and the dataset store

Migration 0002 adds `blobs`, `datasets`, `dataset_versions`, and
`dataset_files`. `pkg/datadrop` gains the dataset types, manifest parsing, and
logical-path validation. `pkg/store/datasets.go` implements the draft-to-
committed state machine that the whole design rests on.

This step produced the first genuine bug of the ticket, and it was found by a
test written to assert a property the specification states rather than to
exercise a method.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Assistant interpretation:** Continue through the task list.

**Commit (code):** `d30c44c` — "feat(DATADROP-2): tasks 2-3 — dataset schema, domain types, and store"

### What I did

- `pkg/store/migrations/0002_datasets.sql` — four tables and two indexes.
- `pkg/datadrop/dataset.go` — `Dataset`, `DatasetVersion`, `DatasetFile`,
  `VersionState`, `Manifest`, `ParseManifest`, `ValidateDatasetPath`, the request
  and result types, and five audit actions.
- `pkg/store/datasets.go` — `OpenDatasetVersion`, `AddDatasetFile`,
  `CommitDatasetVersion`, `GetDatasetVersion`, `ResolveLatestVersion`,
  `GetDatasetFile`, `ListDatasetFiles`, `ListDatasets`, `GetDataset`,
  `ListDatasetVersions`, `DeleteDatasetVersion`, `ReferencedDigests`.
- `pkg/store/datasets_test.go` — 29 tests.
- Relaxed two v0.1 migration tests that hardcoded a literal migration count.

### Why

Tasks 2 and 3 land together because the schema and the operations over it are one
design: the `state` column is only meaningful if every read path filters on it,
and that filtering is what the store package *is*.

### What worked

- Writing `TestDraftVersionsAreInvisible` as five subtests, one per read path
  (`ListDatasetVersions`, `GetDatasetVersion`, `ResolveLatestVersion`,
  `GetDatasetFile`, `GetDataset`). The commitment is "every read path filters on
  committed", and the only honest way to test "every" is to enumerate them. A
  future read path that forgets the filter will not be covered — which is why the
  review checklist asks the question in prose as well.
- `GetDatasetVersion` taking an explicit `includeDrafts bool` rather than
  defaulting to including them. The one caller that legitimately needs a draft is
  the upload handler assembling it; making it ask means the default is safe and
  the exception is visible at the call site.

### What didn't work

- **Version numbers were reusable after deletion.** `OpenDatasetVersion`
  originally allocated `MAX(version)+1` over `dataset_versions`. Deleting version
  3 makes `MAX` return 2, so the next open hands out 3 again — and a citation to
  "version 3 of readings-2026" silently starts resolving to different content,
  which defeats the entire point of immutable versions.

  This is the same failure mode the v0.1 event sequence avoids with
  `stream_heads`, and it gets the same fix: a `next_version` counter on the
  `datasets` row, advanced inside the allocating transaction. Migration 0002 is
  unreleased, so the column was added in place rather than in an 0003.

  The bug was caught by `TestOpenDatasetVersionIsMonotonic`, which was written to
  assert monotonicity *across a deletion* specifically because the guide claims
  version references are stable citations. A test that only opened three versions
  in a row would have passed.

- Two v0.1 tests failed on the new migration: `TestOpenCreatesAndMigrates`
  asserted `schema version = 1` and `TestOpenIsIdempotent` asserted
  `migration applied 1 time`. Both were over-specified — they pinned a literal
  where the meaningful assertion is "matches the embedded set". Rewritten to
  derive the expectation from `loadMigrations()`, so the next migration will not
  edit them either.

### What I learned

- The "allocate from live rows" mistake is not obviously wrong when written. It
  is only wrong in combination with deletion, and deletion is usually implemented
  later than allocation. The general form worth remembering: **an allocator that
  reads its next value from the rows it allocates for is correct only if those
  rows are never deleted.** v0.1 hit this with sequences; v0.2 hit it again with
  versions.

### What was tricky to build

**Deciding whether draft files count as referenced for garbage collection.** The
intuitive answer is no — a draft is not visible, so its bytes are not really in
use. That answer deletes data. A draft under construction holds `dataset_files`
rows pointing at blobs that are, by definition, not yet reachable from any
committed version, and sweeping them removes the bytes the client just uploaded.
`ReferencedDigests` therefore does not filter on state, and
`TestReferencedDigests` asserts specifically that a draft's digests appear. The
blob store's grace period covers the narrower window before the row exists at
all; the referenced set covers everything after it.

**Path canonicalization.** `ValidateDatasetPath` rejects paths that `path.Clean`
would change, rather than cleaning them silently. Accepting both `a/./b` and
`a/b` would let two spellings of one logical path occupy two rows in a table
whose primary key includes the path, so a version could contain the "same" file
twice with different content. Rejecting non-canonical form is the only option
that keeps the primary key meaningful.

### What warrants a second pair of eyes

- `ReferencedDigests` returns every digest in `dataset_files` with no filtering,
  including from drafts. Correct, per the above, but it means an abandoned draft
  pins its blobs forever. There is currently nothing that expires drafts.
- The `datasets.next_version` counter is never reset, so a dataset whose versions
  are all deleted still allocates from where it left off. That is intended, but
  it means version numbers are not dense and a reader should not assume 1..N.

### What should be done in the future

- Expire abandoned drafts, which would also release their blobs to the sweep.
- Consider whether deleting the last committed version of a dataset should also
  delete the dataset row.

### Code review instructions

- `pkg/store/datasets.go` `OpenDatasetVersion` — the counter-based allocation and
  its comment, against `TestOpenDatasetVersionIsMonotonic`.
- Every read path in the file, checking for the `state = 'committed'` filter.
  `TestDraftVersionsAreInvisible` enumerates the five that exist today.
- `pkg/datadrop/dataset.go` `ValidateDatasetPath` — canonical-form rejection.

```bash
GOWORK=off go test ./pkg/store/... ./pkg/datadrop/... -count=1
```

### Technical details

**The allocator, before and after**

```sql
-- WRONG: deleting version 3 lets the next open reuse the number
SELECT COALESCE(MAX(version), 0) FROM dataset_versions
 WHERE drop_name = ? AND dataset_name = ?

-- RIGHT: a counter that only moves forward, advanced in the same transaction
SELECT next_version FROM datasets WHERE drop_name = ? AND name = ?
UPDATE datasets SET next_version = ? WHERE drop_name = ? AND name = ?
```

**Test coverage after this step**

| Package | Tests |
|---|---:|
| `pkg/blob` | 20 |
| `pkg/store` (datasets) | 29 |
| everything else (v0.1) | 125 |

---

## Step 4: Tasks 4–7 — the HTTP surface

Eleven `/v1` endpoints plus `HEAD /v1/blobs/{digest}`: open a draft, upload or
mount a file, commit, read metadata, download bytes with `Range`, stream a tar
archive, list, and delete. This is the step where the specification's three-phase
upload protocol becomes something a client can actually drive.

Two bugs surfaced, both only under manual testing against a real server, and
both of the kind a unit test would not have been written for because neither is
a case anyone anticipates until they see the output.

### Prompt Context

**User prompt (verbatim):** (see Step 2)

**Commit (code):** `8e25f80` — "feat(DATADROP-2): tasks 4-7 — upload, download, listing, and archive"

### What I did

- `pkg/server/handlers_datasets.go` — list, get, open draft, get version, commit,
  delete, plus `resolveVersion` (which understands `latest`) and
  `writeDatasetError` (which maps the immutability sentinel to 409).
- `pkg/server/handlers_blobs.go` — upload with both the streamed and mounted
  forms, the single-shot convenience form, download via `http.ServeContent`,
  `HEAD /v1/blobs`, and the streaming tar archive.
- Wired `*blob.Store` into `Server` and added `--blobs` and
  `--max-upload-bytes` to `serve`.
- `pkg/server/handlers_datasets_test.go` — 24 tests.

### Why

The staged protocol only pays for itself if the digest precheck exists, so
`HEAD /v1/blobs` and the bodyless mount landed in the same step as the upload
handler rather than as a later optimization. Without them the protocol is three
requests where one would do, which would be a fair criticism.

### What worked

- **`http.ServeContent` was the right call and cost nothing.** `Range`,
  `If-None-Match`, `If-Modified-Since`, `Accept-Ranges` and `Content-Length` all
  work correctly without a line of parsing. Verified against a live server:
  `Range: bytes=0-11` returned `206` with `Content-Range: bytes 0-11/41`, and
  `If-None-Match` on the digest returned `304`.
- **The ETag being the digest.** Two responses with the same ETag are
  byte-identical by construction rather than by convention, which is a stronger
  guarantee than most ETag implementations can make.
- Implementing the single-shot form *in terms of* the staged operations. There
  is one `CommitDatasetVersion` call site per path and one state transition, so
  the convenience endpoint cannot drift from the protocol it wraps.
- The end-to-end smoke run: two versions sharing an unchanged file produced
  exactly two blobs on disk, and the second version's upload reported
  `"deduplicated": true` with no body sent.

### What didn't work

- **The media type recorded a client's default Content-Type as fact.** Uploading
  `README.md` with `curl --data-binary` and no explicit `-H` stored
  `media_type: application/x-www-form-urlencoded` — which is what curl sends when
  it has no opinion, not a claim about the content. Because versions are
  immutable, that wrong value would have been permanent.

  The fix distinguishes a *deliberate* Content-Type from a *default* one. A
  deliberate type wins, because it is the only thing that can describe a file
  with no extension; the two known client defaults
  (`application/octet-stream`, `application/x-www-form-urlencoded`) lose to the
  filename extension, because they carry no information. `README.md` now records
  `text/markdown` and a `data.bin` uploaded as `text/csv` still records
  `text/csv`.

- **The upload-cap test failed for the wrong reason.** It set
  `MaxBodyBytes = 16` before seeding the drop, and the seed request is itself
  JSON larger than 16 bytes, so the setup 413'd. Reordered so the cap drops only
  after setup. The test as written was asserting nothing about uploads.

### What I learned

- **`http.ServeMux` cleans the request path before routing.** A `PUT` to
  `.../files/../../escape.md` never reaches the handler: the path collapses to
  something matching no `PUT` route, and the mux returns `405`. So the URL-path
  traversal vector is closed by the standard library before any validation runs.

  This matters because it means `ValidateDatasetPath` is *not* redundant, but its
  real job is a different vector: the `?path=` query parameter on the
  single-shot endpoint, which is not normalized by anything. That is the form the
  test targets, and all four hostile values return `400`. Had I only tested the
  URL-path form I would have concluded the validation worked while leaving the
  vector that actually needs it unverified.

### What was tricky to build

**Distinguishing the mount request from an empty upload.** Both are a `PUT` with
no body. The discriminator is `?digest=` combined with `ContentLength == 0`: a
digest with no body means "you already have this, record it", while no digest
and no body means "store zero bytes", which is legal. Getting this backwards
would either make zero-byte files impossible or turn a failed upload into a
silent mount of whatever digest the client named.

The mount path still has to do real work — verify the blob exists, `Stat` it for
the size, and insert the `dataset_files` row. It is a metadata operation, not a
no-op, and a `404` when the digest is absent is what tells the client to retry
with the body.

**Where to check that the version is still a draft.** The check has to happen
*before* the body is read, or a client streams 400 MB only to be told the
version was committed. But `GetDatasetVersion` with `includeDrafts: true` is
also the only place a draft is legitimately readable, so the flag exists purely
for this call site and is `false` everywhere else.

### What warrants a second pair of eyes

- `handlePutDatasetData` deliberately leaves the draft behind when the upload
  fails. Deleting it would race with a client retrying, and an abandoned draft is
  invisible to every reader — but nothing expires them, so a client that fails
  repeatedly accumulates drafts that pin blobs against garbage collection.
- `handleHeadBlob` gates existence on the instance token with no per-drop check,
  because a blob is shared across drops and has no owning drop. That is correct
  for a single-token deployment and becomes a question when per-capability tokens
  arrive: existence of a digest is a small information leak.
- The archive writes `files/<path>` entries under a `files/` prefix, with
  `manifest.json` and `schema.json` at the root. That layout should be confirmed
  against the upstream `.dropbundle` format before anything depends on it.

### What should be done in the future

- Expire abandoned drafts.
- Consider a `Content-Digest` response header on download so a client can verify
  without having recorded the manifest.

### Code review instructions

- `handlers_blobs.go` `storeUploadedBytes` — the mount/stream discriminator and
  the `MaxBytesReader` wrapping.
- `uploadMediaType` and `defaultMediaTypes` — the deliberate-vs-default rule.
- `handleDownloadDatasetFile` — `ServeContent`, and the ETag being the digest.
- `handlers_datasets.go` `resolveVersion` vs `parseVersionNumber`: `latest` is
  meaningless on write paths, because it resolves over committed versions only.

```bash
GOWORK=off go test ./pkg/server/... -count=1
```

### Technical details

**Verified by hand against a live server**

```
open draft (no drop)      → 404 NotFound
open draft                → 201 {"version":1,"state":"draft"}
HEAD blob (not present)   → 404
PUT file ?digest=…        → 201 {"deduplicated":false}
commit                    → 200 {"state":"committed","file_count":2,"total_bytes":73}
GET .../latest/files/…    → the uploaded bytes
Range: bytes=0-11         → 206, Content-Range: bytes 0-11/41
If-None-Match: "<digest>" → 304
HEAD blob (now present)   → 200
v2 mount (no body)        → 201 {"deduplicated":true}
blobs on disk             → 2 files for 2 versions sharing one file
GET .../latest            → version 2
archive                   → manifest.json, files/README.md, files/data/readings.csv
add file to committed v1  → 409 VersionImmutable
digest mismatch           → 400 DigestMismatch, nothing stored at that digest
mount an absent digest    → 404 "send the body to upload it"
?path=../../escape.csv    → 400 InvalidRequest
unauthenticated upload    → 401
```

**The media-type rule**

| Declared Content-Type | Extension | Recorded |
|---|---|---|
| `text/csv` | `.bin` | `text/csv` — a deliberate type wins |
| `application/x-www-form-urlencoded` | `.md` | `text/markdown` — a client default loses |
| `application/octet-stream` | `.csv` | `text/csv` — likewise |
| *(none)* | `.csv` | `text/csv` |
| `text/csv` | *(none)* | `text/csv` |
