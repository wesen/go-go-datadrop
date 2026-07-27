# OpenDrop Browser-PDS Profile

**Status:** Architecture amendment / implementation proposal  
**Version:** 0.2-draft  
**Date:** 2026-07-23  
**Scope:** Browser-native authentication, personal storage, local-first static applications, and realtime feeds

---

## 1. Decision summary

OpenDrop should add a browser-first personal data service modeled on the useful layers of an AT Protocol Personal Data Server (PDS):

- a DID identifies the account and locates its storage host;
- OAuth authorization uses PKCE, PAR, and DPoP;
- small structured records are schema-described with Lexicons;
- records are content-addressed and committed into a signed repository;
- large objects are content-addressed blobs;
- changes are published through resumable realtime feeds;
- clients can export and migrate their data;
- applications can be entirely static HTML, CSS, JavaScript, and WebAssembly.

The resulting product is not serverless in the literal sense. It removes the **application server**. A shared storage host still performs authentication, authorization, durable storage, repository commits, blob delivery, and realtime fanout.

The target shape is:

```text
static site on any CDN
        │
        │ OAuth + PKCE + DPoP
        ▼
OpenDrop Pod / PDS
├── authorization server
├── account and DID binding
├── public ATproto-compatible repo
├── private vaults and data spaces
├── append-only streams
├── blob storage
├── snapshot and migration API
└── authenticated realtime feeds
        │
        ▼
local browser replica
├── IndexedDB / OPFS
├── local query engine
├── offline outbox
├── SharedWorker feed client
└── live UI and uploaded scripts
```

The main product proposition becomes:

> **A static page can become a complete personal or collaborative data application by logging into a portable storage host.**

No application-specific database, session server, websocket server, or API backend is required.

---

## 2. Compatibility boundary

### 2.1 Use ATproto directly where its semantics fit

The implementation should follow the ATproto specifications for:

- DID and handle resolution;
- OAuth client discovery;
- PKCE, PAR, and DPoP;
- XRPC conventions;
- Lexicon schemas;
- the public account repository;
- content-addressed blobs;
- signed repository commits;
- public repository export and synchronization;
- standard `com.atproto.*` endpoints where implemented.

This provides existing tooling, a documented cryptographic model, account migration, namespace governance, and an ecosystem-compatible identity layer.

### 2.2 Do not put private application data in the standard public repo

An ATproto account repository is a public, verifiable dataset. Standard repository exports are public and the public firehose is designed for redistribution. That is suitable for public profiles, published site manifests, public data products, and portable declarations. It is not suitable for private notes, laboratory observations, private IoT readings, credentials, or access-controlled business data.

OpenDrop therefore has two protocol planes:

| Plane | Semantics | Compatibility |
|---|---|---|
| **Public repo** | Public records, signed commits, public sync, CAR export | ATproto-compatible |
| **Storage extension** | Private records, data spaces, streams, ACLs, authenticated sync | OpenDrop extension |

The extension can reuse ATproto encoding, CIDs, Lexicons, OAuth sessions, DIDs, and XRPC conventions without claiming that private resources are standard ATproto repository records.

### 2.3 Expose the extension as another DID service

An account DID document can advertise both services:

```json
{
  "id": "did:web:alice.example",
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://pod.example"
    },
    {
      "id": "#opendrop_storage",
      "type": "OpenDropStorage",
      "serviceEndpoint": "https://pod.example"
    }
  ]
}
```

The two services may be implemented by the same process and origin. The separation is semantic: public repo endpoints keep public ATproto behavior, while OpenDrop endpoints enforce private authorization.

### 2.4 Permissions strategy

The current ATproto permission system defines resources such as `repo`, `rpc`, `blob`, `identity`, and `account`. Generic ATproto authorization servers will not understand invented `vault:` or `stream:` resource types.

For initial interoperability, OpenDrop private operations should be granted as narrowly scoped `rpc` permissions whose audience is the account's `#opendrop_storage` service. OpenDrop can define human-readable Lexicon permission sets that bundle those RPC calls.

Conceptually:

```text
atproto
repo:dev.example.siteManifest?action=create&action=update
blob:text/*
rpc:io.opendrop.vault.get?aud=did:web:pod.example#opendrop_storage
rpc:io.opendrop.vault.put?aud=did:web:pod.example#opendrop_storage
rpc:io.opendrop.sync.subscribe?aud=did:web:pod.example#opendrop_storage
```

A later protocol revision may standardize first-class `space`, `stream`, or `vault` permission resources, but version 1 should not depend on unrelated ATproto servers understanding them.

---

## 3. Product model

### 3.1 Account

An account is identified by a DID and hosted by a Pod/PDS. It owns:

- one ATproto-compatible public repository;
- zero or more private data spaces;
- content-addressed blobs;
- OAuth grants and device sessions;
- optional static-site releases;
- export and migration state.

### 3.2 Data space

A **space** is the OpenDrop authorization and portability boundary. A space can represent a personal notebook, project, dashboard, device fleet, dataset, or collaborative application.

```text
Space
├── metadata
├── members and grants
├── collections
├── streams
├── blobs
├── snapshots
├── site releases
└── local-view definitions
```

A space has a stable opaque ID and a human-readable name. It may be:

- private;
- shared with named DIDs;
- readable through a delegated capability;
- publicly readable;
- independently exportable;
- later promotable to its own DID if independent migration becomes useful.

### 3.3 Collections

Collections contain addressed structured records:

```text
(space, collection NSID, record key) -> typed record
```

Records use Lexicon schemas and canonical CBOR/JSON representations. Each version receives a CID. Writes support optimistic concurrency with a previous CID, repository revision, or ETag.

Collections are appropriate for:

- application documents;
- current state;
- manifests;
- configurations;
- comments and annotations;
- saved queries;
- site releases;
- device descriptions.

### 3.4 Streams

Streams are durable append-only logs optimized for time-oriented data and subscriptions:

```text
(space, stream name, sequence) -> event
```

Each event has:

- monotonically increasing per-stream sequence;
- stable event ID;
- event time and ingest time;
- schema/type NSID;
- producer DID or delegated principal;
- payload CID;
- optional idempotency key;
- optional causation and correlation IDs.

Streams are appropriate for:

- telemetry;
- audit trails;
- activity events;
- sensor readings;
- collaborative edits;
- notifications;
- computation results.

A high-rate stream should not force an MST update for every sample. The stream log is a separate authenticated resource. Sealed immutable segments can be content-addressed and referenced from snapshot manifests.

### 3.5 Blobs

Blobs are content-addressed bytes with:

- CID;
- size;
- detected media type;
- owner/account;
- access policy inherited from references or an explicit space;
- upload state;
- reference count and retention state.

Public-repo blobs preserve standard ATproto behavior. Private-space blobs must not be exposed by public blob download endpoints.

### 3.6 Site release

A site release is an immutable static application bundle plus a manifest:

```text
SiteRelease
├── entry document
├── asset CIDs
├── module integrity hashes
├── requested permission set
├── allowed storage origins
├── local replica definitions
├── content security policy
├── plugin isolation mode
└── release signature/provenance
```

The bundle can be served by any CDN, by the storage host, or directly from a content-addressed gateway.

---

## 4. Browser authentication with DPoP

### 4.1 Static sites are OAuth public clients

A static site has no client secret. Its OAuth client ID is an HTTPS URL that resolves to client metadata. The flow is:

1. The user enters a handle, DID, or Pod URL.
2. The application resolves the DID and storage host.
3. The browser creates an ES256 DPoP key pair.
4. The private key is created as non-extractable and stored as a `CryptoKey` in IndexedDB.
5. The client creates PKCE verifier/challenge and state values.
6. The client submits a pushed authorization request using a DPoP proof.
7. The browser redirects to the account authorization server.
8. The user approves a bounded permission set.
9. The browser exchanges the code using PKCE and DPoP.
10. The browser stores the rotating, DPoP-bound session in IndexedDB.
11. Every resource request carries a fresh DPoP proof and `Authorization: DPoP ...`.

No bearer token should be placed in page URLs, local storage, HTML, or generated static configuration.

### 4.2 Browser session storage

Recommended IndexedDB objects:

```text
oauth_sessions
  key: issuer + account DID + client ID
  value:
    access token
    refresh token
    expiry
    granted scopes
    DPoP key reference
    authorization-server nonce
    resource-server nonce
    account DID
    PDS endpoint

crypto_keys
  key: session ID
  value: non-extractable CryptoKey pair
```

Access tokens should be short-lived. Refresh tokens should rotate and remain bound to the same DPoP key. Session revocation is available from the Pod account console.

Do not store tokens in `localStorage`; it is globally readable by same-origin JavaScript and has no structured isolation.

### 4.3 DPoP request handling

A protected request includes:

```http
Authorization: DPoP eyJ...
DPoP: eyJ...
Origin: https://app.example
```

The resource server validates:

- access-token signature, issuer, audience, expiry, subject, and scopes;
- the token's `cnf.jkt` against the proof public key thumbprint;
- proof `htm` and normalized `htu`;
- proof `iat` within a narrow clock window;
- unique `jti` in a replay cache;
- `ath` against the access token;
- the current resource-server nonce when required;
- account and service binding after DID resolution;
- requested operation against the granted permission set.

### 4.4 Bind browser sessions to the approved origin

CORS is not authorization. It only controls browser access to responses.

For a static client session, the authorization server should record the expected application origin from the resolved client metadata and the selected redirect URI. The resource server can require the HTTP `Origin` header to match that origin for browser-class sessions. Non-browser clients receive a different session classification and policy.

This origin binding is an OpenDrop defense-in-depth extension. It reduces accidental use of a browser token from another origin but does not protect against script execution within the approved origin.

### 4.5 Required CORS behavior

The storage host needs precise CORS support for client origins approved by the OAuth grant:

```http
Access-Control-Allow-Origin: https://app.example
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, DPoP, Content-Type, If-Match, Idempotency-Key
Access-Control-Expose-Headers: DPoP-Nonce, WWW-Authenticate, ETag, Atproto-Repo-Rev, OpenDrop-Cursor
Cache-Control: no-store
```

`DPoP-Nonce` and `WWW-Authenticate` must be exposed so browser code can perform nonce retries and handle authorization errors.

### 4.6 DPoP does not solve XSS

DPoP prevents a stolen token from being replayed without its key. It does not protect a page after malicious JavaScript is executing in the approved origin. Such code can make requests through the legitimate client and may be able to ask the non-extractable key to sign proofs.

Static applications therefore require:

- strict Content Security Policy;
- no inline scripts unless nonce or hash protected;
- no `eval` or dynamic code compilation;
- Trusted Types where available;
- Subresource Integrity for external assets;
- dependency and release pinning;
- immutable deployments;
- narrow OAuth scopes;
- plugin isolation for uploaded or third-party code.

---

## 5. Static application architecture

### 5.1 Direct application mode

For trusted application code, the page imports the OpenDrop browser SDK and talks directly to the Pod:

```ts
import { PodClient } from "@opendrop/pod-client";

const pod = await PodClient.connect({
  account: "alice.example",
  clientId: new URL("/oauth-client.json", location.href).href,
  localReplica: true,
});

await pod.authorize({
  permissionSet: "dev.example.greenhouse.auth",
});

const readings = pod.space("greenhouse").stream("readings");

await readings.append({
  $type: "dev.example.greenhouse.reading",
  temperatureC: 21.7,
  humidityRatio: 0.48,
});

for await (const event of readings.follow({ cursor: "stored" })) {
  updateChart(event);
}
```

The SDK owns discovery, OAuth, DPoP proofs, retries, cursor storage, local caching, and conflict handling.

### 5.2 Capability shell mode for uploaded scripts

Uploaded scripts should not automatically receive raw OAuth tokens or DPoP key access.

A safer site runtime is:

```text
site shell
├── OAuth and DPoP session
├── local replica
├── permission broker
├── realtime feed
└── plugin host
       ├── sandboxed iframe
       ├── Web Worker
       └── WASM component
```

Plugins receive a `MessagePort` capability rather than credentials:

```ts
const readings = await capability.openStream("readings", {
  actions: ["read", "subscribe"],
});

for await (const event of readings) {
  render(event);
}
```

The shell enforces the site manifest and OAuth grant. A plugin cannot enumerate unrelated spaces, obtain the refresh token, alter the permission broker, or access the DPoP key.

This object-capability arrangement is a useful PARC-like property: live documents are programmable, but authority is passed as explicit objects rather than ambient global power.

### 5.3 SharedWorker as the browser data agent

A `SharedWorker` should coordinate all tabs for one application origin:

- one OAuth session manager;
- one DPoP key handle;
- one realtime connection per Pod/account;
- local record and stream cache;
- cursor persistence;
- offline mutation outbox;
- tab-to-tab change broadcasts;
- request deduplication.

Tabs communicate with the worker through `MessagePort`. A `BroadcastChannel` fallback can support browsers or contexts where `SharedWorker` is unavailable.

A service worker handles static asset caching and offline boot, but should not be treated as a permanently running feed process because browsers may suspend it.

### 5.4 Local AppView

ATproto separates repositories from AppViews because indexing, search, and aggregation are application-specific. OpenDrop can remove most application servers by moving the AppView into the browser.

The static application maintains a local authorized replica in IndexedDB or OPFS and incrementally applies feed events. It can then query locally using:

- indexed JavaScript collections for small applications;
- SQLite compiled to WebAssembly;
- DuckDB-Wasm for analytical scans;
- Parquet segments fetched with HTTP range requests;
- user-provided deterministic view modules.

This enables:

- instant UI reads;
- offline use;
- local full-text search;
- local joins and aggregates;
- lower storage-server query load;
- private computation without uploading intermediate results;
- reproducible views tied to a snapshot cursor.

The storage server may still offer bounded queries and rollups for large datasets, but ordinary applications should not require a separately operated AppView.

### 5.5 Initial synchronization

A local replica starts with:

1. an authenticated snapshot request constrained to granted spaces and collections;
2. a snapshot watermark/cursor;
3. a stream connection starting after that cursor;
4. atomic application of snapshot then live events;
5. persistence of the latest committed cursor.

Snapshot formats can include:

- CAR for public repo content;
- an OpenDrop CBOR sequence for private records;
- Parquet for large immutable stream ranges;
- a manifest referencing content-addressed blocks.

The client must never fetch a snapshot and start a live feed without a shared watermark, or it risks missing writes between the two operations.

### 5.6 Offline writes

Offline mutations enter a durable browser outbox:

```text
mutation ID
space
operation
record path or stream
base CID / base revision
payload
idempotency key
created time
retry state
```

On reconnect, the SharedWorker sends mutations in order. The server provides at-least-once request handling with idempotency keys.

Conflicting record writes return the current CID and record. The application chooses a strategy:

- last writer wins;
- user-visible merge;
- schema-specific merge function;
- CRDT document type;
- reject and preserve both versions.

Stream appends normally do not conflict.

---

## 6. Realtime transport

### 6.1 Canonical browser transport: authenticated fetch stream

The default realtime transport should be a streaming `fetch()` response, not native `EventSource` and not browser WebSocket.

```http
GET /xrpc/io.opendrop.sync.subscribe?space=greenhouse&cursor=018442
Authorization: DPoP eyJ...
DPoP: eyJ...
Accept: application/cbor-seq
```

The browser can attach the required `Authorization` and `DPoP` headers, read exposed nonce headers, and consume `response.body` as a `ReadableStream`.

Recommended encodings:

- `application/cbor-seq` for compact binary clients;
- `application/x-ndjson` for easy debugging;
- optionally `text/event-stream` parsed through `fetch`, not `EventSource`.

A stream begins with a control frame:

```json
{
  "$type": "io.opendrop.sync.hello",
  "subscription": "01J...",
  "cursor": "018442",
  "heartbeatMs": 25000,
  "snapshotRequired": false
}
```

Subsequent frame types include:

```text
recordCommit   collection record mutations and new revision
streamAppend   one or more appended events
blobReady      an uploaded blob became readable
invalidate     local view or snapshot should be refreshed
policy         permission changed or session is ending
heartbeat      liveness and current high-water mark
error          terminal or recoverable stream error
```

### 6.2 Cursor semantics

Every subscription frame has a monotonically increasing cursor within its authorization domain. A client reconnects with its last committed cursor.

The server retains replayable feed history for a configured window. If the cursor is too old, the server returns `snapshotRequired` and a current snapshot endpoint/watermark.

For private feeds, prefer per-account or per-space cursor domains. A globally visible sequence can leak unrelated tenant activity through gaps and timing.

### 6.3 Backpressure

The server must not keep an unbounded buffer for a slow browser.

- batch small events;
- cap queued bytes per subscriber;
- let HTTP stream flow control provide network backpressure;
- when the subscriber falls beyond the retained window, end with a resumable error;
- require a snapshot when incremental recovery is no longer possible.

### 6.4 WebSocket compatibility

WebSockets remain useful for existing tools and genuinely bidirectional protocols. A browser cannot add arbitrary `Authorization` and `DPoP` headers through the standard `WebSocket` constructor, so direct DPoP authentication of the upgrade is not portable.

Use a two-step ticket flow:

1. The browser makes a normal DPoP-authenticated HTTP request:

```http
POST /xrpc/io.opendrop.live.createTicket
Authorization: DPoP eyJ...
DPoP: eyJ...
Content-Type: application/json

{
  "space": "greenhouse",
  "streams": ["readings", "alerts"],
  "cursor": "018442",
  "format": "cbor"
}
```

2. The Pod returns an opaque, one-use, short-lived ticket bound to:

```text
account DID
OAuth session
DPoP public-key thumbprint
client ID
approved Origin
subscription filter
cursor
expiry
random nonce
```

3. The browser opens:

```ts
const ws = new WebSocket(
  `wss://pod.example/xrpc/io.opendrop.live.subscribe?ticket=${encodeURIComponent(ticket)}`,
  "opendrop.cbor.v1",
);
```

4. The upgrade handler validates the `Origin`, atomically consumes the ticket, confirms the OAuth session is active, and applies the exact pre-authorized filter.

The ticket is intentionally not a reusable bearer access token. It expires quickly and becomes invalid at first use. Query-string logging should still be disabled or redacted.

For stronger channel binding, the server can send a challenge as the first frame and require a signature from the same DPoP key before releasing data. This is an OpenDrop channel-proof extension, not RFC 9449 DPoP itself.

### 6.5 Non-browser clients

CLI, native, and server clients may authenticate the WebSocket HTTP upgrade with ordinary headers because their WebSocket libraries commonly support custom headers. They should still use the same ticket flow when consistency is more important than avoiding one HTTP round trip.

---

## 7. XRPC and Lexicon surface

### 7.1 Standard endpoints to retain

Where possible, implement standard endpoints such as:

```text
com.atproto.repo.getRecord
com.atproto.repo.listRecords
com.atproto.repo.createRecord
com.atproto.repo.putRecord
com.atproto.repo.deleteRecord
com.atproto.repo.applyWrites
com.atproto.repo.uploadBlob
com.atproto.sync.getRepo
com.atproto.sync.subscribeRepos
```

These apply to the public repository and public blobs under standard ATproto semantics.

### 7.2 OpenDrop storage endpoints

Proposed private extension:

```text
io.opendrop.space.list
io.opendrop.space.get
io.opendrop.space.create
io.opendrop.space.updateMembers

io.opendrop.vault.getRecord
io.opendrop.vault.listRecords
io.opendrop.vault.applyWrites

io.opendrop.stream.append
io.opendrop.stream.appendBatch
io.opendrop.stream.read
io.opendrop.stream.list

io.opendrop.blob.beginUpload
io.opendrop.blob.completeUpload
io.opendrop.blob.get

io.opendrop.sync.getSnapshot
io.opendrop.sync.subscribe
io.opendrop.sync.getCursorStatus

io.opendrop.live.createTicket

io.opendrop.site.publish
io.opendrop.site.getRelease
io.opendrop.site.listReleases

io.opendrop.session.list
io.opendrop.session.revoke
```

Every endpoint is defined by a Lexicon. Browser SDK types are generated from those Lexicons.

### 7.3 Batch writes

Static applications need atomic multi-record updates:

```json
{
  "space": "greenhouse",
  "baseRevision": "3m...",
  "writes": [
    {
      "action": "put",
      "collection": "dev.example.greenhouse.settings",
      "rkey": "main",
      "record": {
        "$type": "dev.example.greenhouse.settings",
        "frostThresholdC": 3
      }
    },
    {
      "action": "append",
      "stream": "audit",
      "event": {
        "$type": "dev.example.greenhouse.settingChanged",
        "field": "frostThresholdC"
      }
    }
  ]
}
```

The record mutation, stream append, revision update, and feed outbox entry commit in one database transaction.

### 7.4 Reads and field filtering

Private record reads should support only bounded, indexed operations in the storage service:

- exact record lookup;
- collection scan by record key;
- updated-time range;
- stream sequence and time range;
- declared secondary indexes;
- projection of allowed fields;
- fixed limits and cursor pagination.

Arbitrary relational queries belong in the local AppView or an optional analytical service. Keeping the storage API predictable is what allows it to remain a storage service rather than becoming every application's backend.

---

## 8. Site and script packaging

### 8.1 Site manifest

```json
{
  "$type": "io.opendrop.site.release",
  "name": "greenhouse-console",
  "version": "2026.07.23.1",
  "entry": {
    "cid": "bafy...",
    "path": "index.html"
  },
  "assets": [
    {"path": "app.js", "cid": "bafy...", "sha256": "..."},
    {"path": "app.css", "cid": "bafy...", "sha256": "..."}
  ],
  "oauth": {
    "permissionSet": "dev.example.greenhouse.auth",
    "redirectPath": "/oauth/callback"
  },
  "replicas": [
    {
      "name": "greenhouse",
      "space": "greenhouse",
      "collections": ["dev.example.greenhouse.*"],
      "streams": ["readings", "alerts"]
    }
  ],
  "runtime": {
    "plugins": "worker-capabilities",
    "allowEval": false
  },
  "csp": {
    "connectSrc": ["https://pod.example", "wss://pod.example"],
    "imgSrc": ["'self'", "blob:"]
  }
}
```

Wildcard collection declarations are expanded and approved at publish time; an OAuth authorization screen should show concrete human-readable access.

### 8.2 Publishing

```bash
od site publish ./site \
  --account alice.example \
  --name greenhouse-console
```

Publishing:

1. builds the static project;
2. computes content hashes;
3. validates CSP and OAuth metadata;
4. resolves the permission set;
5. uploads blobs;
6. writes an immutable site-release record;
7. optionally updates a public alias record;
8. returns a content-addressed and friendly URL.

### 8.3 Portable live documents

A release may bundle:

- static assets;
- Lexicons;
- local indexes;
- local view modules;
- Web Components;
- sample fixtures;
- migration code;
- data capability declarations.

This is a portable application capsule. The application behavior lives in static code and local computations; the Pod supplies identity, durable data, and change streams.

### 8.4 Public pages

A public static page has three safe options:

1. read public ATproto repo records without authentication;
2. read a space explicitly marked public through cacheable anonymous endpoints;
3. use a narrowly scoped, revocable publication capability exchanged for a short-lived read token.

Never embed an owner's OAuth access or refresh token in a page bundle.

---

## 9. Storage-server implementation

### 9.1 Single-process product

The initial server can remain one deployable process:

```text
dropd
├── OAuth authorization server
├── DPoP verifier and nonce service
├── DID/account service
├── public repo service
├── private space service
├── stream service
├── blob service
├── snapshot/export service
├── realtime feed service
├── static asset gateway
└── account console
```

It may use PostgreSQL and S3-compatible object storage in production, or SQLite and a local object directory for a personal single-node installation.

### 9.2 Suggested tables

```text
accounts
  did, handle, status, pds_endpoint, created_at

oauth_sessions
  id, did, client_id, origin, jkt, scopes, refresh_hash,
  expires_at, revoked_at, auth_nonce, resource_nonce

public_repos
  did, revision, root_cid, signed_commit, updated_at

public_records
  did, collection, rkey, cid, value_cbor, created_at, updated_at

repo_blocks
  cid, bytes, ref_count

spaces
  id, owner_did, name, visibility, revision, created_at

space_members
  space_id, principal_did, role, constraints

private_records
  space_id, collection, rkey, cid, value_cbor,
  version, created_at, updated_at

streams
  space_id, name, schema_nsid, next_sequence, retention_policy

stream_events
  space_id, stream, sequence, event_id, event_time,
  ingest_time, producer_did, cid, value_cbor, idempotency_key

blobs
  owner_did, space_id, cid, size, mime_type, object_key, state

outbox
  cursor_domain, cursor, account_did, space_id, kind, payload_cbor, created_at

feed_leases
  subscription_id, session_id, cursor_domain, last_cursor, expires_at

websocket_tickets
  ticket_hash, session_id, jkt, origin, filter_cbor,
  cursor, expires_at, consumed_at

site_releases
  account_did, name, version, manifest_cid, created_at
```

### 9.3 Mutation transaction

For every authorized mutation:

1. validate access token and DPoP proof;
2. resolve effective permission and space membership;
3. validate Lexicon and size limits;
4. check idempotency key;
5. check base CID/revision when supplied;
6. write records or events;
7. update repo/space revision;
8. append a durable outbox event with cursor;
9. commit the transaction;
10. notify live subscribers.

The feed is derived from the transactional outbox, not from best-effort in-memory notifications. A process restart may interrupt connections but cannot lose the ability to replay committed updates.

### 9.4 Brokerless realtime

A small deployment does not need Kafka or NATS.

- PostgreSQL stores the durable outbox.
- `LISTEN/NOTIFY` or an in-process signal wakes feed workers.
- Subscribers replay from the outbox table using cursors.
- Old outbox rows are compacted after the replay window.
- Large installations can place JetStream or another broker behind the same cursor contract.

### 9.5 Stream segment compaction

For high-volume streams:

1. recent events remain row-addressable in PostgreSQL;
2. a compactor writes immutable Parquet or CBOR-sequence segments;
3. each segment receives a content hash and time/sequence bounds;
4. a stream manifest references sealed segments;
5. old rows can be removed according to retention;
6. browser analytical clients query segments directly with range requests;
7. realtime subscribers continue from the recent outbox.

This keeps the live storage path simple while allowing large historical datasets without an application server.

---

## 10. Security model

### 10.1 Primary threats

| Threat | Required control |
|---|---|
| Stolen access token | DPoP binding, short lifetime, nonce support |
| Stolen refresh token | DPoP-bound rotating refresh token, revocation |
| DPoP proof replay | `jti` cache, narrow `iat`, nonce |
| XSS in static app | CSP, Trusted Types, SRI, immutable releases, narrow scopes |
| Malicious uploaded plugin | worker/iframe isolation and capability RPC |
| Overbroad static-app consent | resolved permission sets and precise consent UI |
| WebSocket ticket theft | TLS, one-use ticket, short TTL, origin binding, optional channel proof |
| Cross-origin misuse | exact CORS allowlist plus browser-session origin binding |
| Private data entering public repo | separate APIs and storage classes, explicit publication action |
| Feed policy bypass | filter before serialization, revoke active subscriptions immediately |
| Tenant activity leakage | per-space/account cursors and bounded error detail |
| Offline duplicate writes | idempotency keys and mutation receipts |
| Confused account/PDS binding | full DID, resource-server, and issuer verification |
| Supply-chain compromise | signed/content-addressed releases and dependency pinning |
| Unbounded browser memory | feed backpressure, batch limits, local retention |

### 10.2 Authorization is checked continuously

A long-lived feed does not retain authorization forever. The server rechecks session and grant state:

- at connection;
- when a grant, membership, or account status changes;
- periodically for long connections;
- before serializing events whose policy differs;
- on token/session expiry.

Revocation produces a terminal `policy` frame and closes the stream.

### 10.3 Data publication is explicit

Moving data from a private space into the public repo is a separate operation with a clear confirmation boundary. It should create a provenance record identifying:

- source private record or snapshot;
- published record CID;
- publisher DID;
- time;
- transformation, if any;
- whether future updates are linked or one-time.

No private collection should become public merely because its Lexicon or site manifest is public.

---

## 11. Developer experience

### 11.1 Browser

```ts
const app = await OpenDropApp.start({
  clientMetadata: "/oauth-client.json",
  accountHint: "alice.example",
});

const space = await app.openSpace("greenhouse");
const local = await space.replicate({
  collections: ["dev.example.greenhouse.sensor"],
  streams: ["readings"],
});

const latest = await local.query(
  "select * from readings order by sequence desc limit 100"
);

local.on("change", render);
```

### 11.2 CLI

The CLI uses the same OAuth/DPoP and XRPC surface:

```bash
od login alice.example
od space create greenhouse --private
od stream create greenhouse/readings \
  --schema dev.example.greenhouse.reading

printf '{"temperatureC":21.7}' |
  od stream append greenhouse/readings --stdin

od stream follow greenhouse/readings --cursor stored
od snapshot export greenhouse --output greenhouse.odcar
od site publish ./dashboard --space greenhouse
```

A CLI login can use a system browser authorization flow and store its DPoP key in the operating-system keychain.

### 11.3 Plain HTML

```html
<script type="module">
  import { connect } from "https://cdn.example/opendrop.js";

  const pod = await connect({
    clientId: new URL("/oauth-client.json", location.href).href,
  });

  document.querySelector("#login").onclick = () =>
    pod.login(document.querySelector("#handle").value);

  const table = document.querySelector("#readings");
  for await (const event of pod.follow("greenhouse", "readings")) {
    table.prepend(renderRow(event));
  }
</script>
```

The simple path should not require React, a backend framework, a message broker, or a deployment manifest.

---

## 12. Recommended implementation sequence

### Phase A: browser identity and public records

- ATproto OAuth profile with PKCE, PAR, and DPoP;
- DID/handle resolution;
- browser SDK session store;
- public repo record APIs;
- blob upload;
- exact CORS and nonce behavior;
- account session console.

### Phase B: private spaces

- space and membership model;
- private record APIs;
- Lexicon validation;
- optimistic concurrency;
- export/import;
- RPC-based permission sets.

### Phase C: authenticated fetch feeds

- transactional outbox;
- resumable cursors;
- NDJSON and CBOR-sequence stream encodings;
- snapshot-plus-cursor synchronization;
- browser SharedWorker client;
- revocation and backpressure behavior.

### Phase D: static application runtime

- local IndexedDB replica;
- offline outbox;
- generated TypeScript SDK;
- site release manifest;
- immutable blob-hosted sites;
- CSP generation;
- local query adapter.

### Phase E: WebSocket and plugin compatibility

- DPoP-authenticated ticket issuance;
- one-use WebSocket upgrades;
- optional channel proof;
- sandboxed worker/iframe plugin host;
- capability RPC;
- multi-tab feed sharing.

### Phase F: large streams

- stream retention policies;
- Parquet/CBOR segment compaction;
- content-addressed manifests;
- browser DuckDB-Wasm examples;
- bounded server-side rollups where required.

---

## 13. Decisions to freeze early

1. **Public ATproto repo and private OpenDrop storage are separate planes.**
2. **Static browser clients use the ATproto OAuth profile and DPoP.**
3. **The canonical browser feed is authenticated streaming `fetch()`.**
4. **WebSockets use a DPoP-issued, one-use ticket because the browser API cannot set the required headers.**
5. **A local browser replica is the default AppView for ordinary static applications.**
6. **The server offers bounded storage queries, not arbitrary application SQL.**
7. **Uploaded plugins receive object capabilities, not OAuth tokens.**
8. **Every durable mutation and feed event shares one transactional commit boundary.**
9. **Private feed cursors do not leak global tenant activity.**
10. **High-rate streams are not represented as one public MST record per sample.**
11. **A static site release is immutable and content-addressed.**
12. **Publication from private storage into the public repo is explicit and auditable.**

---

## 14. What the system feels like

For an application author:

```text
write static files
publish them anywhere
ask the user for their handle
request narrowly described data access
read and write their Pod directly
subscribe to changes
query a local replica
```

For the user:

```text
my identity chooses my storage host
my data is not trapped in each application
I approve what a page can access
I can revoke it later
I can move my account or export a space
multiple static applications can work over the same data
```

For the operator:

```text
run one storage service
store records, streams, and blobs
verify DPoP
commit an outbox
serve resumable feeds
avoid hosting every application's custom backend
```

The larger idea is that the Pod becomes a small personal network operating system. Static pages are executable views over user-owned data; the local browser replica is a personal AppView; realtime feeds provide shared change; and authority is represented as explicit, revocable capabilities.

---

## 15. References

- AT Protocol, **Repository**: https://atproto.com/specs/repository
- AT Protocol, **Sync**: https://atproto.com/specs/sync
- AT Protocol, **Event Stream**: https://atproto.com/specs/event-stream
- AT Protocol, **OAuth**: https://atproto.com/specs/oauth
- AT Protocol, **OAuth Patterns**: https://atproto.com/guides/oauth-patterns
- AT Protocol, **Permissions**: https://atproto.com/specs/permission
- AT Protocol, **Lexicon**: https://atproto.com/specs/lexicon
- AT Protocol, **XRPC**: https://atproto.com/specs/xrpc
- IETF RFC 9449, **OAuth 2.0 Demonstrating Proof of Possession**: https://www.rfc-editor.org/rfc/rfc9449
- MDN, **WebSocket constructor**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket
- MDN, **Cross-Origin Resource Sharing**: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
