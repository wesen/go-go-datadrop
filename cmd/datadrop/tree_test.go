package main

import (
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
