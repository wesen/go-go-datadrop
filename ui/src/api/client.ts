// The data layer: RTK Query over the datadrop v1 API.
//
// The chart workbench reads and never writes. DATADROP-5 added exactly six
// mutations, none of them in the workbench: minting and revoking an API token,
// signing out, and the three-step dataset upload. That set is pinned by
// test/api-surface.test.ts — a change-detector by design, because this is a
// security boundary and the desired behaviour when someone adds a seventh is
// that a test fails and a human looks (DR-27).
//
// So a compromised bundle can read what the caller could already read, and can
// write only through those six. Everything about sources, tables, charts,
// pipelines and snapshots remains read-only.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SourceRef, Table } from "../model/table";

/**
 * Where the static bearer token lives, in `--auth=token` deployments.
 *
 * sessionStorage, not localStorage: a credential that outlives the tab is a
 * credential that outlives the user's attention.
 *
 * In `--auth=oidc` deployments there is no token here at all. The credential is
 * an HttpOnly session cookie this code cannot read, set by the server's
 * backend-for-frontend flow — which means an XSS bug can make requests while
 * the page is open but cannot exfiltrate a credential (DR-19).
 *
 * A cookie IS an ambient credential, so it does reintroduce the CSRF surface
 * this comment used to say we had eliminated. That is paid for on the server:
 * every unsafe method authenticated by cookie must carry an Origin matching the
 * configured external URL, checked inside authorizeDrop so it cannot be
 * forgotten on a new endpoint (DR-21).
 */
const TOKEN_KEY = "datadrop-token";

export function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    // Private browsing modes can throw on storage access. A workbench with no
    // token still works against a public-read drop.
    return "";
  }
}

export function writeToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore: see readToken */
  }
}

export interface DropSummary {
  name: string;
  created_at: string;
  public_read?: boolean;
  retention?: string;
  /** Empty for a drop that predates DATADROP-5, or one created by the root token. */
  owner_id?: string;
  /**
   * The caller's effective role, computed server-side.
   *
   * It exists so the UI can grey out an action it knows will 403 rather than
   * offering it and failing — the same principle as a disabled menu entry
   * showing the rule instead of hiding it.
   */
  your_role?: "reader" | "writer" | "admin" | "";
}

export interface StreamInfo {
  stream: string;
  sequence: number;
  event_count: number;
  last_received_at?: string;
}

export interface DatasetFile {
  path: string;
  digest: string;
  size_bytes: number;
  media_type?: string;
}

export interface DatasetVersion {
  drop: string;
  dataset: string;
  version: number;
  state: "draft" | "committed";
  file_count: number;
  total_bytes: number;
  created_at: string;
  committed_at?: string;
  files?: DatasetFile[];
}

export interface DatasetSummary {
  drop: string;
  name: string;
  created_at: string;
  versions?: DatasetVersion[];
}

export interface StreamTableArgs {
  drop: string;
  stream: string;
  limit: number;
  order?: "asc" | "desc";
  from?: string;
  to?: string;
}

export interface DatasetTableArgs {
  drop: string;
  dataset: string;
  version: number | "latest";
  path: string;
  limit: number;
  format?: string;
}

export interface MeUser {
  id: string;
  email?: string;
  name?: string;
  created_at: string;
}

export interface ProviderLinks {
  issuer: string;
  account_url: string;
  sign_in_url: string;
  sign_up_url: string;
}

/** What GET /v1/me answers. Never 401s: anonymous gets an anonymous answer. */
export interface Me {
  auth_mode: "none" | "token" | "oidc";
  authenticated: boolean;
  kind: "anonymous" | "root" | "session" | "token";
  user?: MeUser;
  scopes: string[];
  token_id?: string;
  signup_enabled: boolean;
  provider?: ProviderLinks;
}

/** An API token as the API reports it. Structurally cannot carry a secret. */
export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  revoked_at?: string;
}

/** The ONE response in the whole API that carries a secret (DR-28). */
export interface CreatedToken extends ApiToken {
  token: string;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent?: string;
  ip?: string;
}

export const api = createApi({
  reducerPath: "datadrop",
  baseQuery: fetchBaseQuery({
    baseUrl: "/v1",
    // "same-origin", never "include". The SPA is served from the same origin as
    // the API (pkg/webui mounts at /ui on the API server), so this attaches the
    // session cookie to our own requests and to nothing else.
    credentials: "same-origin",
    prepareHeaders: (headers) => {
      // Still supported: a static token in --auth=token mode. A bearer beats a
      // cookie server-side, so presenting both is well defined.
      const token = readToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Me", "Tokens", "Sessions"],
  endpoints: (build) => ({
    listDrops: build.query<{ drops: DropSummary[] }, void>({
      query: () => "/drops",
    }),

    // ── accounts (DATADROP-5) ───────────────────────────────────────────────
    me: build.query<Me, void>({
      query: () => "/me",
      providesTags: ["Me"],
    }),
    listTokens: build.query<{ tokens: ApiToken[] }, boolean | void>({
      query: (includeRevoked) =>
        includeRevoked ? "/me/tokens?include_revoked=true" : "/me/tokens",
      providesTags: ["Tokens"],
    }),
    createToken: build.mutation<
      CreatedToken,
      { name: string; scopes: string[]; expires_in?: string }
    >({
      query: (body) => ({ url: "/me/tokens", method: "POST", body }),
      // Deliberately no cache entry for the response: it carries the only copy
      // of the secret, and a cached secret is a secret in the Redux store,
      // which is a secret in localStorage the moment anyone persists it.
      invalidatesTags: ["Tokens"],
    }),
    revokeToken: build.mutation<void, string>({
      query: (id) => ({ url: `/me/tokens/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: ["Tokens"],
    }),
    listSessions: build.query<{ sessions: SessionInfo[] }, void>({
      query: () => "/me/sessions",
      providesTags: ["Sessions"],
    }),
    signOut: build.mutation<void, { global?: boolean } | void>({
      query: (args) => ({
        url: args && args.global ? "/auth/logout?global=1" : "/auth/logout",
        method: "POST",
      }),
      invalidatesTags: ["Me", "Tokens", "Sessions"],
    }),
    listStreams: build.query<{ streams: StreamInfo[] }, string>({
      query: (drop) => `/drops/${encodeURIComponent(drop)}/streams`,
    }),
    listDatasets: build.query<{ datasets: DatasetSummary[] }, string>({
      query: (drop) => `/drops/${encodeURIComponent(drop)}/datasets`,
    }),
    getDataset: build.query<DatasetSummary, { drop: string; dataset: string }>({
      query: ({ drop, dataset }) =>
        `/drops/${encodeURIComponent(drop)}/datasets/${encodeURIComponent(dataset)}`,
    }),
    getDatasetVersion: build.query<
      DatasetVersion,
      { drop: string; dataset: string; version: number | "latest" }
    >({
      query: ({ drop, dataset, version }) =>
        `/drops/${encodeURIComponent(drop)}/datasets/${encodeURIComponent(dataset)}/versions/${version}`,
    }),
    streamTable: build.query<Table, StreamTableArgs>({
      query: ({ drop, ...params }) => ({
        url: `/drops/${encodeURIComponent(drop)}/table`,
        params,
      }),
    }),
    datasetTable: build.query<Table, DatasetTableArgs>({
      query: ({ drop, dataset, version, ...params }) => ({
        url: `/drops/${encodeURIComponent(drop)}/datasets/${encodeURIComponent(dataset)}/versions/${version}/table`,
        params,
      }),
    }),
  }),
});

export const {
  useMeQuery,
  useListTokensQuery,
  useCreateTokenMutation,
  useRevokeTokenMutation,
  useListSessionsQuery,
  useSignOutMutation,
  useListDropsQuery,
  useListStreamsQuery,
  useListDatasetsQuery,
  useGetDatasetQuery,
  useGetDatasetVersionQuery,
  useStreamTableQuery,
  useDatasetTableQuery,
} = api;

/** The SSE URL a live tail subscribes to. */
export function streamURL(source: SourceRef, after: number): string {
  const params = new URLSearchParams({
    stream: source.stream ?? "events",
    after: String(after),
  });
  return `/v1/drops/${encodeURIComponent(source.drop)}/events/stream?${params}`;
}
