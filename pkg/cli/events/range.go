package events

import (
	"time"

	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// StreamFlag names the stream within a drop.
//
// It is "drop-stream" and not "stream", which it was before this ticket,
// because glazed's output section owns --stream: a bool that switches
// row-at-a-time emission. Two sections cannot both define it. Building the
// command with the old name fails, and fails loudly enough to take the whole
// binary with it:
//
//	$ datadrop query greenhouse
//	datadrop: building the query command: Flag 'stream' (usage: stream within
//	the drop - <string>) already exists
//
// That is the tree failing to assemble, so *no* verb runs, not just this one.
// glazed's --stream cannot be renamed or removed either: a section's fields are
// fixed at construction and its settings struct reads them by tag.
//
// So the datadrop flag moved. --drop-stream says which noun the stream belongs
// to, which is also what made the old name ambiguous the moment row-streaming
// existed.
const StreamFlag = "drop-stream"

// rangeSettings are the query bounds shared by query, tail and export.
type rangeSettings struct {
	Stream    string `glazed:"drop-stream"`
	Limit     int    `glazed:"limit"`
	Order     string `glazed:"order"`
	From      string `glazed:"from"`
	To        string `glazed:"to"`
	After     int64  `glazed:"after"`
	TimeField string `glazed:"time-field"`
}

// rangeFields declares the bounds. defaultLimit differs per verb: a query pages
// 50, a tail shows the last 10, an export takes everything it is allowed.
func rangeFields(defaultLimit int) []*fields.Definition {
	return []*fields.Definition{
		fields.New(StreamFlag, fields.TypeString,
			fields.WithDefault(datadrop.DefaultStream),
			fields.WithHelp("stream within the drop (was --stream before v0.2)")),
		fields.New("limit", fields.TypeInteger,
			fields.WithDefault(defaultLimit),
			fields.WithHelp("maximum number of events (server caps at 1000)")),
		fields.New("order", fields.TypeChoice,
			fields.WithChoices("asc", "desc"),
			fields.WithDefault("desc"),
			fields.WithHelp("sequence order")),
		fields.New("from", fields.TypeString,
			fields.WithDefault(""),
			fields.WithHelp("inclusive lower time bound (RFC3339)")),
		fields.New("to", fields.TypeString,
			fields.WithDefault(""),
			fields.WithHelp("exclusive upper time bound (RFC3339)")),
		fields.New("after", fields.TypeInteger,
			fields.WithDefault(0),
			fields.WithHelp("return only events with a sequence greater than this")),
		fields.New("time-field", fields.TypeChoice,
			fields.WithChoices("time", "received_at"),
			fields.WithDefault("time"),
			fields.WithHelp("timestamp --from/--to filter on")),
	}
}

// query builds an EventQuery, reporting bad flag values before any request is
// made — a usage error must not cost a round trip.
func (s *rangeSettings) query(drop string) (datadrop.EventQuery, error) {
	q := datadrop.EventQuery{
		Drop:   drop,
		Stream: s.Stream,
		Limit:  s.Limit,
		After:  s.After,
	}

	order, err := datadrop.ParseOrder(s.Order)
	if err != nil {
		return datadrop.EventQuery{}, err
	}
	q.Order = order

	timeField, err := datadrop.ParseTimeField(s.TimeField)
	if err != nil {
		return datadrop.EventQuery{}, err
	}
	q.TimeField = timeField

	for _, bound := range []struct {
		name  string
		value string
		field *time.Time
	}{
		{"--from", s.From, &q.From},
		{"--to", s.To, &q.To},
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
