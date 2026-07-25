package cli

import (
	"net/http"
	"os"
	"time"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

// newHealthcheckCmd adds a container-friendly liveness probe.
//
// It exists because the runtime image is distroless: there is no shell, no
// curl, and no wget, so a compose healthcheck has nothing to run. Without one,
// `docker compose up --wait` reports the stack healthy while datadrop is
// crash-looping — which is exactly what happened the first time this stack was
// brought up, and cost more time than the twenty lines below.
func newHealthcheckCmd() *cobra.Command {
	var (
		url     string
		timeout time.Duration
	)

	cmd := &cobra.Command{
		Use:   "healthcheck",
		Short: "Probe a running datadrop server (for container health checks)",
		Long: `Probe GET /healthz and exit 0 when it answers 200.

Intended for a container healthcheck, where there is no shell to run curl in:

    healthcheck:
      test: ["CMD", "/usr/local/bin/datadrop", "healthcheck", "--url", "http://127.0.0.1:8080"]`,
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client := &http.Client{Timeout: timeout}
			req, err := http.NewRequestWithContext(cmd.Context(), http.MethodGet, url+"/healthz", nil)
			if err != nil {
				return errors.Wrap(err, "build health request")
			}
			resp, err := client.Do(req)
			if err != nil {
				return errors.Wrap(err, "health request")
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != http.StatusOK {
				return errors.Errorf("healthz returned %d", resp.StatusCode)
			}
			return nil
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&url, "url", envOr("DATADROP_HEALTH_URL", "http://127.0.0.1:8080"),
		"base URL of the server to probe")
	flags.DurationVar(&timeout, "timeout", 3*time.Second, "probe timeout")

	// Health output goes nowhere useful in a container; the exit code is the
	// whole result.
	cmd.SetOut(os.Stderr)
	return cmd
}
