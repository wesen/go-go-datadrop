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
