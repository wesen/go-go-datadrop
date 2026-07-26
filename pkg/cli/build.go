package cli

import (
	"github.com/go-go-golems/glazed/pkg/cli"
	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

// AppName is the env prefix the parser reads DATADROP_* variables under.
//
// It has to be set on the parser config of every command, because that is what
// switches on glazed's built-in env source. Leave it empty and DATADROP_ADDR
// and DATADROP_TOKEN silently stop working — the same trap the logging section
// hit with DATADROP_LOG_LEVEL, one layer up.
const AppName = "datadrop"

// Builder constructs one Glazed command.
type Builder func() (cmds.Command, error)

// BuildCobraCommand turns a Glazed command into a cobra command with
// datadrop's conventions applied.
//
// Two of those conventions matter:
//
//   - WithExitCodes wraps the command so that every error it returns is mapped
//     onto the documented exit codes and reported with the "datadrop: " prefix
//     before glazed's cobra.CheckErr can turn it into "Error: " and exit 1. See
//     exit.go.
//   - ShortHelpSections keeps `datadrop query --help` showing the command's own
//     flags and the two client flags, rather than fifty output flags. The full
//     set stays reachable through --long-help.
//
// MiddlewaresFunc is deliberately not set. Supplying one replaces glazed's
// default chain and takes the env source with it, which is how DATADROP_ADDR
// stops working without anything reporting an error.
func BuildCobraCommand(command cmds.Command) (*cobra.Command, error) {
	cobraCmd, err := cli.BuildCobraCommandFromCommand(
		WithExitCodes(command),
		cli.WithParserConfig(cli.CobraParserConfig{
			ShortHelpSections: []string{schema.DefaultSlug, ClientSectionSlug},
			AppName:           AppName,
		}),
	)
	if err != nil {
		return nil, errors.Wrapf(err, "building the %s command", command.Description().Name)
	}
	return cobraCmd, nil
}

// AddCommands builds each command and attaches it to parent.
//
// This is the only thing a group's root.go has to do, and it is why no verb
// file contains cobra wiring.
func AddCommands(parent *cobra.Command, builders ...Builder) error {
	for _, build := range builders {
		command, err := build()
		if err != nil {
			return err
		}
		cobraCmd, err := BuildCobraCommand(command)
		if err != nil {
			return err
		}
		parent.AddCommand(cobraCmd)
	}
	return nil
}

// Registrar attaches a group's verbs wherever they belong in the tree.
//
// The registrars live in subpackages of this one — pkg/cli/drops,
// pkg/cli/events and so on — and those subpackages import this package for the
// client section, the row projections and the exit helper. So the dependency
// has to run one way only: this package must not import them back. NewRootCmd
// therefore takes the registrars as arguments and cmd/datadrop/main.go names
// them, which is the one place in the tree that knows about every group.
type Registrar func(root *cobra.Command) error
