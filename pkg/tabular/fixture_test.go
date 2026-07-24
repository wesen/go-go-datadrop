package tabular

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// The browser projects arriving SSE envelopes itself — a deliberate, contained
// exception to "one projection, on the server", because the alternative is a
// round trip per event. The containment is this fixture: Go writes what it
// produces for a set of awkward envelopes, and ui/test/live.test.ts asserts the
// TypeScript implementation produces exactly the same thing.
//
// Regenerate after any change to the flattening rules:
//
//	go test ./pkg/tabular -run TestWriteLiveProjectionFixture -update

var updateFixtures = flag.Bool("update", false, "rewrite the shared projection fixture")

const fixturePath = "../../ui/test/fixtures/envelope-projection.json"

// liveFixtureEvents are chosen to exercise every branch of the flattener:
// nesting, arrays, an explicit null, an empty object, a boolean, a large
// integer that must not round-trip through float64, and a key that only the
// second event has.
func liveFixtureEvents() []datadrop.Envelope {
	at := time.Date(2026, 7, 24, 15, 4, 5, 100_000_000, time.UTC)
	later := at.Add(90 * time.Second)

	return []datadrop.Envelope{
		{
			ID: "01JQF0", Drop: "lab", Stream: "temps", Seq: 41, Time: at, ReceivedAt: at,
			Source: "sensor-7", Type: "io.datadrop.event",
			Data: json.RawMessage(`{
				"temp_c": 21.5,
				"station": "north",
				"ok": true,
				"location": {"lat": 52.1, "lon": 4.3},
				"tags": ["a", "b"],
				"note": null,
				"extras": {},
				"ticket": 12345678901234567
			}`),
		},
		{
			ID: "01JQF1", Drop: "lab", Stream: "temps", Seq: 42, Time: later, ReceivedAt: later,
			Source: "sensor-7", Subject: "recalibration",
			Data: json.RawMessage(`{"temp_c": 22, "station": "south", "ok": false, "comment": "recalibrated"}`),
		},
	}
}

func TestWriteLiveProjectionFixture(t *testing.T) {
	table, err := FromEvents(
		SourceRef{Kind: KindStream, Drop: "lab", Stream: "temps"}, liveFixtureEvents())
	if err != nil {
		t.Fatalf("FromEvents: %v", err)
	}

	// The events go in alongside the projection so that the TypeScript side has
	// one source of truth for both the input and the expected output.
	encoded, err := json.MarshalIndent(map[string]any{
		"events": liveFixtureEvents(),
		"fields": table.Fields,
		"rows":   table.Rows,
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode fixture: %v", err)
	}
	encoded = append(encoded, '\n')

	if *updateFixtures {
		if err := os.MkdirAll(filepath.Dir(fixturePath), 0o750); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(fixturePath, encoded, 0o600); err != nil {
			t.Fatalf("write fixture: %v", err)
		}
		t.Logf("wrote %s", fixturePath)
		return
	}

	current, err := os.ReadFile(fixturePath) //nolint:gosec // a fixed test-data path
	if err != nil {
		t.Fatalf("read fixture (run with -update to create it): %v", err)
	}
	if string(current) != string(encoded) {
		t.Fatalf("the shared projection fixture is stale — the browser's live tail "+
			"would now disagree with the server.\nRegenerate with:\n"+
			"  go test ./pkg/tabular -run %s -update", t.Name())
	}
}
