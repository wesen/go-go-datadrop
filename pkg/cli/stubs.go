package cli

import (
	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

// The commands in this file exist to fix the CLI contract — command names,
// argument shapes, flag names and help text — before the handlers that back
// them are written. Each returns ErrNotImplemented so a caller never mistakes
// a stub for a successful operation.
//
// The MVP task that fills each one in is noted on the command. See
// ttmp/2026/07/24/DATADROP-1--*/design/02-intern-implementation-guide.md §13.

func notImplemented(task string) error {
	return errors.Wrapf(ErrNotImplemented, "%s", task)
}

// newCreateCmd backs `POST /v1/drops` (MVP task 3).
func newCreateCmd(_ *globalOptions) *cobra.Command {
	var (
		publicRead bool
		retention  string
	)

	cmd := &cobra.Command{
		Use:   "create NAME",
		Short: "Create a drop",
		Long: `Create a named drop.

A drop is the unit of naming, sharing and export. It always has a default
stream called "events".`,
		Args: cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop create (MVP task 3: ingest)")
		},
	}

	cmd.Flags().BoolVar(&publicRead, "public-read", false, "allow unauthenticated reads of this drop")
	cmd.Flags().StringVar(&retention, "retention", "", `retention window, e.g. "90d" (stored but not enforced in v0.1)`)

	return cmd
}

// newPushCmd backs `POST /v1/drops/{name}/events` (MVP task 3).
func newPushCmd(_ *globalOptions) *cobra.Command {
	var (
		stream       string
		fromStdin    bool
		ndjson       bool
		stringValues []string
	)

	cmd := &cobra.Command{
		Use:   "push DROP [key=value ...]",
		Short: "Append an event to a drop",
		Long: `Append an event to a drop.

Values in key=value pairs are parsed as JSON when possible, so temperature=21.7
becomes the number 21.7 rather than the string "21.7". Use --string to force
string interpretation.

Payloads can also be piped in:

    printf '{"temperature":22.8}' | datadrop push greenhouse --stdin
    cat readings.ndjson | datadrop push greenhouse --stdin --ndjson`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop push (MVP task 3: ingest)")
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&stream, "stream", "events", "stream within the drop")
	flags.BoolVar(&fromStdin, "stdin", false, "read the payload from stdin instead of key=value arguments")
	flags.BoolVar(&ndjson, "ndjson", false, "with --stdin, treat input as newline-delimited JSON (one event per line)")
	flags.StringArrayVar(&stringValues, "string", nil, "key=value pair whose value is always treated as a string")

	return cmd
}

// newQueryCmd backs `GET /v1/drops/{name}/events` (MVP task 4).
func newQueryCmd(_ *globalOptions) *cobra.Command {
	var (
		stream    string
		limit     int
		order     string
		from      string
		to        string
		after     int64
		timeField string
	)

	cmd := &cobra.Command{
		Use:   "query DROP",
		Short: "Query events from a drop",
		Long: `Query events from a drop by count, sequence cursor, or time range.

    datadrop query greenhouse --limit 25
    datadrop query greenhouse --from 2026-07-01T00:00:00Z --to 2026-07-02T00:00:00Z
    datadrop query greenhouse --after 18440 --order asc`,
		Args: cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop query (MVP task 4: query)")
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&stream, "stream", "events", "stream within the drop")
	flags.IntVar(&limit, "limit", 50, "maximum number of events (server caps at 1000)")
	flags.StringVar(&order, "order", "desc", "sort order: asc or desc")
	flags.StringVar(&from, "from", "", "inclusive lower time bound (RFC3339)")
	flags.StringVar(&to, "to", "", "exclusive upper time bound (RFC3339)")
	flags.Int64Var(&after, "after", 0, "return only events with a sequence greater than this")
	flags.StringVar(&timeField, "time-field", "time", "timestamp --from/--to filter on: time or received_at")

	return cmd
}

// newTailCmd backs `GET /v1/drops/{name}/events/stream` (MVP tasks 4 and 5).
func newTailCmd(_ *globalOptions) *cobra.Command {
	var (
		stream string
		limit  int
		follow bool
	)

	cmd := &cobra.Command{
		Use:   "tail DROP",
		Short: "Show the most recent events, optionally following new ones",
		Long: `Show the most recent events in a drop.

With --follow, the command subscribes to the drop's SSE stream and prints new
events as they are appended, resuming from the last sequence it saw if the
connection drops.`,
		Args: cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop tail (MVP task 4: query, task 5: stream)")
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&stream, "stream", "events", "stream within the drop")
	flags.IntVar(&limit, "limit", 10, "number of recent events to show before following")
	flags.BoolVarP(&follow, "follow", "f", false, "stream new events as they arrive")

	return cmd
}

// newExportCmd backs `GET /v1/drops/{name}/export` (MVP task 6).
func newExportCmd(_ *globalOptions) *cobra.Command {
	var (
		stream string
		format string
		from   string
		to     string
		after  int64
		limit  int
	)

	cmd := &cobra.Command{
		Use:   "export DROP",
		Short: "Export a drop's events in an open format",
		Long: `Export a drop's events as CSV, NDJSON, or JSON.

    datadrop export greenhouse --format csv > readings.csv
    datadrop export greenhouse --format ndjson --from 2026-07-23T00:00:00Z`,
		Args: cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop export (MVP task 6: export)")
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&stream, "stream", "events", "stream within the drop")
	flags.StringVar(&format, "format", "ndjson", "output format: csv, ndjson, or json")
	flags.StringVar(&from, "from", "", "inclusive lower time bound (RFC3339)")
	flags.StringVar(&to, "to", "", "exclusive upper time bound (RFC3339)")
	flags.Int64Var(&after, "after", 0, "export only events with a sequence greater than this")
	flags.IntVar(&limit, "limit", 1000, "maximum number of events to export")

	return cmd
}

// newSchemaCmd backs the schema endpoints (MVP task 3).
func newSchemaCmd(_ *globalOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "schema",
		Short: "Manage a drop's JSON Schema contracts",
	}

	var (
		putStream string
		file      string
		mode      string
	)
	put := &cobra.Command{
		Use:   "put DROP",
		Short: "Register a new schema version for a stream",
		Long: `Register a new JSON Schema version for a stream.

Each put creates a new immutable version; the highest version is the active
one. Mode "strict" rejects invalid payloads with 422; mode "permissive"
accepts them and attaches warnings to the stored event.`,
		Args: cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop schema put (MVP task 3: ingest)")
		},
	}
	put.Flags().StringVar(&putStream, "stream", "events", "stream within the drop")
	put.Flags().StringVar(&file, "file", "", "path to the JSON Schema document (required)")
	put.Flags().StringVar(&mode, "mode", "strict", "validation mode: strict or permissive")

	var showStream string
	show := &cobra.Command{
		Use:   "show DROP",
		Short: "Show the active schema for a stream",
		Args:  cobra.ExactArgs(1),
		RunE: func(*cobra.Command, []string) error {
			return notImplemented("datadrop schema show (MVP task 3: ingest)")
		},
	}
	show.Flags().StringVar(&showStream, "stream", "events", "stream within the drop")

	cmd.AddCommand(put, show)
	return cmd
}
