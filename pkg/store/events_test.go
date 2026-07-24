package store

import (
	"context"
	"encoding/json"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()

	st, err := Open(context.Background(), filepath.Join(t.TempDir(), "datadrop.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

func newTestDrop(t *testing.T, st *Store, name string) datadrop.Drop {
	t.Helper()

	d, err := st.CreateDrop(context.Background(), datadrop.Drop{Name: name})
	if err != nil {
		t.Fatalf("CreateDrop(%q): %v", name, err)
	}
	return d
}

func TestCreateDropRejectsDuplicates(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	_, err := st.CreateDrop(ctx, datadrop.Drop{Name: "greenhouse"})
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("second CreateDrop returned %v, want ErrAlreadyExists", err)
	}
}

func TestCreateDropValidatesName(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)

	for _, name := range []string{"", "Greenhouse", "-leading", "has space", "has/slash"} {
		if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: name}); err == nil {
			t.Fatalf("CreateDrop(%q) succeeded, want a validation error", name)
		}
	}
}

func TestGetDropNotFound(t *testing.T) {
	_, err := newTestStore(t).GetDrop(context.Background(), "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetDrop returned %v, want ErrNotFound", err)
	}
}

func TestAppendEventAssignsSequenceAndDefaults(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	e, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse",
		Data: json.RawMessage(`{"temperature": 21.7}`),
	})
	if err != nil {
		t.Fatalf("AppendEvent: %v", err)
	}

	if e.Seq != 1 {
		t.Fatalf("Seq = %d, want 1", e.Seq)
	}
	if e.Stream != datadrop.DefaultStream {
		t.Fatalf("Stream = %q, want %q", e.Stream, datadrop.DefaultStream)
	}
	if e.ID == "" {
		t.Fatal("expected a server-assigned event ID")
	}
	if e.Type != datadrop.DefaultType {
		t.Fatalf("Type = %q, want %q", e.Type, datadrop.DefaultType)
	}
	if e.SpecVersion != datadrop.SpecVersion {
		t.Fatalf("SpecVersion = %q, want %q", e.SpecVersion, datadrop.SpecVersion)
	}
	// An event without a producer timestamp observes at ingest.
	if !e.Time.Equal(e.ReceivedAt) {
		t.Fatalf("Time = %v, want it to default to ReceivedAt = %v", e.Time, e.ReceivedAt)
	}
}

// The producer's observation time and the server's ingest time must stay
// distinct — that separation is the whole point of the offline-edge case.
func TestAppendEventPreservesProducerTime(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	observed := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	e, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse",
		Time: observed,
		Data: json.RawMessage(`{"temperature": 21.7}`),
	})
	if err != nil {
		t.Fatalf("AppendEvent: %v", err)
	}

	if !e.Time.Equal(observed) {
		t.Fatalf("Time = %v, want the producer's %v", e.Time, observed)
	}
	if !e.ReceivedAt.After(observed) {
		t.Fatalf("ReceivedAt = %v, want it to be later than the observation time", e.ReceivedAt)
	}
}

// Sequences must be dense and monotonic within a stream. This is the core
// storage invariant; a gap or a repeat breaks cursor-based resumption.
func TestAppendEventSequenceIsMonotonic(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	const total = 250
	for i := 1; i <= total; i++ {
		e, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse",
			Data: json.RawMessage(`{"n": 1}`),
		})
		if err != nil {
			t.Fatalf("AppendEvent %d: %v", i, err)
		}
		if e.Seq != int64(i) {
			t.Fatalf("event %d has Seq %d, want %d", i, e.Seq, i)
		}
	}
}

// Same invariant, but with writers racing. The store serializes at the pool,
// so the set of assigned sequences must still be exactly 1..N.
func TestAppendEventSequenceIsMonotonicUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	const (
		writers         = 8
		eventsPerWriter = 25
		total           = writers * eventsPerWriter
	)

	var (
		mu       sync.Mutex
		assigned = make(map[int64]int, total)
		wg       sync.WaitGroup
	)

	wg.Add(writers)
	for w := 0; w < writers; w++ {
		go func() {
			defer wg.Done()
			for i := 0; i < eventsPerWriter; i++ {
				e, err := st.AppendEvent(ctx, datadrop.Envelope{
					Drop: "greenhouse",
					Data: json.RawMessage(`{"n": 1}`),
				})
				if err != nil {
					t.Errorf("AppendEvent: %v", err)
					return
				}
				mu.Lock()
				assigned[e.Seq]++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if len(assigned) != total {
		t.Fatalf("got %d distinct sequences, want %d", len(assigned), total)
	}
	for seq := int64(1); seq <= total; seq++ {
		if count := assigned[seq]; count != 1 {
			t.Fatalf("sequence %d was assigned %d times, want exactly 1", seq, count)
		}
	}
}

// Streams within a drop are independently numbered.
func TestAppendEventSequencesArePerStream(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for i := 0; i < 3; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", Stream: "events", Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent to events: %v", err)
		}
	}

	alert, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", Stream: "alerts", Data: json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("AppendEvent to alerts: %v", err)
	}
	if alert.Seq != 1 {
		t.Fatalf("first event on a new stream has Seq %d, want 1", alert.Seq)
	}
}

// Resending the same ID must return the original event, not append a second.
func TestAppendEventIsIdempotentByID(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	first, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse",
		ID:   "01J2KZ1Z4G6W8P4PGH7JNFSMQ9",
		Data: json.RawMessage(`{"temperature": 21.7}`),
	})
	if err != nil {
		t.Fatalf("first AppendEvent: %v", err)
	}

	replay, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse",
		ID:   "01J2KZ1Z4G6W8P4PGH7JNFSMQ9",
		Data: json.RawMessage(`{"temperature": 99.9}`),
	})
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("replay returned %v, want ErrAlreadyExists", err)
	}
	if replay.Seq != first.Seq {
		t.Fatalf("replay Seq = %d, want the original %d", replay.Seq, first.Seq)
	}

	events, err := st.QueryEvents(ctx, datadrop.EventQuery{Drop: "greenhouse"})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("stream holds %d events after a replay, want 1", len(events))
	}
	// The replay must not have overwritten the original payload.
	if string(events[0].Data) != `{"temperature":21.7}` {
		t.Fatalf("stored data = %s, want the original payload", events[0].Data)
	}
}

// A duplicate ID must not burn a sequence number.
func TestAppendEventReplayDoesNotConsumeASequence(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", ID: "fixed-id", Data: json.RawMessage(`{}`),
	}); err != nil {
		t.Fatalf("first append: %v", err)
	}
	if _, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", ID: "fixed-id", Data: json.RawMessage(`{}`),
	}); !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("replay returned %v, want ErrAlreadyExists", err)
	}

	next, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", Data: json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("third append: %v", err)
	}
	if next.Seq != 2 {
		t.Fatalf("Seq after a rolled-back replay = %d, want 2", next.Seq)
	}
}

func TestAppendEventRequiresAnExistingDrop(t *testing.T) {
	_, err := newTestStore(t).AppendEvent(context.Background(), datadrop.Envelope{
		Drop: "missing", Data: json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("AppendEvent to a missing drop returned %v, want ErrNotFound", err)
	}
}

func TestAppendEventRejectsInvalidJSON(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", Data: json.RawMessage(`{"broken":`),
	}); err == nil {
		t.Fatal("AppendEvent accepted malformed JSON")
	}
}

func TestQueryEventsOrderAndLimit(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for i := 0; i < 5; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent: %v", err)
		}
	}

	desc, err := st.QueryEvents(ctx, datadrop.EventQuery{Drop: "greenhouse", Limit: 2})
	if err != nil {
		t.Fatalf("QueryEvents desc: %v", err)
	}
	if len(desc) != 2 || desc[0].Seq != 5 || desc[1].Seq != 4 {
		t.Fatalf("descending page = %v, want sequences [5 4]", seqsOf(desc))
	}

	asc, err := st.QueryEvents(ctx, datadrop.EventQuery{
		Drop: "greenhouse", Limit: 2, Order: datadrop.OrderAsc,
	})
	if err != nil {
		t.Fatalf("QueryEvents asc: %v", err)
	}
	if len(asc) != 2 || asc[0].Seq != 1 || asc[1].Seq != 2 {
		t.Fatalf("ascending page = %v, want sequences [1 2]", seqsOf(asc))
	}
}

func TestQueryEventsClampsLimit(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	q := datadrop.EventQuery{Drop: "greenhouse", Limit: 99999}
	if _, err := st.QueryEvents(ctx, q); err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}

	// Normalize is what clamps; assert on it directly since the query itself
	// returns fewer rows than the cap either way.
	clamped := q
	if err := clamped.Normalize(); err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if clamped.Limit != datadrop.MaxLimit {
		t.Fatalf("clamped limit = %d, want %d", clamped.Limit, datadrop.MaxLimit)
	}
}

// Cursor stability: paging with after = last.Seq must visit every event
// exactly once.
func TestQueryEventsCursorPagingIsStable(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	const total = 37
	for i := 0; i < total; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent: %v", err)
		}
	}

	seen := map[int64]int{}
	after := int64(0)
	for {
		page, err := st.QueryEvents(ctx, datadrop.EventQuery{
			Drop: "greenhouse", After: after, Limit: 10, Order: datadrop.OrderAsc,
		})
		if err != nil {
			t.Fatalf("QueryEvents: %v", err)
		}
		if len(page) == 0 {
			break
		}
		for _, e := range page {
			seen[e.Seq]++
			after = e.Seq
		}
	}

	if len(seen) != total {
		t.Fatalf("visited %d distinct events, want %d", len(seen), total)
	}
	for seq, count := range seen {
		if count != 1 {
			t.Fatalf("event %d visited %d times, want once", seq, count)
		}
	}
}

// from is inclusive, to is exclusive.
func TestQueryEventsTimeRangeBoundaries(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse",
			Time: base.Add(time.Duration(i) * time.Hour),
			Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent: %v", err)
		}
	}

	// [01:00, 03:00) must select the events at 01:00 and 02:00 only.
	events, err := st.QueryEvents(ctx, datadrop.EventQuery{
		Drop:  "greenhouse",
		From:  base.Add(1 * time.Hour),
		To:    base.Add(3 * time.Hour),
		Order: datadrop.OrderAsc,
	})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("range selected %d events, want 2 (got %v)", len(events), seqsOf(events))
	}
	if !events[0].Time.Equal(base.Add(1 * time.Hour)) {
		t.Fatalf("first event at %v, want the inclusive lower bound %v",
			events[0].Time, base.Add(1*time.Hour))
	}
}

func TestQueryEventsRejectsInvertedRange(t *testing.T) {
	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	_, err := newTestStore(t).QueryEvents(context.Background(), datadrop.EventQuery{
		Drop: "greenhouse", From: base.Add(time.Hour), To: base,
	})
	if err == nil {
		t.Fatal("QueryEvents accepted a range whose --to precedes its --from")
	}
}

func TestEachEventPagesBeyondTheLimitCap(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	// More events than MaxLimit would return in a single query.
	const total = datadrop.MaxLimit + 17
	for i := 0; i < total; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent: %v", err)
		}
	}

	var (
		count   int
		lastSeq int64
	)
	if err := st.EachEvent(ctx, datadrop.EventQuery{Drop: "greenhouse"},
		func(e datadrop.Envelope) error {
			count++
			if e.Seq <= lastSeq {
				t.Fatalf("EachEvent yielded seq %d after %d; order is not ascending", e.Seq, lastSeq)
			}
			lastSeq = e.Seq
			return nil
		}); err != nil {
		t.Fatalf("EachEvent: %v", err)
	}

	if count != total {
		t.Fatalf("EachEvent yielded %d events, want %d", count, total)
	}
}

func TestDropStats(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for i := 0; i < 3; i++ {
		if _, err := st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", Data: json.RawMessage(`{}`),
		}); err != nil {
			t.Fatalf("AppendEvent: %v", err)
		}
	}
	if _, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", Stream: "alerts", Data: json.RawMessage(`{}`),
	}); err != nil {
		t.Fatalf("AppendEvent to alerts: %v", err)
	}

	stats, err := st.DropStats(ctx, "greenhouse")
	if err != nil {
		t.Fatalf("DropStats: %v", err)
	}
	if stats.EventCount != 4 {
		t.Fatalf("EventCount = %d, want 4", stats.EventCount)
	}
	if len(stats.Streams) != 2 {
		t.Fatalf("Streams = %v, want two entries", stats.Streams)
	}
	if stats.LastEvent == nil {
		t.Fatal("LastEvent is nil, want the most recent receive time")
	}
}

func seqsOf(events []datadrop.Envelope) []int64 {
	seqs := make([]int64, len(events))
	for i, e := range events {
		seqs[i] = e.Seq
	}
	return seqs
}
