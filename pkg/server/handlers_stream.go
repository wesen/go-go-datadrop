package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// heartbeatInterval bounds how long an idle SSE connection stays silent.
// Without periodic traffic, proxies and NAT tables reap the connection.
const heartbeatInterval = 15 * time.Second

// handleStreamEvents serves the live SSE feed for one stream.
//
// The handler is "replay history, then tail live", and both halves share one
// cursor. The ordering constraints are subtle enough to spell out:
//
//  1. Subscribe to the hub BEFORE replaying from the store. Replaying first
//     would lose any event committed between the two steps.
//  2. Because of (1) the replay and the live tail can overlap, so live events
//     at or below the cursor are skipped rather than delivered twice.
//  3. Flush after every frame, or Go's response buffering holds the data until
//     the buffer fills and the stream appears dead.
func (s *Server) handleStreamEvents(w http.ResponseWriter, r *http.Request) {
	dropName, ok := pathName(w, r, "drop", "name")
	if !ok {
		return
	}
	if _, ok := s.authorizeDrop(w, r, dropName, auth.RoleReader, auth.ScopeDropsRead); !ok {
		return
	}

	streamName := datadrop.NormalizeStream(r.URL.Query().Get("stream"))
	if err := datadrop.ValidateName("stream", streamName); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	if _, err := s.store.GetDrop(r.Context(), dropName); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeProblem(w, r, http.StatusInternalServerError, CodeStreamUnavailable,
			"HTTP streaming is unavailable on this connection")
		return
	}

	cursor, ok := s.streamCursor(w, r)
	if !ok {
		return
	}

	// Step 1: subscribe first, so nothing committed during the replay is lost.
	events, cancel := s.hub.Subscribe(dropName, streamName)
	defer cancel()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	// Defeat proxy response buffering, which would otherwise hold frames.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	// Tell the browser's EventSource how soon to retry after a disconnect.
	if _, err := fmt.Fprint(w, "retry: 3000\n\n"); err != nil {
		return
	}
	flusher.Flush()

	// Step 2: replay everything already durable, advancing the cursor.
	if !s.replayHistory(w, r, flusher, dropName, streamName, &cursor) {
		return
	}

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	// Step 3: tail.
	for {
		select {
		case <-r.Context().Done():
			return

		case e, open := <-events:
			if !open {
				// Evicted by the hub for falling behind. Tell the client where
				// it got to so it can resume from the durable table.
				writeSSEEvent(w, "reset", 0, map[string]any{
					"reason": "slow_consumer",
					"cursor": cursor,
				})
				flusher.Flush()
				return
			}
			if e.Seq <= cursor {
				// Already delivered during the replay overlap.
				continue
			}
			if !writeSSEEvent(w, "append", e.Seq, e) {
				return
			}
			cursor = e.Seq
			flusher.Flush()

		case <-heartbeat.C:
			// A comment line is valid SSE and is ignored by clients.
			if _, err := fmt.Fprintf(w, ": heartbeat %d\n\n", cursor); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// streamCursor resolves the starting sequence from ?after= or, when a browser
// EventSource reconnects, from the Last-Event-ID header it resends
// automatically. The two are equivalent; the explicit parameter wins.
func (s *Server) streamCursor(w http.ResponseWriter, r *http.Request) (int64, bool) {
	raw := r.URL.Query().Get("after")
	if raw == "" {
		raw = r.Header.Get("Last-Event-ID")
	}
	if raw == "" {
		return 0, true
	}

	cursor, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest,
			"invalid cursor "+strconv.Quote(raw)+": expected an event sequence")
		return 0, false
	}
	return cursor, true
}

// replayHistory writes every durable event after *cursor, paging until caught
// up. It reports false when the connection or the query failed.
func (s *Server) replayHistory(
	w http.ResponseWriter, r *http.Request, flusher http.Flusher,
	dropName, streamName string, cursor *int64,
) bool {
	for {
		page, err := s.store.QueryEvents(r.Context(), datadrop.EventQuery{
			Drop:   dropName,
			Stream: streamName,
			After:  *cursor,
			Order:  datadrop.OrderAsc,
			Limit:  datadrop.MaxLimit,
		})
		if err != nil {
			log.Error().Err(err).
				Str("drop", dropName).Str("stream", streamName).
				Msg("failed to replay stream history")
			return false
		}

		for _, e := range page {
			if !writeSSEEvent(w, "append", e.Seq, e) {
				return false
			}
			*cursor = e.Seq
		}
		flusher.Flush()

		if len(page) < datadrop.MaxLimit {
			return true
		}
	}
}

// writeSSEEvent emits one SSE frame. The `id:` field carries the sequence,
// which is what browsers resend as Last-Event-ID on reconnect.
func writeSSEEvent(w http.ResponseWriter, name string, id int64, payload any) bool {
	encoded, err := json.Marshal(payload)
	if err != nil {
		log.Error().Err(err).Str("event", name).Msg("failed to encode SSE payload")
		return false
	}

	if _, err := fmt.Fprintf(w, "event: %s\n", name); err != nil {
		return false
	}
	if id > 0 {
		if _, err := fmt.Fprintf(w, "id: %d\n", id); err != nil {
			return false
		}
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", encoded); err != nil {
		return false
	}
	return true
}
