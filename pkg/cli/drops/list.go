package drops

import (
	"context"
	"strings"

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/go-go-golems/glazed/pkg/middlewares"
	"github.com/go-go-golems/glazed/pkg/settings"

	ddcli "github.com/go-go-golems/go-go-datadrop/pkg/cli"
)

// ListCommand lists the drops the credential can see.
type ListCommand struct {
	*cmds.CommandDescription
}

var _ cmds.GlazeCommand = &ListCommand{}

// NewListCommand builds `datadrop list`.
func NewListCommand() (cmds.Command, error) {
	glazedSection, err := settings.NewGlazedSchema()
	if err != nil {
		return nil, err
	}
	clientSection, err := ddcli.NewClientSection()
	if err != nil {
		return nil, err
	}

	return &ListCommand{cmds.NewCommandDescription(
		"list",
		cmds.WithShort("List drops"),
		cmds.WithLong(strings.TrimSpace(`
List the drops this credential can see, one row per drop.

The output is a Glazed table, so every rendering and filtering flag applies:

    datadrop list
    datadrop list --output json
    datadrop list --output csv --fields name,created_at
    datadrop list --sort-by name
    datadrop list --jq 'select(.public_read)'
    datadrop list --select name

Note that --jq filters rows while --filter removes columns; they read as each
other's opposite and are not.
`)),
		cmds.WithSections(glazedSection, clientSection),
	)}, nil
}

// RunIntoGlazeProcessor emits one row per drop.
//
// It returns errors rather than exiting on them. The exit-code mapping is
// applied by ddcli.WithExitCodes at registration, so a verb body stays ordinary
// Go and cannot forget it.
func (c *ListCommand) RunIntoGlazeProcessor(
	ctx context.Context, vals *values.Values, gp middlewares.Processor,
) error {
	api, err := ddcli.ClientFrom(vals)
	if err != nil {
		return err
	}

	found, err := api.ListDrops(ctx)
	if err != nil {
		return err
	}

	for _, drop := range found {
		if err := gp.AddRow(ctx, ddcli.RowForDrop(drop)); err != nil {
			return err
		}
	}
	return nil
}
