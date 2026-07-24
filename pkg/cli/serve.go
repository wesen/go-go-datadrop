package cli

import (
	"context"
	"net"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"

	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/server"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

func newServeCmd(opts *globalOptions) *cobra.Command {
	var (
		listenAddr     string
		dbPath         string
		blobDir        string
		token          string
		maxBodyBytes   int64
		maxUploadBytes int64
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
				listenAddr:     listenAddr,
				dbPath:         dbPath,
				blobDir:        blobDir,
				token:          token,
				maxBodyBytes:   maxBodyBytes,
				maxUploadBytes: maxUploadBytes,
			})
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&listenAddr, "addr", ":8080", "listen address")
	flags.StringVar(&dbPath, "db", "./datadrop.db", "path to the SQLite database file")
	flags.StringVar(&blobDir, "blobs", "", "directory holding dataset file bytes (default: <db-dir>/blobs)")
	flags.StringVar(&token, "token", "", "static bearer token required for writes (empty disables auth)")
	flags.Int64Var(&maxBodyBytes, "max-body-bytes", server.DefaultMaxBodyBytes,
		"maximum accepted JSON request body size")
	flags.Int64Var(&maxUploadBytes, "max-upload-bytes", server.DefaultMaxUploadBytes,
		"maximum accepted dataset file upload size")

	return cmd
}

type serveOptions struct {
	listenAddr     string
	dbPath         string
	blobDir        string
	token          string
	maxBodyBytes   int64
	maxUploadBytes int64
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

	// Blobs default to a sibling of the database so that a single --db path is
	// enough to run the server, and so that the two stay on one filesystem —
	// which the blob store's atomic-rename publish depends on.
	blobDir := opts.blobDir
	if blobDir == "" {
		blobDir = filepath.Join(filepath.Dir(st.Path()), "blobs")
	}
	blobs, err := blob.Open(blobDir)
	if err != nil {
		return err
	}

	srv, err := server.New(server.Config{
		Addr:           opts.listenAddr,
		Token:          opts.token,
		MaxBodyBytes:   opts.maxBodyBytes,
		MaxUploadBytes: opts.maxUploadBytes,
	}, st, blobs)
	if err != nil {
		return err
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		return srv.Serve(groupCtx, func(addr net.Addr) {
			log.Info().
				Str("addr", addr.String()).
				Str("db", st.Path()).
				Str("blobs", blobs.Root()).
				Msg("datadrop ready")
		})
	})

	return errors.Wrap(group.Wait(), "serve")
}
