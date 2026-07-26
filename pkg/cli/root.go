// Package cli assembles the datadrop cobra command tree.
//
// The command surface follows design/01-mvp-design.md §5.4: one binary that is
// both the server (`datadrop serve`) and a thin client of the public HTTP API
// (everything else). Client subcommands must never reach into the SQLite file
// directly — if `datadrop push` works, `curl` works, because both exercise the
// same endpoints.
package cli

import (
	"net/http"
	"os"
	"strings"

	"github.com/go-go-golems/glazed/pkg/cmds/logging"
	"github.com/go-go-golems/glazed/pkg/help"
	help_cmd "github.com/go-go-golems/glazed/pkg/help/cmd"
	"github.com/pkg/errors"
	"github.com/spf13/cobra"

	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/doc"
)

// ExitCode values are part of the CLI contract (guide §11.4). Scripts depend
// on them, so they must not be renumbered.
const (
	ExitOK         = 0
	ExitError      = 1
	ExitUsage      = 2
	ExitAuth       = 3
	ExitNotFound   = 4
	ExitValidation = 5
)

// globalOptions are the flags shared by every subcommand.
//
// Logging is deliberately absent. It used to hold a logLevel string bound to a
// hand-rolled --log-level flag; the Glazed logging section owns that flag now
// and reads it straight off the cobra command, so a field here would be a
// second copy nothing writes to.
type globalOptions struct {
	addr   string
	token  string
	output string
}

// NewRootCmd builds the full command tree.
//
// It returns an error rather than panicking when the embedded documentation
// fails to load. That failure means a help page carries malformed frontmatter or
// a duplicate slug — a mistake made at authoring time that the compiler cannot
// see, so it must surface as a plain message rather than as a stack trace.
func NewRootCmd() (*cobra.Command, error) {
	opts := &globalOptions{}

	root := &cobra.Command{
		Use:   "datadrop",
		Short: "A self-hostable, CLI-first research data inbox",
		Long: strings.TrimSpace(`
datadrop stores append-only event data in a single SQLite file and serves it
over HTTP: ingest, latest-N and time-range queries, live SSE streaming, and
CSV/NDJSON/JSON export.

Run the server:

    datadrop serve --addr :8080 --db ./datadrop.db --token secret

Then, from another shell:

    export DATADROP_TOKEN=secret
    datadrop create greenhouse
    datadrop push greenhouse temperature=21.7 humidity=0.48
    datadrop query greenhouse --limit 10
    datadrop tail greenhouse --follow
    datadrop export greenhouse --format csv
`),
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			return logging.InitLoggerFromCobra(cmd)
		},
	}

	flags := root.PersistentFlags()
	flags.StringVar(&opts.addr, "addr", envOr("DATADROP_ADDR", "http://localhost:8080"),
		"datadrop server base URL (client commands) [$DATADROP_ADDR]")
	flags.StringVar(&opts.token, "token", os.Getenv("DATADROP_TOKEN"),
		"bearer token [$DATADROP_TOKEN]")
	flags.StringVar(&opts.output, "output", "table",
		"output format: table, json, ndjson, csv")

	root.AddCommand(
		newServeCmd(opts),
		newCreateCmd(opts),
		newListCmd(opts),
		newInspectCmd(opts),
		newPushCmd(opts),
		newQueryCmd(opts),
		newTailCmd(opts),
		newExportCmd(opts),
		newSchemaCmd(opts),
		newDatasetCmd(opts),
		newWhoamiCmd(opts),
		newHealthcheckCmd(),
	)

	// The Glazed help system, loaded from the pages embedded in pkg/doc.
	//
	// SetupCobraRootCommand replaces cobra's default help with one that knows
	// about sections, so `datadrop help web-ui-object-model` resolves a slug and
	// `datadrop help --topic web-ui` filters. It must be called exactly once, on
	// the root, after the subcommands are attached.
	helpSystem := help.NewHelpSystem()
	if err := doc.AddDocToHelpSystem(helpSystem); err != nil {
		return nil, errors.Wrap(err, "loading embedded documentation")
	}
	help_cmd.SetupCobraRootCommand(helpSystem, root)

	if err := addLoggingSection(root); err != nil {
		return nil, err
	}

	return root, nil
}

// addLoggingSection installs the Glazed logging flags and restores the
// DATADROP_LOG_LEVEL fallback on top of them.
//
// The section registers --log-level itself, with the same name and the same
// "info" default the hand-rolled flag had, and adds --log-file, --log-format,
// --with-caller, --log-to-stdout, --log-config, --log-area and
// --strict-log-areas beside it. This is not a change of logging backend:
// glazed's logging package configures logcopter, which is what this project
// already used. What it adds is the flag surface — in particular --log-area,
// which turns the areas logcopter-gen already emits for every package under
// pkg/ into something addressable from the command line.
//
// The environment fallback has to be applied by Set rather than by changing the
// flag's default, and the reason is specific: InitLoggerFromCobra reads a flag
// only when pflag reports it as Changed, so a default nobody typed is a default
// it never sees. Set marks it Changed. An explicit --log-level on the command
// line is parsed afterwards and still wins.
func addLoggingSection(root *cobra.Command) error {
	if err := logging.AddLoggingSectionToRootCommand(root, "datadrop"); err != nil {
		return errors.Wrap(err, "adding the logging section")
	}
	if level := strings.TrimSpace(os.Getenv("DATADROP_LOG_LEVEL")); level != "" {
		if err := root.PersistentFlags().Set("log-level", level); err != nil {
			return errors.Wrapf(err, "invalid DATADROP_LOG_LEVEL %q", level)
		}
	}
	return nil
}

// Execute runs the root command and maps errors onto the documented exit
// codes. It is the only place in the CLI that writes to stderr directly.
func Execute() int {
	root, err := NewRootCmd()
	if err != nil {
		_, _ = os.Stderr.WriteString("datadrop: " + err.Error() + "\n")
		return ExitError
	}
	if err := root.Execute(); err != nil {
		// Diagnostics go to stderr so `datadrop query … | jq` keeps working.
		_, _ = os.Stderr.WriteString("datadrop: " + err.Error() + "\n")
		return exitCodeFor(err)
	}
	return ExitOK
}

// exitCodeFor maps an error onto the documented exit codes, so a script can
// branch on why a command failed without parsing its stderr.
func exitCodeFor(err error) int {
	var apiErr *client.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Status {
		case http.StatusUnauthorized, http.StatusForbidden:
			return ExitAuth
		case http.StatusNotFound:
			return ExitNotFound
		case http.StatusBadRequest, http.StatusUnprocessableEntity,
			http.StatusConflict, http.StatusRequestEntityTooLarge:
			return ExitValidation
		}
	}
	return ExitError
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
