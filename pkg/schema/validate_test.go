package schema

import (
	"encoding/json"
	"strings"
	"testing"

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
		},
		"humidity": { "type": "number", "minimum": 0, "maximum": 1 }
	}
}`

func mustCompile(t *testing.T, spec string) *Compiled {
	t.Helper()

	compiled, err := Compile(json.RawMessage(spec))
	if err != nil {
		t.Fatalf("Compile: %v", err)
	}
	return compiled
}

func TestValidateAcceptsConformingPayload(t *testing.T) {
	result, err := mustCompile(t, readingSchema).
		Validate(json.RawMessage(`{"temperature": 21.7, "humidity": 0.48}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !result.Valid {
		t.Fatalf("payload rejected: %v", result.Violations)
	}
}

// An invalid payload is data, not an error: Validate must return
// (Result{Valid:false}, nil) so the caller can decide what it means.
func TestValidateReportsViolationsWithoutError(t *testing.T) {
	result, err := mustCompile(t, readingSchema).
		Validate(json.RawMessage(`{"temperature": "warm"}`))
	if err != nil {
		t.Fatalf("Validate returned an error for an invalid payload: %v", err)
	}
	if result.Valid {
		t.Fatal("a string temperature was accepted against a number schema")
	}
	if len(result.Violations) == 0 {
		t.Fatal("no violations reported for an invalid payload")
	}

	found := false
	for _, v := range result.Violations {
		if v.Path == "/temperature" {
			found = true
		}
	}
	if !found {
		t.Fatalf("no violation located at /temperature: %+v", result.Violations)
	}
}

func TestValidateReportsMissingRequiredProperty(t *testing.T) {
	result, err := mustCompile(t, readingSchema).Validate(json.RawMessage(`{"humidity": 0.5}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if result.Valid {
		t.Fatal("a payload missing a required property was accepted")
	}
}

func TestValidateReportsRangeViolations(t *testing.T) {
	result, err := mustCompile(t, readingSchema).
		Validate(json.RawMessage(`{"temperature": 20, "humidity": 5}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if result.Valid {
		t.Fatal("humidity=5 was accepted against maximum=1")
	}
}

// Violations must be deterministic: the same bad payload has to produce the
// same response body every time, or clients cannot diff or test against it.
func TestViolationsAreStableAndSorted(t *testing.T) {
	compiled := mustCompile(t, readingSchema)
	payload := json.RawMessage(`{"temperature": "warm", "humidity": 5}`)

	first, err := compiled.Validate(payload)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	second, err := compiled.Validate(payload)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}

	if len(first.Violations) != len(second.Violations) {
		t.Fatalf("violation count differs between runs: %d vs %d",
			len(first.Violations), len(second.Violations))
	}
	for i := range first.Violations {
		if first.Violations[i] != second.Violations[i] {
			t.Fatalf("violation %d differs between runs: %+v vs %+v",
				i, first.Violations[i], second.Violations[i])
		}
	}
	for i := 1; i < len(first.Violations); i++ {
		if first.Violations[i-1].Path > first.Violations[i].Path {
			t.Fatalf("violations are not path-sorted: %+v", first.Violations)
		}
	}
}

// x-drop-* extension keywords carry semantic metadata the validator has no
// opinion about. They must not cause a compile failure.
func TestCompileIgnoresExtensionKeywords(t *testing.T) {
	spec := `{
		"type": "object",
		"properties": {
			"t": { "type": "number",
			       "x-drop-semantic": "temperature",
			       "x-drop-unit": "Cel",
			       "x-drop-canonical-unit": "K" }
		}
	}`

	result, err := mustCompile(t, spec).Validate(json.RawMessage(`{"t": 1}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !result.Valid {
		t.Fatalf("extension keywords caused a validation failure: %v", result.Violations)
	}
}

func TestCompileRejectsMalformedSchema(t *testing.T) {
	for name, spec := range map[string]string{
		"empty":        ``,
		"whitespace":   `   `,
		"invalid JSON": `{"type":`,
		"bad type":     `{"type": 42}`,
	} {
		if _, err := Compile(json.RawMessage(spec)); err == nil {
			t.Fatalf("Compile accepted a %s schema", name)
		}
	}
}

func TestValidateRejectsMalformedPayload(t *testing.T) {
	if _, err := mustCompile(t, readingSchema).Validate(json.RawMessage(`{"broken":`)); err == nil {
		t.Fatal("Validate accepted a malformed payload")
	}
}

// A nil Compiled means "no schema registered", which accepts anything.
func TestNilCompiledAcceptsAnything(t *testing.T) {
	var compiled *Compiled
	result, err := compiled.Validate(json.RawMessage(`{"anything": true}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !result.Valid {
		t.Fatal("a nil validator rejected a payload")
	}
}

func TestCacheReturnsTheSameCompiledSchema(t *testing.T) {
	cache := NewCache()
	sc := datadrop.Schema{
		Drop: "greenhouse", Stream: "events", Version: 1,
		Spec: json.RawMessage(readingSchema),
	}

	first, err := cache.Get(sc)
	if err != nil {
		t.Fatalf("first Get: %v", err)
	}
	second, err := cache.Get(sc)
	if err != nil {
		t.Fatalf("second Get: %v", err)
	}
	if first != second {
		t.Fatal("cache recompiled a schema it had already seen")
	}
}

// Versions are immutable, so a new version must produce a new cache entry
// rather than silently reusing the old compiled form.
func TestCacheKeysOnVersion(t *testing.T) {
	cache := NewCache()
	base := datadrop.Schema{Drop: "greenhouse", Stream: "events", Spec: json.RawMessage(readingSchema)}

	v1 := base
	v1.Version = 1
	v2 := base
	v2.Version = 2
	v2.Spec = json.RawMessage(`{"type": "object"}`)

	first, err := cache.Get(v1)
	if err != nil {
		t.Fatalf("Get v1: %v", err)
	}
	second, err := cache.Get(v2)
	if err != nil {
		t.Fatalf("Get v2: %v", err)
	}
	if first == second {
		t.Fatal("two schema versions shared one cache entry")
	}

	// v2 has no required properties, so it must accept what v1 rejects.
	result, err := second.Validate(json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !result.Valid {
		t.Fatal("the cache returned the wrong version's validator")
	}
}

func TestCachePropagatesCompileErrors(t *testing.T) {
	_, err := NewCache().Get(datadrop.Schema{
		Drop: "greenhouse", Stream: "events", Version: 1,
		Spec: json.RawMessage(`{"type": 42}`),
	})
	if err == nil {
		t.Fatal("cache accepted a malformed schema")
	}
	if !strings.Contains(err.Error(), "schema:") {
		t.Fatalf("error %q is missing the package prefix", err)
	}
}
