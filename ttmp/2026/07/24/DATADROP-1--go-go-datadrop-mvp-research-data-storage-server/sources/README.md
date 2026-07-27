# Sources — Open Source Wolfram Datadrop conversation

Imported from ChatGPT conversation **"Open Source Wolfram Datadrop"**
(id `6a627dd1-0dbc-83ea-a80f-4fac74f8610a`, created 2026-07-23).

Conversation URL: https://chatgpt.com/c/6a627dd1-0dbc-83ea-a80f-4fac74f8610a

These artifacts are the evidence base for the MVP design in
`../design/01-mvp-design.md`. Do not edit them; treat them as read-only imports.
If a newer design supersedes them, add a new doc and link from here.

## Files

| File | Type | Size | Description |
|---|---|---|---|
| `open-source-wolfram-datadrop-transcript.md` | transcript | 95 KB / 3954 lines | Full ChatGPT conversation rendered to Markdown via `surf chatgpt transcript --from-api`. User turns are blockquotes; assistant turns are prose with thinking traces and code blocks. |
| `opendrop-design.md` | design doc | 83 KB | The ~11,350-word full OpenDrop design document: product model, event/schema model, ingestion, query, functions, live sites, IoT, security, storage, governance, roadmap, acceptance criteria. Produced by code-interpreter. |
| `opendrop-browser-pds-profile.md` | design doc | 38 KB | Architecture amendment: browser-native PDS layer with DID/OAuth/PKCE/PAR/DPoP, static apps as OAuth public clients, authenticated fetch streams, one-use WebSocket tickets, capability shell for uploaded scripts. |
| `opendrop-pod-mvp.zip` | code | 92 KB | A standalone OpenDrop MVP pod (separate from the tinyidp overlay). |
| `tinyidp-opendrop-source.tar.gz` | code | 57 KB | Reference vertical slice built on `go-go-golems/tiny-idp`: OAuth→DPoP exchange, SQLite storage, streams, go-go-goja scripts, embedded browser client, tests. Contains `BUILD-REPORT.md`, `APPLY.md`, `VALIDATION.txt`, `MANIFEST.txt`. |
| `probe_status.png` | image | 1.5 KB | User-uploaded input screenshot (`tmp/probe_status.png`). |

## Not retrieved

The following code-interpreter outputs had no resolvable `download_url` at
download time and are considered superseded by `tinyidp-opendrop-source.tar.gz`
(whose contents cover the same delivery/validation/sha256 material):

- `tinyidp-opendrop-git-format.patch`
- `tinyidp-opendrop-full.bundle`
- `tinyidp-opendrop-full-repo.tar.gz`
- `tinyidp-opendrop-source.zip`
- `tinyidp-opendrop-DELIVERY.md`
- `tinyidp-opendrop-validation.md`
- `tinyidp-opendrop-validation.json`
- `tinyidp-opendrop-SHA256SUMS`

## Retrieval method

Retrieved with the `surf` CLI (see `../reference/01-investigation-diary.md` for
the exact commands and the tab-id / navigation workarounds):

```bash
# Open a ChatGPT tab
surf tab new --args-json '{"url":"https://chatgpt.com/"}'

# Find the conversation id by listing /backend-api/conversations
surf js --tab-id <int> --timeout-ms 30000 "...fetch conversations..."

# Download the transcript
surf chatgpt transcript --from-api --conversation-id <id> --tab-id <int> \
  --export-file open-source-wolfram-datadrop-transcript.md

# Navigate the tab to the conversation, then download attached files
surf chatgpt download --conversation-id <id> --tab-id <int> --output-dir .
```
