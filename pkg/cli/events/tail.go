package events

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/glazed/pkg/middlewares"
	"github.com/go-go-golems/glazed/pkg/settings"

	ddcli "github.com/go-go-golems/go-go-datadrop/pkg/cli"
	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// tailDefaultLimit is how much recent history a tail shows before following.
const tailDefaultLimit = 10

// TailCommand shows the most recent events and optionally follows new ones.
type TailCommand struct {
	*cmds.CommandDescription
}

var _ cmds.GlazeCommand = &TailCommand{}

// NewTailCommand builds `datadrop tail DROP`.
//
// It sets two output defaults, and the second one is not optional the way the
// design guide's DR-80 assumes.
//
// --stream true is DR-80: without it the table formatter buffers every row so
// it can compute column widths, which for a --follow that never ends means
// printing nothing, forever — a failure indistinguishable from "no events are
// arriving".
//
// --table-format markdown is what makes --stream true actually do something,
// and finding that out took two rounds of watching an empty terminal.
//
// Round one: --stream true alone. glazed's SetupProcessorOutput asks for a row
// formatter and silently falls back to the buffering table formatter when it
// cannot get one (settings/glazed_section.go:582), and
// CreateRowOutputFormatter refuses output=table at the default ascii
// table-format outright (settings/settings_output.go:176,
// ErrorRowFormatUnsupported) — an ASCII box cannot be drawn a row at a time
// because its widths are a property of the whole set. So the flag changed
// nothing, and changed nothing quietly.
//
// Round two: --table-format tsv, which IS row-capable. Still nothing. The TSV
// and CSV row formatters write into an encoding/csv.Writer and only Flush in
// Close (formatters/csv/csv.go:86); OutputRow never flushes. The buffer moved
// one layer down and the terminal stayed empty.
//
// Of the row-capable table formats, markdown is the one that both streams and
// flushes, and it reads as a live log. Measured: with markdown, 48 bytes had
// reached the pipe one second after a push; with tsv, zero.
//
// `--table-format ascii` gets the box back and is the right thing for a
// bounded tail; combined with --follow it will appear to hang, which is why the
// help says so.
func NewTailCommand() (cmds.Command, error) {
	glazedSection, err := settings.NewGlazedSchema(
		settings.WithOutputSectionOptions(
			schema.WithDefaults(map[string]interface{}{
				"stream":       true,
				"table-format": "markdown",
			}),
		),
	)
	if err != nil {
		return nil, err
	}
	clientSection, err := ddcli.NewClientSection()
	if err != nil {
		return nil, err
	}

	return &TailCommand{cmds.NewCommandDescription(
		"tail",
		cmds.WithShort("Show the most recent events, optionally following new ones"),
		cmds.WithLong(strings.TrimSpace(`
Show the most recent events in a drop.

With --follow, the command subscribes to the drop's SSE stream and prints new
events as they are appended, resuming from the last sequence it saw if the
connection drops. Ctrl-C ends it and exits 0.

    datadrop tail greenhouse
    datadrop tail greenhouse --follow --fields time,data.temp_c

tail emits rows one at a time, so it defaults to --stream and to
--table-format markdown. An ASCII table cannot be drawn a row at a time — its
column widths are a property of the whole set — so a boxed --follow would print
nothing until the stream ended, which it never does. --table-format csv and tsv
have the same problem for a different reason: they buffer until close.

    datadrop tail greenhouse --table-format ascii   # the boxed table, buffered
    datadrop tail greenhouse --follow --output json # one JSON object per event
    datadrop tail greenhouse --follow --output yaml

Do not combine --table-format ascii, csv or tsv, or --stream=false, with
--follow: they will appear to hang. All of them are the right thing for a
bounded tail.
`)),
		cmds.WithArguments(
			fields.New("drop", fields.TypeString,
				fields.WithIsArgument(true),
				fields.WithHelp("the drop to read")),
		),
		cmds.WithFlags(append(rangeFields(tailDefaultLimit),
			fields.New("follow", fields.TypeBool,
				fields.WithShortFlag("f"),
				fields.WithDefault(false),
				fields.WithHelp("stream new events as they arrive")),
		)...),
		cmds.WithSections(glazedSection, clientSection),
	)}, nil
}

type tailSettings struct {
	Drop   string `glazed:"drop"`
	Follow bool   `glazed:"follow"`
	rangeSettings
}

// RunIntoGlazeProcessor emits the recent page and then, with --follow, one row
// per event as it arrives.
func (c *TailCommand) RunIntoGlazeProcessor(
	ctx context.Context, vals *values.Values, gp middlewares.Processor,
) error {
	s := &tailSettings{}
	if err := vals.DecodeSectionInto(schema.DefaultSlug, s); err != nil {
		return err
	}

	q, err := s.query(s.Drop)
	if err != nil {
		return err
	}
	// tail fetches the newest events, then emits them oldest-first so that a
	// follow reads chronologically from the page into the live stream.
	q.Order = datadrop.OrderDesc

	api, err := ddcli.ClientFrom(vals)
	if err != nil {
		return err
	}

	recent, err := api.Query(ctx, q)
	if err != nil {
		return err
	}

	ordered := reverse(recent.Events)
	if err := emitEvents(ctx, gp, ordered); err != nil {
		return err
	}

	if !s.Follow {
		return nil
	}

	cursor := int64(0)
	if len(ordered) > 0 {
		cursor = ordered[len(ordered)-1].Seq
	}
	return followStream(ctx, gp, api, s.Drop, s.Stream, cursor)
}

// followStream tails the SSE feed, reconnecting from the last sequence it saw.
//
// Resumption needs exactly one piece of state — the cursor — which is what
// makes the server's hub allowed to drop slow subscribers: a disconnect is
// recoverable, never lossy.
//
// The context is already wired to SIGINT and SIGTERM by glazed's cobra builder,
// so Ctrl-C cancels it here. A cancelled context is the user stopping something
// that was working, so it returns nil rather than an error.
func followStream(
	ctx context.Context, gp middlewares.Processor, api *client.Client,
	drop, stream string, cursor int64,
) error {
	for {
		frames, errs, err := api.Stream(ctx, drop, stream, cursor)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}

		disconnected := false
		for frame := range frames {
			switch frame.Name {
			case "reset":
				// The server evicted us for falling behind. Resume from the
				// cursor it reported rather than starting over.
				fmt.Fprintf(os.Stderr, "note: stream reset (%s); resuming from seq %d\n",
					frame.Reset.Reason, frame.Reset.Cursor)
				if frame.Reset.Cursor > cursor {
					cursor = frame.Reset.Cursor
				}
				disconnected = true

			default:
				if frame.Envelope.Seq <= cursor {
					continue
				}
				row, err := ddcli.RowForEnvelope(frame.Envelope)
				if err != nil {
					return err
				}
				if err := gp.AddRow(ctx, row); err != nil {
					return err
				}
				cursor = frame.Envelope.Seq
			}
		}

		if err := <-errs; err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		if ctx.Err() != nil {
			return nil
		}
		if !disconnected {
			// A clean end-of-stream means the server shut down or the
			// connection was closed; do not spin reconnecting.
			return nil
		}
	}
}

func reverse(events []datadrop.Envelope) []datadrop.Envelope {
	reversed := make([]datadrop.Envelope, len(events))
	for i, e := range events {
		reversed[len(events)-1-i] = e
	}
	return reversed
}
