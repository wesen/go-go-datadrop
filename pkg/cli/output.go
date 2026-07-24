package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// Output formats for client commands.
const (
	OutputTable  = "table"
	OutputJSON   = "json"
	OutputNDJSON = "ndjson"
)

// newClient builds an API client from the global flags.
func newClient(opts *globalOptions) (*client.Client, error) {
	return client.New(opts.addr, opts.token)
}

// parseOutput validates the --output flag.
func parseOutput(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case OutputTable, "":
		return OutputTable, nil
	case OutputJSON:
		return OutputJSON, nil
	case OutputNDJSON:
		return OutputNDJSON, nil
	default:
		return "", errors.Errorf("invalid --output %q: expected table, json, or ndjson", value)
	}
}

// renderEvents writes a result set to w in the requested format.
//
// Results go to stdout and diagnostics to stderr, so `datadrop query … | jq`
// keeps working at any log level.
func renderEvents(w io.Writer, format string, events []datadrop.Envelope) error {
	switch format {
	case OutputJSON:
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return errors.Wrap(encoder.Encode(events), "encode events")

	case OutputNDJSON:
		encoder := json.NewEncoder(w)
		for _, e := range events {
			if err := encoder.Encode(e); err != nil {
				return errors.Wrap(err, "encode event")
			}
		}
		return nil

	default:
		return renderEventTable(w, events)
	}
}

// renderEventTable prints the columns a human scanning a terminal actually
// wants: when, which sequence, and the payload. The full envelope is one
// `--output json` away.
func renderEventTable(w io.Writer, events []datadrop.Envelope) error {
	if len(events) == 0 {
		_, err := fmt.Fprintln(w, "no events")
		return errors.Wrap(err, "write table")
	}

	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	if _, err := fmt.Fprintln(tw, "SEQ\tTIME\tSOURCE\tDATA"); err != nil {
		return errors.Wrap(err, "write table header")
	}

	for _, e := range events {
		if _, err := fmt.Fprintf(tw, "%d\t%s\t%s\t%s\n",
			e.Seq,
			e.Time.UTC().Format("2006-01-02T15:04:05.000Z"),
			orDash(e.Source),
			truncate(string(e.Data), 72),
		); err != nil {
			return errors.Wrap(err, "write table row")
		}
	}
	return errors.Wrap(tw.Flush(), "flush table")
}

// renderEvent writes a single event, used by `tail --follow` as each one
// arrives.
func renderEvent(w io.Writer, format string, e datadrop.Envelope) error {
	switch format {
	case OutputJSON, OutputNDJSON:
		return errors.Wrap(json.NewEncoder(w).Encode(e), "encode event")
	default:
		_, err := fmt.Fprintf(w, "%-8d %s  %s\n",
			e.Seq,
			e.Time.UTC().Format("2006-01-02T15:04:05.000Z"),
			truncate(string(e.Data), 96))
		return errors.Wrap(err, "write event")
	}
}

// renderDrops prints a drop listing.
func renderDrops(w io.Writer, format string, drops []datadrop.Drop) error {
	if format == OutputJSON || format == OutputNDJSON {
		encoder := json.NewEncoder(w)
		if format == OutputJSON {
			encoder.SetIndent("", "  ")
		}
		return errors.Wrap(encoder.Encode(drops), "encode drops")
	}

	if len(drops) == 0 {
		_, err := fmt.Fprintln(w, "no drops")
		return errors.Wrap(err, "write table")
	}

	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	if _, err := fmt.Fprintln(tw, "NAME\tCREATED\tRETENTION\tPUBLIC READ"); err != nil {
		return errors.Wrap(err, "write table header")
	}
	for _, d := range drops {
		if _, err := fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n",
			d.Name,
			d.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
			orDash(d.Retention),
			strconv.FormatBool(d.PublicRead),
		); err != nil {
			return errors.Wrap(err, "write table row")
		}
	}
	return errors.Wrap(tw.Flush(), "flush table")
}

// renderJSON writes any value in the requested format, defaulting to indented
// JSON because there is no useful table shape for a single object.
func renderJSON(w io.Writer, v any) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return errors.Wrap(encoder.Encode(v), "encode response")
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return s[:limit-1] + "…"
}
