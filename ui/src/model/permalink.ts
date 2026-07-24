// Sharing a chart: the whole specification, encoded into the URL fragment.
//
// The fragment, not a query parameter, for one specific reason: fragments are
// never sent to the server, so a shared link cannot deposit a filter value —
// which may be a patient identifier or an internal hostname — into an access
// log. The spec carries a SourceRef and never a token.

import type { ChartSpec } from "./chart";

const KEY = "chart";

/** base64url, so the fragment survives copy-paste and does not need escaping. */
function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSpec(spec: ChartSpec): string {
  return encodeBase64Url(JSON.stringify(spec));
}

/**
 * Decode a spec, or null.
 *
 * A malformed fragment — hand-edited, truncated by a chat client, produced by a
 * future version — must open an empty workbench, not a blank screen. Every
 * failure path here returns null rather than throwing.
 */
export function decodeSpec(encoded: string): ChartSpec | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(encoded));
    if (!parsed || typeof parsed !== "object") return null;
    const spec = parsed as Partial<ChartSpec>;
    if (!spec.source || !spec.mapping || !spec.geom) return null;
    return {
      source: spec.source,
      steps: Array.isArray(spec.steps) ? spec.steps : [],
      geom: spec.geom,
      mapping: spec.mapping,
      yScale: spec.yScale === "log" ? "log" : "linear",
      typeOverrides: spec.typeOverrides,
    };
  } catch {
    return null;
  }
}

/** Read a spec out of a location hash such as "#chart=eyJ…". */
export function specFromHash(hash: string): ChartSpec | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const encoded = params.get(KEY);
  return encoded ? decodeSpec(encoded) : null;
}

export function hashForSpec(spec: ChartSpec): string {
  return `#${KEY}=${encodeSpec(spec)}`;
}

/**
 * Write the spec into the address bar.
 *
 * replaceState, not pushState: changing a dropdown should not add a back-button
 * entry, or the back button becomes an undo stack nobody asked for.
 */
export function syncHash(spec: ChartSpec): void {
  const next = hashForSpec(spec);
  if (typeof window === "undefined" || window.location.hash === next) return;
  window.history.replaceState(null, "", next);
}
