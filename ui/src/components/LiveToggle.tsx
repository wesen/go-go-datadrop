import { useEffect, useRef, useState } from "react";
import { readToken, streamURL } from "../api/client";
import type { Envelope } from "../model/live";
import type { Table } from "../model/table";

interface Props {
  table: Table | null;
  onEnvelope: (envelope: Envelope) => void;
}

/**
 * Subscribe a stream chart to SSE.
 *
 * EventSource cannot set an Authorization header. That is a hard browser
 * limitation rather than an oversight, and the honest response is to disable
 * the control and say why, not to smuggle the token into a query parameter
 * where it would land in server logs and browser history. A fetch-based SSE
 * reader lifts the restriction and is the recorded follow-up.
 */
export function LiveToggle({ table, onEnvelope }: Props) {
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const isStream = table?.source.kind === "stream";
  const tokenInUse = readToken() !== "";

  useEffect(() => {
    if (!live || !table || !isStream) return;

    const url = streamURL(table.source, table.next_after ?? 0);
    const es = new EventSource(url);
    sourceRef.current = es;
    setError(null);

    // The server names its frames "event: append" (pkg/server/handlers_stream.go),
    // and EventSource.onmessage fires only for UNNAMED frames. Listening on
    // onmessage produces a connection that opens, stays open, reports no error,
    // and delivers nothing — which is a great deal harder to notice than a
    // failure would be.
    es.addEventListener("append", (message) => {
      try {
        onEnvelope(JSON.parse((message as MessageEvent).data) as Envelope);
      } catch {
        // A malformed frame is one lost event, not a reason to tear down the
        // subscription.
      }
    });
    es.onerror = () => {
      setError(
        tokenInUse
          ? "the live stream closed — EventSource cannot present a bearer token, so this needs a public-read drop"
          : "the live stream closed; the browser will retry",
      );
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
    // next_after deliberately absent: re-subscribing on every arriving event
    // would tear down and rebuild the connection once per event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, isStream, table?.source.drop, table?.source.stream]);

  if (!isStream) return null;

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="form-check form-switch mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          id="live"
          checked={live}
          onChange={(event) => setLive(event.target.checked)}
        />
        <label className="form-check-label small" htmlFor="live">
          live
        </label>
      </div>
      {error && <span className="small text-warning-emphasis">{error}</span>}
    </div>
  );
}
