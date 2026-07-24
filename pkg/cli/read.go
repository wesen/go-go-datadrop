package cli

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"

	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// timeRangeFlags are the query bounds shared by query, tail, and export.
type timeRangeFlags struct {
	stream    string
	limit     int
	order     string
	from      string
	to        string
	after     int64
	timeField string
}

func (f *timeRangeFlags) register(cmd *cobra.Command, defaultLimit int) {
	flags := cmd.Flags()
	flags.StringVar(&f.stream, "stream", datadrop.DefaultStream, "stream within the drop")
	flags.IntVar(&f.limit, "limit", defaultLimit, "maximum number of events (server caps at 1000)")
	flags.StringVar(&f.order, "order", "", "sort order: asc or desc")
	flags.StringVar(&f.from, "from", "", "inclusive lower time bound (RFC3339)")
	flags.StringVar(&f.to, "to", "", "exclusive upper time bound (RFC3339)")
	flags.Int64Var(&f.after, "after", 0, "return only events with a sequence greater than this")
	flags.StringVar(&f.timeField, "time-field", "", "timestamp --from/--to filter on: time or received_at")
}

// query builds an EventQuery, reporting bad flag values before any request.
func (f *timeRangeFlags) query(drop string) (datadrop.EventQuery, error) {
	q := datadrop.EventQuery{
		Drop:   drop,
		Stream: f.stream,
		Limit:  f.limit,
		After:  f.after,
	}

	order, err := datadrop.ParseOrder(f.order)
	if err != nil {
		return datadrop.EventQuery{}, err
	}
	q.Order = order

	timeField, err := datadrop.ParseTimeField(f.timeField)
	if err != nil {
		return datadrop.EventQuery{}, err
	}
	q.TimeField = timeField

	for _, bound := range []struct {
		name  string
		value string
		field *time.Time
	}{
		{"--from", f.from, &q.From},
		{"--to", f.to, &q.To},
	} {
		if bound.value == "" {
			continue
		}
		parsed, err := time.Parse(time.RFC3339, bound.value)
		if err != nil {
			return datadrop.EventQuery{}, errors.Wrapf(err,
				"invalid %s %q: expected an RFC3339 timestamp", bound.name, bound.value)
		}
		*bound.field = parsed.UTC()
	}

	return q, nil
}

func newQueryCmd(opts *globalOptions) *cobra.Command {
	var rangeFlags timeRangeFlags

	cmd := &cobra.Command{
		Use:   "query DROP",
		Short: "Query events from a drop",
		Long: `Query events from a drop by count, sequence cursor, or time range.

    datadrop query greenhouse --limit 25
    datadrop query greenhouse --from 2026-07-01T00:00:00Z --to 2026-07-02T00:00:00Z
    datadrop query greenhouse --after 18440 --order asc`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			format, err := parseOutput(opts.output)
			if err != nil {
				return err
			}
			q, err := rangeFlags.query(args[0])
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			result, err := api.Query(cmd.Context(), q)
			if err != nil {
				return err
			}
			return renderEvents(cmd.OutOrStdout(), format, result.Events)
		},
	}

	rangeFlags.register(cmd, datadrop.DefaultLimit)
	return cmd
}

func newTailCmd(opts *globalOptions) *cobra.Command {
	var (
		rangeFlags timeRangeFlags
		follow     bool
	)

	cmd := &cobra.Command{
		Use:   "tail DROP",
		Short: "Show the most recent events, optionally following new ones",
		Long: `Show the most recent events in a drop.

With --follow, the command subscribes to the drop's SSE stream and prints new
events as they are appended, resuming from the last sequence it saw if the
connection drops.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			format, err := parseOutput(opts.output)
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			drop := args[0]
			q, err := rangeFlags.query(drop)
			if err != nil {
				return err
			}
			// tail always shows the newest events first-fetched, then prints
			// them oldest-first so a follow reads chronologically.
			q.Order = datadrop.OrderDesc

			recent, err := api.Query(cmd.Context(), q)
			if err != nil {
				return err
			}

			ordered := reverse(recent.Events)
			if err := renderEvents(cmd.OutOrStdout(), format, ordered); err != nil {
				return err
			}

			if !follow {
				return nil
			}

			cursor := int64(0)
			if len(ordered) > 0 {
				cursor = ordered[len(ordered)-1].Seq
			}
			return followStream(cmd, api, drop, rangeFlags.stream, cursor, format)
		},
	}

	rangeFlags.register(cmd, 10)
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "stream new events as they arrive")

	return cmd
}

// followStream tails the SSE feed, reconnecting from the last sequence it saw.
//
// Resumption needs exactly one piece of state — the cursor — which is what
// makes the server's hub allowed to drop slow subscribers: a disconnect is
// recoverable, never lossy.
func followStream(
	cmd *cobra.Command, api *client.Client,
	drop, stream string, cursor int64, format string,
) error {
	out := cmd.OutOrStdout()
	stderr := cmd.ErrOrStderr()

	for {
		frames, errs, err := api.Stream(cmd.Context(), drop, stream, cursor)
		if err != nil {
			return err
		}

		disconnected := false
		for frame := range frames {
			switch frame.Name {
			case "reset":
				// The server evicted us for falling behind. Resume from the
				// cursor it reported rather than starting over.
				fmt.Fprintf(stderr, "note: stream reset (%s); resuming from seq %d\n",
					frame.Reset.Reason, frame.Reset.Cursor)
				if frame.Reset.Cursor > cursor {
					cursor = frame.Reset.Cursor
				}
				disconnected = true

			default:
				if frame.Envelope.Seq <= cursor {
					continue
				}
				if err := renderEvent(out, format, frame.Envelope); err != nil {
					return err
				}
				cursor = frame.Envelope.Seq
			}
		}

		if err := <-errs; err != nil {
			return err
		}
		if cmd.Context().Err() != nil {
			return nil
		}
		if !disconnected {
			// A clean end-of-stream means the server shut down or the
			// connection was closed; do not spin reconnecting.
			return nil
		}
	}
}

func newExportCmd(opts *globalOptions) *cobra.Command {
	var (
		rangeFlags timeRangeFlags
		format     string
		output     string
	)

	cmd := &cobra.Command{
		Use:   "export DROP",
		Short: "Export a drop's events in an open format",
		Long: `Export a drop's events as CSV, NDJSON, or JSON.

    datadrop export greenhouse --format csv > readings.csv
    datadrop export greenhouse --format ndjson --from 2026-07-23T00:00:00Z`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			q, err := rangeFlags.query(args[0])
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			body, err := api.Export(cmd.Context(), args[0], format, q)
			if err != nil {
				return err
			}
			defer func() { _ = body.Close() }()

			sink := cmd.OutOrStdout()
			if output != "" {
				file, err := os.Create(output)
				if err != nil {
					return errors.Wrapf(err, "create %s", output)
				}
				defer func() { _ = file.Close() }()
				sink = file
			}

			_, err = io.Copy(sink, body)
			return errors.Wrap(err, "write export")
		},
	}

	rangeFlags.register(cmd, datadrop.MaxLimit)
	cmd.Flags().StringVar(&format, "format", "ndjson", "output format: csv, ndjson, or json")
	cmd.Flags().StringVarP(&output, "output-file", "o", "", "write to a file instead of stdout")

	return cmd
}

func newSchemaCmd(opts *globalOptions) *cobra.Command {
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
		RunE: func(cmd *cobra.Command, args []string) error {
			if file == "" {
				return errors.New("--file is required (use \"-\" to read from stdin)")
			}
			parsedMode, err := datadrop.ParseMode(mode)
			if err != nil {
				return err
			}
			spec, err := readSpec(cmd, file)
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			result, err := api.PutSchema(cmd.Context(), args[0], putStream, spec, parsedMode)
			if err != nil {
				return err
			}
			return renderJSON(cmd.OutOrStdout(), result)
		},
	}
	put.Flags().StringVar(&putStream, "stream", datadrop.DefaultStream, "stream within the drop")
	put.Flags().StringVar(&file, "file", "", `path to the JSON Schema document, or "-" for stdin (required)`)
	put.Flags().StringVar(&mode, "mode", string(datadrop.ModeStrict), "validation mode: strict or permissive")

	var showStream string
	show := &cobra.Command{
		Use:   "show DROP",
		Short: "Show the active schema for a stream",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			sc, err := api.GetSchema(cmd.Context(), args[0], showStream)
			if err != nil {
				return err
			}
			return renderJSON(cmd.OutOrStdout(), sc)
		},
	}
	show.Flags().StringVar(&showStream, "stream", datadrop.DefaultStream, "stream within the drop")

	cmd.AddCommand(put, show)
	return cmd
}

func reverse(events []datadrop.Envelope) []datadrop.Envelope {
	reversed := make([]datadrop.Envelope, len(events))
	for i, e := range events {
		reversed[len(events)-1-i] = e
	}
	return reversed
}
