// Package schema compiles and applies JSON Schema payload contracts.
//
// It uses github.com/santhosh-tekuri/jsonschema/v6, which supports draft
// 2020-12. The ticket's design doc names xeipuuv/jsonschema, but that library
// is draft-07 only and cannot compile the design's own §11.1 example — see the
// intern guide §16.4 for the full rationale.
//
// The package deliberately does NOT know about strict vs permissive modes.
// Validation produces a Result; deciding what an invalid payload means is the
// ingest handler's job.
package schema

import (
	"bytes"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/pkg/errors"
	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// schemaResourceURL is the synthetic base URI compiled schemas are registered
// under. Nothing dereferences it; the compiler just needs a key.
const schemaResourceURL = "https://datadrop.local/schema.json"

// Compiled is a validator for one schema version.
type Compiled struct {
	schema *jsonschema.Schema
}

// Compile parses a JSON Schema document and prepares it for validation.
//
// An error here means the schema itself is malformed, which is a 400 at
// registration time rather than a surprise on the next ingest.
//
// Unknown keywords — including datadrop's own x-drop-semantic, x-drop-unit and
// x-drop-canonical-unit extensions — are ignored rather than rejected. That is
// the compiler's default (we never call AssertVocabs), and it is what lets the
// semantic layer annotate schemas before anything consumes the annotations.
func Compile(spec json.RawMessage) (*Compiled, error) {
	if len(bytes.TrimSpace(spec)) == 0 {
		return nil, errors.New("schema: spec is empty")
	}

	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(spec))
	if err != nil {
		return nil, errors.Wrap(err, "schema: parse schema document")
	}

	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource(schemaResourceURL, doc); err != nil {
		return nil, errors.Wrap(err, "schema: add schema resource")
	}

	compiled, err := compiler.Compile(schemaResourceURL)
	if err != nil {
		return nil, errors.Wrap(err, "schema: compile schema")
	}
	return &Compiled{schema: compiled}, nil
}

// Result is the outcome of validating one payload.
//
// An invalid payload is DATA, not an error: Validate returns a Result with
// Valid=false and a populated Violations list. A returned error means the
// payload could not be parsed at all.
type Result struct {
	Valid      bool
	Violations []datadrop.Violation
}

// Validate checks a payload against the compiled schema.
func (c *Compiled) Validate(payload json.RawMessage) (Result, error) {
	if c == nil || c.schema == nil {
		return Result{Valid: true}, nil
	}

	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return Result{}, errors.Wrap(err, "schema: parse payload")
	}

	if err := c.schema.Validate(instance); err != nil {
		var validationErr *jsonschema.ValidationError
		if errors.As(err, &validationErr) {
			return Result{Valid: false, Violations: violationsOf(validationErr)}, nil
		}
		return Result{}, errors.Wrap(err, "schema: validate payload")
	}
	return Result{Valid: true}, nil
}

// violationsOf flattens a ValidationError tree into the leaf failures a user
// can act on, located by JSON Pointer.
//
// BasicOutput gives a flat list; we keep only the units that carry an actual
// error message (interior units describe which keyword failed, not why), then
// deduplicate and sort so the response is stable across runs.
func violationsOf(err *jsonschema.ValidationError) []datadrop.Violation {
	output := err.BasicOutput()
	if output == nil {
		return []datadrop.Violation{{Path: "", Message: err.Error()}}
	}

	seen := map[datadrop.Violation]struct{}{}
	violations := []datadrop.Violation{}

	var walk func(unit jsonschema.OutputUnit)
	walk = func(unit jsonschema.OutputUnit) {
		if unit.Error != nil {
			v := datadrop.Violation{
				Path:    normalizePath(unit.InstanceLocation),
				Message: unit.Error.String(),
			}
			if _, dup := seen[v]; !dup {
				seen[v] = struct{}{}
				violations = append(violations, v)
			}
		}
		for _, child := range unit.Errors {
			walk(child)
		}
	}
	walk(*output)

	if len(violations) == 0 {
		violations = append(violations, datadrop.Violation{Message: err.Error()})
	}

	sort.Slice(violations, func(i, j int) bool {
		if violations[i].Path != violations[j].Path {
			return violations[i].Path < violations[j].Path
		}
		return violations[i].Message < violations[j].Message
	})
	return violations
}

// normalizePath renders an instance location as a JSON Pointer. The library
// emits "" for the document root and "/a/b" for nested locations; this only
// has to guard against a missing leading slash.
func normalizePath(location string) string {
	if location == "" || strings.HasPrefix(location, "/") {
		return location
	}
	return "/" + location
}

// Cache memoizes compiled schemas by version.
//
// Compiling is expensive relative to validating, and the ingest path validates
// on every request against a schema that changes only when someone registers a
// new version — so this is the difference between a compile per event and a
// compile per deployment.
type Cache struct {
	mu       sync.RWMutex
	compiled map[string]*Compiled
}

// NewCache returns an empty cache.
func NewCache() *Cache {
	return &Cache{compiled: map[string]*Compiled{}}
}

// Get returns the compiled form of sc, compiling and memoizing on first use.
//
// The key includes the version, and versions are immutable, so an entry can
// never go stale: registering a new schema produces a new key rather than
// invalidating an old one.
func (c *Cache) Get(sc datadrop.Schema) (*Compiled, error) {
	key := cacheKey(sc)

	c.mu.RLock()
	compiled, ok := c.compiled[key]
	c.mu.RUnlock()
	if ok {
		return compiled, nil
	}

	compiled, err := Compile(sc.Spec)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.compiled[key] = compiled
	c.mu.Unlock()

	return compiled, nil
}

func cacheKey(sc datadrop.Schema) string {
	return sc.Drop + "/" + sc.Stream + "#" + strconv.Itoa(sc.Version)
}
