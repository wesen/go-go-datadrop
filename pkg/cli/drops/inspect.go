package drops

import (
	"context"
	"strings"

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/glazed/pkg/middlewares"
	"github.com/go-go-golems/glazed/pkg/settings"

	ddcli "github.com/go-go-golems/go-go-datadrop/pkg/cli"
)

// InspectCommand shows one drop's metadata and counters.
type InspectCommand struct {
	*cmds.CommandDescription
}

var _ cmds.GlazeCommand = &InspectCommand{}

// NewInspectCommand builds `datadrop inspect DROP`.
//
// It returns one row rather than an indented JSON object, which looks like
// ceremony and is not. It makes --output json mean the same thing here as it
// does for list — an array, not a bare object, so a script does not have to
// know which verb it called. And it makes `datadrop inspect X --select
// event_count` a thing anyone can type, where before it needed jq.
func NewInspectCommand() (cmds.Command, error) {
	glazedSection, err := settings.NewGlazedSchema()
	if err != nil {
		return nil, err
	}
	clientSection, err := ddcli.NewClientSection()
	if err != nil {
		return nil, err
	}

	return &InspectCommand{cmds.NewCommandDescription(
		"inspect",
		cmds.WithShort("Show a drop's metadata and counters"),
		cmds.WithLong(strings.TrimSpace(`
Show one drop's metadata alongside its cheap counters: how many events it
holds, the highest sequence allocated, when the last event arrived, and which
streams exist.

    datadrop inspect greenhouse
    datadrop inspect greenhouse --output json
    datadrop inspect greenhouse --select event_count
`)),
		cmds.WithArguments(
			fields.New("drop", fields.TypeString,
				fields.WithIsArgument(true),
				fields.WithHelp("the drop to inspect")),
		),
		cmds.WithSections(glazedSection, clientSection),
	)}, nil
}

type inspectSettings struct {
	Drop string `glazed:"drop"`
}

// RunIntoGlazeProcessor emits the one row.
func (c *InspectCommand) RunIntoGlazeProcessor(
	ctx context.Context, vals *values.Values, gp middlewares.Processor,
) error {
	s := &inspectSettings{}
	if err := vals.DecodeSectionInto(schema.DefaultSlug, s); err != nil {
		return err
	}

	api, err := ddcli.ClientFrom(vals)
	if err != nil {
		return err
	}

	stats, err := api.GetDrop(ctx, s.Drop)
	if err != nil {
		return err
	}
	return gp.AddRow(ctx, ddcli.RowForDropStats(stats))
}
