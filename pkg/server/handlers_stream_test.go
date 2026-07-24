package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// liveServer starts a real listener, because SSE needs a streaming connection
// that httptest.ResponseRecorder cannot provide (it buffers to completion).
func liveServer(t *testing.T) (*Server, string) {
	t.Helper()

	srv := newTestServer(t)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	ready := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		done <- srv.Serve(ctx, func(addr net.Addr) { ready <- addr.String() })
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("server did not shut down")
		}
	})

	select {
	case addr := <-ready:
		return srv, "http://" + addr
	case <-time.After(5 * time.Second):
		t.Fatal("server did not start")
		return nil, ""
	}
}

// sseFrame is one decoded frame from the wire.
type sseFrame struct {
	name string
	id   string
	data string
}

// readFrames reads exactly n frames or fails. It ignores comment lines, which
// is what heartbeats are.
func readFrames(t *testing.T, body *bufio.Reader, n int) []sseFrame {
	t.Helper()

	frames := make([]sseFrame, 0, n)
	current := sseFrame{}

	for len(frames) < n {
		line, err := body.ReadString('\n')
		if err != nil {
			t.Fatalf("read SSE stream after %d frames: %v", len(frames), err)
		}
		line = strings.TrimRight(line, "\n")

		switch {
		case line == "":
			if current.data != "" {
				frames = append(frames, current)
			}
			current = sseFrame{}
		case strings.HasPrefix(line, ":"):
			// heartbeat / comment
		case strings.HasPrefix(line, "event:"):
			current.name = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "id:"):
			current.id = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
		case strings.HasPrefix(line, "data:"):
			current.data = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}
	return frames
}

func openStream(t *testing.T, base, target string, header http.Header) *http.Response {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, base+target, nil)
	if err != nil {
		t.Fatalf("build stream request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	for name, values := range header {
		for _, value := range values {
			req.Header.Add(name, value)
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if contentType := resp.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatalf("Content-Type = %q, want text/event-stream", contentType)
	}
	if buffering := resp.Header.Get("X-Accel-Buffering"); buffering != "no" {
		t.Fatalf("X-Accel-Buffering = %q, want \"no\" so proxies do not hold frames", buffering)
	}
	return resp
}

// appendVia posts an event over HTTP and returns its sequence.
func appendVia(t *testing.T, base, drop, payload string) int64 {
	t.Helper()

	req, err := http.NewRequest(http.MethodPost,
		base+"/v1/drops/"+drop+"/events", strings.NewReader(payload))
	if err != nil {
		t.Fatalf("build append request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("append status = %d, want %d", resp.StatusCode, http.StatusCreated)
	}

	var result datadrop.AppendResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode append result: %v", err)
	}
	return result.Seq
}

// createVia creates a drop over HTTP.
func createVia(t *testing.T, base, drop string) {
	t.Helper()

	req, err := http.NewRequest(http.MethodPost, base+"/v1/drops",
		strings.NewReader(`{"name":"`+drop+`"}`))
	if err != nil {
		t.Fatalf("build create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create drop: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", resp.StatusCode, http.StatusCreated)
	}
}

// The stream replays what is already durable, then tails what arrives.
func TestStreamReplaysHistoryThenTailsLive(t *testing.T) {
	_, base := liveServer(t)
	createVia(t, base, "greenhouse")

	appendVia(t, base, "greenhouse", `{"n":1}`)
	appendVia(t, base, "greenhouse", `{"n":2}`)

	resp := openStream(t, base, "/v1/drops/greenhouse/events/stream", nil)
	reader := bufio.NewReader(resp.Body)

	// Phase 1: the two pre-existing events.
	history := readFrames(t, reader, 2)
	for i, frame := range history {
		if frame.name != "append" {
			t.Fatalf("history frame %d has event %q, want \"append\"", i, frame.name)
		}
		if frame.id != strconv.Itoa(i+1) {
			t.Fatalf("history frame %d has id %q, want %q", i, frame.id, strconv.Itoa(i+1))
		}
	}

	// Phase 2: an event appended after the subscription is live.
	appendVia(t, base, "greenhouse", `{"n":3}`)

	live := readFrames(t, reader, 1)
	if live[0].id != "3" {
		t.Fatalf("live frame id = %q, want \"3\"", live[0].id)
	}

	var envelope datadrop.Envelope
	if err := json.Unmarshal([]byte(live[0].data), &envelope); err != nil {
		t.Fatalf("decode live frame %q: %v", live[0].data, err)
	}
	if envelope.Seq != 3 {
		t.Fatalf("live envelope seq = %d, want 3", envelope.Seq)
	}
}

// ?after= skips everything at or below the cursor.
func TestStreamResumesFromAfterCursor(t *testing.T) {
	_, base := liveServer(t)
	createVia(t, base, "greenhouse")

	for i := 0; i < 3; i++ {
		appendVia(t, base, "greenhouse", `{"n":1}`)
	}

	resp := openStream(t, base, "/v1/drops/greenhouse/events/stream?after=2", nil)
	frames := readFrames(t, bufio.NewReader(resp.Body), 1)

	if frames[0].id != "3" {
		t.Fatalf("first frame after cursor 2 has id %q, want \"3\"", frames[0].id)
	}
}

// A browser EventSource resends the last id automatically; the header must be
// honoured as equivalent to ?after=.
func TestStreamHonoursLastEventID(t *testing.T) {
	_, base := liveServer(t)
	createVia(t, base, "greenhouse")

	for i := 0; i < 3; i++ {
		appendVia(t, base, "greenhouse", `{"n":1}`)
	}

	header := http.Header{}
	header.Set("Last-Event-ID", "2")

	resp := openStream(t, base, "/v1/drops/greenhouse/events/stream", header)
	frames := readFrames(t, bufio.NewReader(resp.Body), 1)

	if frames[0].id != "3" {
		t.Fatalf("first frame with Last-Event-ID 2 has id %q, want \"3\"", frames[0].id)
	}
}

func TestStreamRejectsInvalidCursor(t *testing.T) {
	_, base := liveServer(t)
	createVia(t, base, "greenhouse")

	req, err := http.NewRequest(http.MethodGet,
		base+"/v1/drops/greenhouse/events/stream?after=abc", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestStreamRejectsMissingDrop(t *testing.T) {
	_, base := liveServer(t)

	req, err := http.NewRequest(http.MethodGet,
		base+"/v1/drops/nosuch/events/stream", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusNotFound)
	}
}

// Events on a different stream must not reach this subscriber.
func TestStreamIsScopedToOneStream(t *testing.T) {
	srv, base := liveServer(t)
	createVia(t, base, "greenhouse")

	resp := openStream(t, base, "/v1/drops/greenhouse/events/stream?stream=alerts", nil)
	reader := bufio.NewReader(resp.Body)

	// Wait until the subscription is registered, so the publish below cannot
	// race ahead of it.
	deadline := time.Now().Add(2 * time.Second)
	for srv.hub.Subscribers("greenhouse", "alerts") == 0 {
		if time.Now().After(deadline) {
			t.Fatal("subscription was never registered")
		}
		time.Sleep(5 * time.Millisecond)
	}

	appendVia(t, base, "greenhouse", `{"n":1}`) // goes to "events", not "alerts"

	// Nothing should arrive on "alerts". Read raw lines on a goroutine — it
	// must not call t.Fatalf, since only the test goroutine may do that — and
	// report the first append line it sees, if any.
	leaked := make(chan string, 1)
	go func() {
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			if strings.HasPrefix(line, "event: append") {
				leaked <- line
				return
			}
		}
	}()

	select {
	case line := <-leaked:
		t.Fatalf("an events publish leaked to the alerts stream: %q", line)
	case <-time.After(500 * time.Millisecond):
		// No append frame arrived, which is what we want.
	}
}
