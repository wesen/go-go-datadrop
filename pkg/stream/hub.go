// Package stream provides the in-process fan-out that makes newly appended
// events visible to live subscribers.
package stream

import (
	"sync"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// DefaultBuffer is the per-subscriber channel depth.
const DefaultBuffer = 256

// Hub distributes committed events to in-process subscribers. Persistence and
// resumption come from the events table; the hub is only a low-latency hint.
//
// A subscriber that cannot keep up is DISCONNECTED — its channel is closed —
// rather than buffered without bound. It is expected to reconnect and resume
// from its last durable sequence. This is what stops one slow browser tab from
// growing server memory without limit, and it is why publishing is never
// allowed to block the ingest path.
type Hub struct {
	mu     sync.Mutex
	nextID uint64
	topics map[string]map[uint64]chan datadrop.Envelope
	buffer int
}

// NewHub returns a hub with the given per-subscriber buffer depth. A
// non-positive buffer selects DefaultBuffer.
func NewHub(buffer int) *Hub {
	if buffer <= 0 {
		buffer = DefaultBuffer
	}
	return &Hub{
		topics: map[string]map[uint64]chan datadrop.Envelope{},
		buffer: buffer,
	}
}

// Subscribe registers a listener on one (drop, stream) and returns its channel
// plus an idempotent cancel function.
//
// A closed channel means the subscriber was evicted for falling behind; the
// reader should resume from its last sequence rather than treat it as an error.
//
// Callers must Subscribe BEFORE replaying history from the store. Subscribing
// second would drop any event committed in the gap; subscribing first can only
// duplicate events, which the reader dedupes by sequence.
func (h *Hub) Subscribe(drop, stream string) (<-chan datadrop.Envelope, func()) {
	topic := topicKey(drop, stream)

	h.mu.Lock()
	h.nextID++
	id := h.nextID
	ch := make(chan datadrop.Envelope, h.buffer)
	if h.topics[topic] == nil {
		h.topics[topic] = map[uint64]chan datadrop.Envelope{}
	}
	h.topics[topic][id] = ch
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			if subscribers := h.topics[topic]; subscribers != nil {
				if current, ok := subscribers[id]; ok {
					delete(subscribers, id)
					close(current)
				}
				if len(subscribers) == 0 {
					delete(h.topics, topic)
				}
			}
		})
	}
	return ch, cancel
}

// Publish delivers a committed event to every subscriber on its topic.
//
// It never blocks. A subscriber whose buffer is full is evicted and its channel
// closed — see the type comment for why that is the correct behaviour rather
// than a bug.
//
// Publish must be called AFTER the event's transaction commits. Publishing
// first would let a subscriber observe an event that then fails to persist.
func (h *Hub) Publish(e datadrop.Envelope) {
	topic := topicKey(e.Drop, e.Stream)

	h.mu.Lock()
	defer h.mu.Unlock()

	subscribers := h.topics[topic]
	for id, ch := range subscribers {
		select {
		case ch <- e:
		default:
			delete(subscribers, id)
			close(ch)
			log.Debug().
				Str("drop", e.Drop).Str("stream", e.Stream).
				Msg("evicted a subscriber that could not keep up")
		}
	}
	if len(subscribers) == 0 {
		delete(h.topics, topic)
	}
}

// Subscribers reports how many listeners a topic currently has. Test and
// diagnostics use only.
func (h *Hub) Subscribers(drop, stream string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.topics[topicKey(drop, stream)])
}

func topicKey(drop, stream string) string {
	return drop + "/" + datadrop.NormalizeStream(stream)
}
