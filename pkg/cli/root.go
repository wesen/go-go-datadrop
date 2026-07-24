// Package cli assembles the datadrop cobra command tree.
//
// The command surface follows design/01-mvp-design.md §5.4: one binary that is
// both the server (`datadrop serve`) and a thin client of the public HTTP API
// (everything else). Client subcommands must never reach into the SQLite file
// directly — if `datadrop push` works, `curl` works.
//
// In this first MVP slice only `serve` is implemented; the client commands are
// registered as stubs so the command tree, flag names and help text are fixed
// before handlers depend on them.
package cli

import (
	"os"
	"strings"
	"time"

	"github.com/go-go-golems/logcopter/pkg/logcopter"
	"github.com/pkg/errors"
	"github.com/rs/zerolog"
	"github.com/spf13/cobra"
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
type globalOptions struct {
	addr     string
	token    string
	logLevel string
	output   string
}

// ErrNotImplemented marks a command that exists to fix the interface but has
// no behaviour yet. Stub commands return it so `datadrop push` fails loudly
// rather than appearing to succeed.
var ErrNotImplemented = errors.New("not implemented yet in this MVP slice")

// NewRootCmd builds the full command tree.
func NewRootCmd() *cobra.Command {
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
			return configureLogging(opts.logLevel)
		},
	}

	flags := root.PersistentFlags()
	flags.StringVar(&opts.addr, "addr", envOr("DATADROP_ADDR", "http://localhost:8080"),
		"datadrop server base URL (client commands) [$DATADROP_ADDR]")
	flags.StringVar(&opts.token, "token", os.Getenv("DATADROP_TOKEN"),
		"bearer token [$DATADROP_TOKEN]")
	flags.StringVar(&opts.logLevel, "log-level", envOr("DATADROP_LOG_LEVEL", "info"),
		"log level: trace, debug, info, warn, error")
	flags.StringVar(&opts.output, "output", "table",
		"output format: table, json, ndjson, csv")

	root.AddCommand(
		newServeCmd(opts),
		newCreateCmd(opts),
		newPushCmd(opts),
		newQueryCmd(opts),
		newTailCmd(opts),
		newExportCmd(opts),
		newSchemaCmd(opts),
	)

	return root
}

// Execute runs the root command and maps errors onto the documented exit
// codes. It is the only place in the CLI that writes to stderr directly.
func Execute() int {
	if err := NewRootCmd().Execute(); err != nil {
		// Diagnostics go to stderr so `datadrop query … | jq` keeps working.
		_, _ = os.Stderr.WriteString("datadrop: " + err.Error() + "\n")
		return exitCodeFor(err)
	}
	return ExitOK
}

func exitCodeFor(err error) int {
	switch {
	case errors.Is(err, ErrNotImplemented):
		return ExitError
	default:
		return ExitError
	}
}

// configureLogging installs a console writer on stderr at the requested level.
//
// logcopter's default manager starts disabled with a Nop logger, so without
// this call the per-package `log` variables silently drop everything.
// Diagnostics go to stderr so that piping stdout stays clean (guide §11.4).
func configureLogging(level string) error {
	cfg := logcopter.Config{
		Output:    logcopter.OutputStderr,
		Format:    logcopter.FormatText,
		Level:     strings.ToLower(strings.TrimSpace(level)),
		Timestamp: true,
	}

	writer := logcopter.WriterForFormat(logcopter.WriterForOutput(cfg.Output), logcopter.OutputConfig{
		Output:     cfg.Output,
		Format:     cfg.Format,
		Timestamp:  cfg.Timestamp,
		TimeFormat: time.RFC3339,
	})

	base := zerolog.New(writer).With().Timestamp().Logger()
	if err := logcopter.Configure(base, cfg); err != nil {
		return errors.Wrapf(err, "invalid --log-level %q", level)
	}
	return nil
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
