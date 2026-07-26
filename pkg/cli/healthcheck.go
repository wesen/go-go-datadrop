package cli

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/pkg/errors"
)

// HealthcheckCommand probes a running server.
//
// It exists because the runtime image is distroless: there is no shell, no
// curl, and no wget, so a compose healthcheck has nothing to run. Without one,
// `docker compose up --wait` reports the stack healthy while datadrop is
// crash-looping — which is exactly what happened the first time this stack was
// brought up, and cost more time than the twenty lines below.
//
// It is a BareCommand (DR-81): the exit code is the whole result.
type HealthcheckCommand struct {
	*cmds.CommandDescription
}

var _ cmds.BareCommand = &HealthcheckCommand{}

// NewHealthcheckCommand builds `datadrop healthcheck`.
func NewHealthcheckCommand() (cmds.Command, error) {
	return &HealthcheckCommand{cmds.NewCommandDescription(
		"healthcheck",
		cmds.WithShort("Probe a running datadrop server (for container health checks)"),
		cmds.WithLong(strings.TrimSpace(`
Probe GET /healthz and exit 0 when it answers 200.

Intended for a container healthcheck, where there is no shell to run curl in:

    healthcheck:
      test: ["CMD", "/usr/local/bin/datadrop", "healthcheck", "--url", "http://127.0.0.1:8080"]

The exit code is the whole result; there is no output worth reading in a
container.
`)),
		cmds.WithFlags(
			fields.New("url", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_HEALTH_URL", "http://127.0.0.1:8080")),
				fields.WithHelp("base URL of the server to probe [$DATADROP_HEALTH_URL]")),
			fields.New("timeout", fields.TypeString,
				fields.WithDefault("3s"),
				fields.WithHelp("probe timeout")),
		),
	)}, nil
}

type healthcheckSettings struct {
	URL     string `glazed:"url"`
	Timeout string `glazed:"timeout"`
}

// Run probes the server.
func (c *HealthcheckCommand) Run(ctx context.Context, vals *values.Values) error {
	s := &healthcheckSettings{}
	if err := vals.DecodeSectionInto(schema.DefaultSlug, s); err != nil {
		return err
	}

	timeout, err := time.ParseDuration(s.Timeout)
	if err != nil {
		return errors.Wrapf(err, "invalid --timeout %q", s.Timeout)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.URL+"/healthz", nil)
	if err != nil {
		return errors.Wrap(err, "build health request")
	}

	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return errors.Wrap(err, "health request")
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return errors.Errorf("healthz returned %d", resp.StatusCode)
	}
	return nil
}
