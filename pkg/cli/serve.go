package cli

import (
	"context"
	"net"
	"os/signal"
	"syscall"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"

	"github.com/go-go-golems/go-go-datadrop/pkg/server"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

func newServeCmd(opts *globalOptions) *cobra.Command {
	var (
		listenAddr   string
		dbPath       string
		token        string
		maxBodyBytes int64
	)

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Run the datadrop HTTP server",
		Long: `Run the datadrop HTTP server against a SQLite database file.

The database is created and migrated on startup if it does not exist, so this
command is safe to re-run against the same file.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			// --token on this command overrides the persistent --token, which
			// is otherwise the *client* credential.
			if token == "" {
				token = opts.token
			}
			return runServe(cmd.Context(), serveOptions{
				listenAddr:   listenAddr,
				dbPath:       dbPath,
				token:        token,
				maxBodyBytes: maxBodyBytes,
			})
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&listenAddr, "addr", ":8080", "listen address")
	flags.StringVar(&dbPath, "db", "./datadrop.db", "path to the SQLite database file")
	flags.StringVar(&token, "token", "", "static bearer token required for writes (empty disables auth)")
	flags.Int64Var(&maxBodyBytes, "max-body-bytes", server.DefaultMaxBodyBytes, "maximum accepted request body size")

	return cmd
}

type serveOptions struct {
	listenAddr   string
	dbPath       string
	token        string
	maxBodyBytes int64
}

func runServe(ctx context.Context, opts serveOptions) error {
	// Ctrl-C and SIGTERM cancel ctx, which unwinds Serve and then the store.
	ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, opts.dbPath)
	if err != nil {
		return err
	}
	defer func() {
		if err := st.Close(); err != nil {
			log.Error().Err(err).Msg("failed to close store")
		}
	}()

	if opts.token == "" {
		log.Warn().Msg("no --token configured: write endpoints are unauthenticated")
	}

	srv, err := server.New(server.Config{
		Addr:         opts.listenAddr,
		Token:        opts.token,
		MaxBodyBytes: opts.maxBodyBytes,
	}, st)
	if err != nil {
		return err
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		return srv.Serve(groupCtx, func(addr net.Addr) {
			log.Info().
				Str("addr", addr.String()).
				Str("db", st.Path()).
				Msg("datadrop ready")
		})
	})

	return errors.Wrap(group.Wait(), "serve")
}
