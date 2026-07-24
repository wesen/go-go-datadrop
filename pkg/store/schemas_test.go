package store

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

const readingSchema = `{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"required": ["temperature"],
	"properties": {
		"temperature": {
			"type": "number",
			"x-drop-semantic": "temperature",
			"x-drop-unit": "Cel"
		}
	}
}`

func TestPutSchemaVersionsMonotonically(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for want := 1; want <= 3; want++ {
		sc, err := st.PutSchema(ctx, datadrop.Schema{
			Drop: "greenhouse", Spec: json.RawMessage(readingSchema), Mode: datadrop.ModeStrict,
		})
		if err != nil {
			t.Fatalf("PutSchema: %v", err)
		}
		if sc.Version != want {
			t.Fatalf("Version = %d, want %d", sc.Version, want)
		}
	}

	active, err := st.ActiveSchema(ctx, "greenhouse", "events")
	if err != nil {
		t.Fatalf("ActiveSchema: %v", err)
	}
	if active.Version != 3 {
		t.Fatalf("active version = %d, want the highest (3)", active.Version)
	}
}

// x-drop-* extension keywords are the hook for the semantic layer. The
// validator ignores them, but they must survive storage byte-for-byte.
func TestPutSchemaPreservesExtensionKeywords(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.PutSchema(ctx, datadrop.Schema{
		Drop: "greenhouse", Spec: json.RawMessage(readingSchema),
	}); err != nil {
		t.Fatalf("PutSchema: %v", err)
	}

	active, err := st.ActiveSchema(ctx, "greenhouse", "events")
	if err != nil {
		t.Fatalf("ActiveSchema: %v", err)
	}
	for _, keyword := range []string{"x-drop-semantic", "x-drop-unit"} {
		if !strings.Contains(string(active.Spec), keyword) {
			t.Fatalf("stored schema lost %q: %s", keyword, active.Spec)
		}
	}
}

func TestPutSchemaDefaultsToStrict(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	sc, err := st.PutSchema(ctx, datadrop.Schema{
		Drop: "greenhouse", Spec: json.RawMessage(readingSchema),
	})
	if err != nil {
		t.Fatalf("PutSchema: %v", err)
	}
	if sc.Mode != datadrop.ModeStrict {
		t.Fatalf("Mode = %q, want %q", sc.Mode, datadrop.ModeStrict)
	}
}

func TestPutSchemaRejectsUnknownMode(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.PutSchema(ctx, datadrop.Schema{
		Drop: "greenhouse", Spec: json.RawMessage(readingSchema), Mode: "observed",
	}); err == nil {
		t.Fatal("PutSchema accepted an unimplemented mode")
	}
}

func TestPutSchemaRequiresAnExistingDrop(t *testing.T) {
	_, err := newTestStore(t).PutSchema(context.Background(), datadrop.Schema{
		Drop: "missing", Spec: json.RawMessage(readingSchema),
	})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("PutSchema returned %v, want ErrNotFound", err)
	}
}

func TestPutSchemaRejectsEmptySpec(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.PutSchema(ctx, datadrop.Schema{Drop: "greenhouse"}); err == nil {
		t.Fatal("PutSchema accepted an empty spec")
	}
}

// No schema registered is not an error state — it is the design's "open" mode.
// The caller distinguishes it with errors.Is(err, ErrNotFound).
func TestActiveSchemaNotFound(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.ActiveSchema(ctx, "greenhouse", "events"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ActiveSchema returned %v, want ErrNotFound", err)
	}
}

func TestSchemasAreScopedPerStream(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	if _, err := st.PutSchema(ctx, datadrop.Schema{
		Drop: "greenhouse", Stream: "events", Spec: json.RawMessage(readingSchema),
	}); err != nil {
		t.Fatalf("PutSchema on events: %v", err)
	}

	if _, err := st.ActiveSchema(ctx, "greenhouse", "alerts"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a schema on 'events' leaked to 'alerts': %v", err)
	}
}

// Every mutation writes an audit record, and the audit trail is what an
// operator reads after an incident.
func TestMutationsAreAudited(t *testing.T) {
	ctx := WithActor(context.Background(), "test-token")
	st := newTestStore(t)

	if _, err := st.CreateDrop(ctx, datadrop.Drop{Name: "greenhouse"}); err != nil {
		t.Fatalf("CreateDrop: %v", err)
	}
	if _, err := st.AppendEvent(ctx, datadrop.Envelope{
		Drop: "greenhouse", Data: json.RawMessage(`{}`),
	}); err != nil {
		t.Fatalf("AppendEvent: %v", err)
	}
	if _, err := st.PutSchema(ctx, datadrop.Schema{
		Drop: "greenhouse", Spec: json.RawMessage(readingSchema),
	}); err != nil {
		t.Fatalf("PutSchema: %v", err)
	}

	records, err := st.ListAudit(ctx, "greenhouse", 10)
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}

	seen := map[string]bool{}
	for _, rec := range records {
		seen[rec.Action] = true
		if rec.Actor != "test-token" {
			t.Fatalf("audit record %q has actor %q, want the context actor", rec.Action, rec.Actor)
		}
	}
	for _, action := range []string{
		datadrop.ActionDropCreate, datadrop.ActionEventAppend, datadrop.ActionSchemaPut,
	} {
		if !seen[action] {
			t.Fatalf("no audit record for %q; got %v", action, records)
		}
	}
}

// A rolled-back append must not leave an audit record claiming it happened.
func TestReplayedAppendIsNotAudited(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)
	newTestDrop(t, st, "greenhouse")

	for i := 0; i < 2; i++ {
		_, _ = st.AppendEvent(ctx, datadrop.Envelope{
			Drop: "greenhouse", ID: "fixed-id", Data: json.RawMessage(`{}`),
		})
	}

	records, err := st.ListAudit(ctx, "greenhouse", 100)
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}

	appends := 0
	for _, rec := range records {
		if rec.Action == datadrop.ActionEventAppend {
			appends++
		}
	}
	if appends != 1 {
		t.Fatalf("%d append audit records after a replay, want 1", appends)
	}
}
