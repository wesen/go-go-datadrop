// The data layer: RTK Query over the datadrop v1 API.
//
// Every endpoint here is a GET. The workbench reads and never writes, which is
// what makes the auth model below safe: a compromised bundle can read exactly
// what the token could already read, and can write nothing.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SourceRef, Table } from "../model/table";

/**
 * Where the bearer token lives.
 *
 * sessionStorage, not localStorage: a credential that outlives the tab is a
 * credential that outlives the user's attention. And no cookie is ever set, so
 * no request is ever ambiently authenticated — which is why the read-only UI
 * cannot introduce a CSRF surface onto the mutating endpoints it never calls.
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

export const api = createApi({
  reducerPath: "datadrop",
  baseQuery: fetchBaseQuery({
    baseUrl: "/v1",
    // No `credentials` option, deliberately: the browser must not attach
    // cookies to these requests, because there are none and there must be none.
    prepareHeaders: (headers) => {
      const token = readToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  endpoints: (build) => ({
    listDrops: build.query<{ drops: DropSummary[] }, void>({
      query: () => "/drops",
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
