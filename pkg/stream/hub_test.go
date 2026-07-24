package stream

import (
	"testing"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func event(seq int64) datadrop.Envelope {
	return datadrop.Envelope{Drop: "greenhouse", Stream: "events", Seq: seq}
}

func TestPublishFansOutToEverySubscriber(t *testing.T) {
	hub := NewHub(4)

	first, cancelFirst := hub.Subscribe("greenhouse", "events")
	defer cancelFirst()
	second, cancelSecond := hub.Subscribe("greenhouse", "events")
	defer cancelSecond()

	hub.Publish(event(1))

	for i, ch := range []<-chan datadrop.Envelope{first, second} {
		select {
		case e := <-ch:
			if e.Seq != 1 {
				t.Fatalf("subscriber %d received seq %d, want 1", i, e.Seq)
			}
		default:
			t.Fatalf("subscriber %d received nothing", i)
		}
	}
}

func TestPublishIsScopedToATopic(t *testing.T) {
	hub := NewHub(4)

	alerts, cancel := hub.Subscribe("greenhouse", "alerts")
	defer cancel()

	hub.Publish(event(1)) // published to greenhouse/events

	select {
	case e := <-alerts:
		t.Fatalf("an events publish leaked to the alerts subscriber: %+v", e)
	default:
	}
}

// The default stream name is applied on both sides, so a subscriber that asked
// for "" and a publisher that said "events" must meet.
func TestSubscribeNormalizesTheDefaultStream(t *testing.T) {
	hub := NewHub(4)

	events, cancel := hub.Subscribe("greenhouse", "")
	defer cancel()

	hub.Publish(event(1))

	select {
	case e := <-events:
		if e.Seq != 1 {
			t.Fatalf("received seq %d, want 1", e.Seq)
		}
	default:
		t.Fatal("a subscriber on the default stream received nothing")
	}
}

// This is the backpressure contract: a subscriber that cannot keep up is
// disconnected rather than buffered without bound. It resumes from its last
// durable sequence, so no data is lost — only the low-latency hint is.
func TestSlowSubscriberIsEvictedRatherThanBuffered(t *testing.T) {
	hub := NewHub(1)

	events, cancel := hub.Subscribe("greenhouse", "events")
	defer cancel()

	// Fill the buffer, then overflow it without ever reading.
	hub.Publish(event(1))
	hub.Publish(event(2))
	hub.Publish(event(3))

	// The buffered event is still deliverable...
	select {
	case e, open := <-events:
		if !open {
			t.Fatal("channel closed before delivering the buffered event")
		}
		if e.Seq != 1 {
			t.Fatalf("buffered event has seq %d, want 1", e.Seq)
		}
	default:
		t.Fatal("expected one buffered event")
	}

	// ...and then the channel must be closed, signalling eviction.
	if _, open := <-events; open {
		t.Fatal("a slow subscriber was buffered instead of evicted")
	}

	if remaining := hub.Subscribers("greenhouse", "events"); remaining != 0 {
		t.Fatalf("%d subscribers remain after eviction, want 0", remaining)
	}
}

// Publishing must never block, even with no reader draining the channel.
func TestPublishDoesNotBlock(t *testing.T) {
	hub := NewHub(1)

	_, cancel := hub.Subscribe("greenhouse", "events")
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for seq := int64(1); seq <= 100; seq++ {
			hub.Publish(event(seq))
		}
	}()

	<-done // A blocking Publish would deadlock here and fail the test by timeout.
}

func TestCancelIsIdempotent(t *testing.T) {
	hub := NewHub(4)

	events, cancel := hub.Subscribe("greenhouse", "events")

	cancel()
	cancel() // A second call must not panic on an already-closed channel.

	if _, open := <-events; open {
		t.Fatal("channel is still open after cancel")
	}
	if remaining := hub.Subscribers("greenhouse", "events"); remaining != 0 {
		t.Fatalf("%d subscribers remain after cancel, want 0", remaining)
	}
}

func TestPublishToNobodyIsSafe(t *testing.T) {
	NewHub(4).Publish(event(1)) // must not panic
}

func TestNewHubAppliesDefaultBuffer(t *testing.T) {
	if buffer := NewHub(0).buffer; buffer != DefaultBuffer {
		t.Fatalf("buffer = %d, want the default %d", buffer, DefaultBuffer)
	}
	if buffer := NewHub(-5).buffer; buffer != DefaultBuffer {
		t.Fatalf("buffer = %d, want the default %d", buffer, DefaultBuffer)
	}
}
