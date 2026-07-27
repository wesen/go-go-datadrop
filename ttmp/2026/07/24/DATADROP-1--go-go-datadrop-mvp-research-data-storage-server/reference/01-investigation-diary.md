---
Title: Investigation diary
Ticket: DATADROP-1
Status: active
Topics:
    - backend
    - mvp
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/07/24/DATADROP-1--go-go-datadrop-mvp-research-data-storage-server/design/01-mvp-design.md
      Note: MVP design scoped from the retrieved sources
ExternalSources:
    - sources/open-source-wolfram-datadrop-transcript.md
Summary: ""
LastUpdated: 2026-07-24T00:00:00Z
WhatFor: Chronological record of how the OpenDrop sources were gathered and the MVP ticket scoped.
WhenToUse: Read before resuming DATADROP-1 to recover context and prior decisions.
---


# Investigation diary

## Goal

Capture how the source artifacts for the `go-go-datadrop` MVP were retrieved and
how the v0.1 scope was decided, so the next session can resume without
re-deriving it.

## Step 1: Retrieve the "Open Source Wolfram Datadrop" conversation and its artifacts

The user asked to use `surf` (the surf CLI) to get the documents and transcript
of the "opensource wolfram data drop conversation from yesterday", create a new
docmgr ticket in `go-go-datadrop` for the first MVP, and import those documents
into the ticket's `sources/` folder.

### Prompt Context

**User prompt (verbatim):** "Can you use surf-cli and get the documents and transcript of the opensource wolfram data drop conversation from yesterday and create a new docmgr ticket in the new repo for implement the first MVP, and import these documents in the sources/ folder of the docmgr ticket."

**Assistant interpretation:** Use the surf browser CLI to locate yesterday's ChatGPT conversation about an open-source Wolfram Data Drop, download its transcript and any attached/generated documents, then create a docmgr ticket scoped to "implement the first MVP" in the new `go-go-datadrop` repo and place all retrieved artifacts under that ticket's `sources/` directory.

**Inferred user intent:** Seed the `go-go-datadrop` repo with the prior design work (transcript + design docs + reference MVP source) so implementation of the first MVP can begin from evidence rather than from scratch.

### What I did

- Read the `chatgpt-transcript-archiving` skill to learn the surf-based archive workflow.
- Confirmed `surf` (not `surf-go`) is the CLI binary; explored `surf chatgpt transcript|download`.
- Opened a ChatGPT tab via `surf tab new --args-json '{"url":"https://chatgpt.com/"}'`.
- Resolved the tab id as an integer (the `tab list` output prints ids in scientific notation, e.g. `4.41401427e+08`; `surf js --tab-id` rejects the float form, so converted to `441401427`).
- Listed conversations via `surf js` calling `/backend-api/conversations?order=updated` and located "Open Source Wolfram Datadrop" (id `6a627dd1-0dbc-83ea-a80f-4fac74f8610a`).
- Verified timestamps: `create_time` 2026-07-23T20:47:13Z (yesterday UTC, matching the user's "yesterday"), `update_time` 2026-07-24 (today). 1300 mapping keys.
- Created docmgr ticket `DATADROP-1` ("go-go-datadrop MVP: research data storage server", topics `backend,server,mvp`) at `ttmp/2026/07/24/DATADROP-1--...`.
- Downloaded the transcript with `surf chatgpt transcript --from-api --conversation-id <id> --tab-id <id> --export-file sources/open-source-wolfram-datadrop-transcript.md` → 95 KB, 3954 lines.
- Listed files with `surf chatgpt download --list`. **First attempt returned 0 inputs / 0 outputs.** After navigating the ChatGPT tab to the conversation URL (`https://chatgpt.com/c/<id>`) and re-listing, the inventory resolved to 1 input + 12 outputs.
- Downloaded all files with `surf chatgpt download --conversation-id <id> --output-dir sources/`. 5 downloaded successfully; 7 reported `no download_url` (superseded/duplicate code-interpreter artifacts whose URLs had expired).
- Flattened `sources/`: moved files out of the conversation-id subdirectory, removed `manifest.json` and the empty subdir (per the archive skill's cleanup pattern). Renamed the input screenshot to `probe_status.png`.
- Wrote the MVP design doc (`design/01-mvp-design.md`) mapping the sources to a v0.1 scope with decision records and a phased plan.

### Why

The MVP needs to start from the existing design thinking rather than redoing it.
The transcript + design docs + reference slice are the evidence base for every
scope decision in `design/01-mvp-design.md`.

### What worked

- `surf js` against `/backend-api/conversations` is a reliable way to list and
  find conversations by title/date.
- `surf chatgpt transcript --from-api --export-file` cleanly renders the
  transcript to a chosen path.
- Navigating the tab to the conversation URL *before* `surf chatgpt download`
  was required to populate the file inventory (the initial `--list` with only the
  chatgpt.com root open returned zero files).

### What didn't work

- `surf navigate --tab-id <id> <url>` failed with `Error: Too many arguments`
  (the `navigate` verb did not accept the URL as a trailing positional in this
  form). Worked around by passing the conversation URL through `surf js` /
  relying on the already-open conversation for the download inventory.
- Tab ids printed in scientific notation (`4.41401427e+08`) are rejected by
  `--tab-id` (`strconv.ParseInt` error). Must convert to a plain integer.
- 7 of 12 output files returned `no download_url` on download (e.g.
  `tinyidp-opendrop-git-format.patch`, `-full.bundle`, `-DELIVERY.md`,
  `-validation.*`, `-SHA256SUMS`). These appear to be superseded by the bundled
  `tinyidp-opendrop-source.tar.gz`, whose contents include `VALIDATION.txt`,
  `MANIFEST.txt`, `BUILD-REPORT.md`, and `APPLY.md` — so no information was
  actually lost.

### What I learned

- The conversation produced a coherent design lineage: a full design doc
  (`opendrop-design.md`), a browser-PDS architecture amendment
  (`opendrop-browser-pds-profile.md`), and a working Go reference slice built on
  `go-go-golems/tiny-idp` (`tinyidp-opendrop-source.tar.gz`) plus a standalone pod
  (`opendrop-pod-mvp.zip`).
- The reference slice already proves the storage/stream/DPoP loop is buildable
  in the go-go-golems stack (SQLite, go-go-goja scripts, SSE/WebSocket), which
  de-risks the MVP substantially.
- The design's working name is "OpenDrop"; the repo/binary is `go-go-datadrop`.
  Naming decision left open in the design doc (DR/proposal: binary `datadrop`).

### What was tricky to build

- **surf tab id parsing.** `surf tab list` emits YAML-ish output where `id:` is
  a float in scientific notation. `surf js --tab-id` requires an integer. The
  archive skill's awk extraction (`awk '/^      id:/ { id = $2 }'`) yields the
  float string; it must be coerced to an integer (e.g.
  `printf "%.0f"` or `int(float(...))`) before passing to `--tab-id`.
- **File inventory depends on conversation navigation.** With only the
  chatgpt.com root open, `surf chatgpt download --list` reported 0 files. After
  the tab was on the conversation page, the same command returned 13 files. The
  archive script downloads transcripts first (which it can do via
  `--from-api --conversation-id`) but does rely on a valid tab session for the
  file download step.
- **`no download_url` artifacts.** Some code-interpreter outputs have no
  resolvable download URL by the time the download runs. These were not
  retriable; the bundled source tarball contained their content.

### What warrants a second pair of eyes

- The v0.1 cut line in `design/01-mvp-design.md` (especially deferring DPoP and
  all identity to v0.2) — confirm this matches the user's intent for "the first
  MVP".
- DR-1 (standalone binary vs. TinyIDP overlay): the reference slice is on
  TinyIDP; choosing standalone means re-implementing the store/stream layer
  (small) but also re-deciding identity later.
- The SQLite schema in §5.1 is a draft; review the `events` table's
  `UNIQUE(drop_name, seq)` and indexing for the expected query patterns.

### What should be done in the future

- Decide identity story for v0.2 (TinyIDP/DPoP vs. longer token-only period).
- Re-attempt download of the 7 missing artifacts if the conversation is
  re-opened fresh (they may have transient download URLs), or extract equivalents
  from `tinyidp-opendrop-source.tar.gz` if needed.
- Archive this transcript into the Obsidian vault under
  `Transcripts/2026/07/23/` and link to the relevant MOC (the archive skill's
  daily workflow), if vault classification is desired.

### Code review instructions

- Start at `design/01-mvp-design.md` §5 (proposed architecture) and §7 (phased
  plan).
- Validate the source inventory:
  `ls -la ttmp/2026/07/24/DATADROP-1--*/sources/` and open
  `sources/opendrop-design.md` §8/§10/§11/§13 to confirm the MVP scope matches
  the design's "simple path" (§6.1).
- Cross-check the reference slice:
  `tar -tzf sources/tinyidp-opendrop-source.tar.gz` and read its
  `BUILD-REPORT.md` for the proven storage/stream patterns the MVP will port.

### Technical details

- Conversation id: `6a627dd1-0dbc-83ea-a80f-4fac74f8610a`
- Conversation URL: https://chatgpt.com/c/6a627dd1-0dbc-83ea-a80f-4fac74f8610a
- Created 2026-07-23T20:47:13Z, updated 2026-07-24 (UTC).
- surf commands used:
  - `surf tab new --args-json '{"url":"https://chatgpt.com/"}'`
  - `surf js --tab-id <int> --timeout-ms 30000 "<fetch /backend-api/conversations>"`
  - `surf chatgpt transcript --from-api --conversation-id <id> --tab-id <int> --export-file <path>`
  - `surf chatgpt download --conversation-id <id> --tab-id <int> --list`
  - `surf chatgpt download --conversation-id <id> --tab-id <int> --output-dir <dir>`
