package main

import (
	"context"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/go-go-golems/go-go-datadrop/pkg/cli"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/dataset"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/drops"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/events"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/schemacmd"
)

// These tests assemble the real command tree, in process, and assert properties
// of it that no single verb file can see. They live in package main because
// this is the only package that imports every group — which is also the reason
// a forgotten group is possible at all.

func buildTree(t *testing.T) *cobra.Command {
	t.Helper()

	root, err := cli.NewRootCmd(
		drops.Register,
		events.Register,
		schemacmd.Register,
		dataset.Register,
	)
	if err != nil {
		t.Fatalf("NewRootCmd: %v", err)
	}
	return root
}

// leafPath returns "dataset push" for a leaf, "" for a group or the root.
func leafPath(cmd *cobra.Command) string {
	if cmd.HasSubCommands() {
		return ""
	}

	var parts []string
	for c := cmd; c != nil && c.Parent() != nil; c = c.Parent() {
		parts = append([]string{c.Name()}, parts...)
	}
	return strings.Join(parts, " ")
}

func walkLeaves(cmd *cobra.Command, visit func(*cobra.Command)) {
	if path := leafPath(cmd); path != "" {
		visit(cmd)
	}
	for _, child := range cmd.Commands() {
		walkLeaves(child, visit)
	}
}

// A verb that forgets the client section compiles, runs, and fails at its first
// request against http://localhost:8080 regardless of --addr — because the flag
// does not exist, so the default stands. It is exactly the mistake a
// copy-paste between verb files produces, and nothing else catches it.
func TestEveryClientVerbHasTheClientSection(t *testing.T) {
	// The verbs that legitimately do not talk to a datadrop server over the
	// client API. Everything else must carry --addr and --token.
	operatorVerbs := map[string]string{
		"serve":       "runs the server rather than talking to one",
		"healthcheck": "probes /healthz with its own --url",
		"help":        "cobra's own",
		"completion":  "cobra's own",
	}

	var missing []string
	walkLeaves(buildTree(t), func(cmd *cobra.Command) {
		path := leafPath(cmd)
		root := strings.Fields(path)[0]
		if _, exempt := operatorVerbs[root]; exempt {
			return
		}
		if cmd.Flags().Lookup("addr") == nil || cmd.Flags().Lookup("token") == nil {
			missing = append(missing, path)
		}
	})

	sort.Strings(missing)
	if len(missing) > 0 {
		t.Fatalf("these verbs have no client section, so --addr and --token do nothing on them:\n  %s",
			strings.Join(missing, "\n  "))
	}
}

// The whole surface, pinned. A verb that disappears because its group was not
// registered is otherwise silent: the binary builds, the tests pass, and the
// command is simply gone.
func TestTheCommandSurfaceIsComplete(t *testing.T) {
	want := []string{
		"create", "dataset gc", "dataset get", "dataset import", "dataset list",
		"dataset push", "dataset rm", "dataset show", "export", "healthcheck",
		"inspect", "list", "push", "query", "schema put", "schema show",
		"serve", "tail", "whoami",
	}

	var got []string
	walkLeaves(buildTree(t), func(cmd *cobra.Command) {
		path := leafPath(cmd)
		root := strings.Fields(path)[0]
		// cobra and the glazed help system add their own leaves.
		if root == "help" || root == "completion" {
			return
		}
		got = append(got, path)
	})

	sort.Strings(got)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("the command surface is\n  %s\nwant\n  %s",
			strings.Join(got, ", "), strings.Join(want, ", "))
	}
}

// --format names a server-side export format and --output names a client-side
// rendering. A command with both has been classified wrong: it is either
// copying bytes the server formatted, or emitting rows, and it cannot be doing
// both.
func TestNoVerbHasBothFormatAndOutput(t *testing.T) {
	var confused []string
	walkLeaves(buildTree(t), func(cmd *cobra.Command) {
		// `help export` belongs to glazed's help system, not to datadrop.
		if strings.Fields(leafPath(cmd))[0] == "help" {
			return
		}
		hasFormat := cmd.Flags().Lookup("format") != nil
		hasOutput := cmd.Flags().Lookup("output") != nil
		if hasFormat && hasOutput {
			confused = append(confused, leafPath(cmd))
		}
	})

	sort.Strings(confused)
	if len(confused) > 0 {
		t.Fatalf("these verbs have both --format and --output:\n  %s",
			strings.Join(confused, "\n  "))
	}
}

// The --output ndjson shim has to do two things and it is easy to keep only
// one of them: map the value onto its replacement, and say so. A silent
// mapping is worse than no mapping, because ndjson's replacement is a stream of
// concatenated JSON values rather than one object per line, and a script that
// reads lines breaks quietly.
func TestNdjsonDeprecation(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping end-to-end smoke test in -short mode")
	}

	binary := buildBinary(t)
	port := freePort(t)
	const token = "smoke-token"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	server := exec.CommandContext(ctx, binary, "serve",
		"--addr", "127.0.0.1:"+port,
		"--db", filepath.Join(t.TempDir(), "datadrop.db"),
		"--token", token)
	if err := server.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}
	t.Cleanup(func() {
		cancel()
		_ = server.Wait()
	})

	base := "http://127.0.0.1:" + port
	waitForHealth(t, base)

	dd := cliRunner{t: t, binary: binary,
		env: []string{"DATADROP_ADDR=" + base, "DATADROP_TOKEN=" + token}}

	dd.mustRun("create", "greenhouse")
	dd.mustRun("push", "greenhouse", "t=1")
	dd.mustRun("push", "greenhouse", "t=2")

	stdout, stderr := dd.mustRun("query", "greenhouse", "--output", "ndjson", "--fields", "seq")

	// The warning names the replacement, on stderr so that a pipe into jq keeps
	// working while the person running it is still told.
	if !strings.Contains(stderr, "--output ndjson is deprecated") {
		t.Errorf("no deprecation warning on stderr: %q", stderr)
	}
	if !strings.Contains(stderr, "--output json --output-as-objects") {
		t.Errorf("the warning does not name its jq-compatible replacement: %q", stderr)
	}
	if !strings.Contains(stderr, "export --format ndjson") {
		t.Errorf("the warning does not name the line-oriented replacement: %q", stderr)
	}

	// The mapping: a stream of concatenated JSON objects, not an array.
	if strings.HasPrefix(strings.TrimSpace(stdout), "[") {
		t.Errorf("--output ndjson produced a JSON array, so it was not mapped onto "+
			"--output-as-objects: %q", stdout)
	}

	decoder := json.NewDecoder(strings.NewReader(stdout))
	rows := 0
	for {
		var row map[string]any
		err := decoder.Decode(&row)
		if err != nil {
			break
		}
		rows++
	}
	if rows != 2 {
		t.Errorf("--output ndjson emitted %d decodable objects, want 2: %q", rows, stdout)
	}

	// Nothing on stdout, so the warning cannot corrupt a pipe.
	if strings.Contains(stdout, "deprecated") {
		t.Errorf("the deprecation warning leaked into stdout: %q", stdout)
	}
}
