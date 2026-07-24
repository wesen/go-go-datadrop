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
	"github.com/go-go-golems/go-go-datadrop/pkg/webui"
)

func newServeCmd(opts *globalOptions) *cobra.Command {
	var (
		listenAddr     string
		dbPath         string
		blobDir        string
		token          string
		maxBodyBytes   int64
		maxUploadBytes int64
		disableUI      bool
		uiDir          string
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
				disableUI:      disableUI,
				uiDir:          uiDir,
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
	flags.BoolVar(&disableUI, "no-ui", false, "do not mount the web UI at /ui")
	flags.StringVar(&uiDir, "ui-dir", "",
		"serve the web UI from this directory instead of the embedded copy")

	return cmd
}

type serveOptions struct {
	listenAddr     string
	dbPath         string
	blobDir        string
	token          string
	maxBodyBytes   int64
	maxUploadBytes int64
	disableUI      bool
	uiDir          string
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
		DisableUI:      opts.disableUI,
		UIDir:          opts.uiDir,
	}, st, blobs)
	if err != nil {
		return err
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		return srv.Serve(groupCtx, func(addr net.Addr) {
			event := log.Info().
				Str("addr", addr.String()).
				Str("db", st.Path()).
				Str("blobs", blobs.Root())
			if !opts.disableUI {
				event = event.Str("ui", uiURL(addr))
			}
			event.Msg("datadrop ready")
		})
	})

	return errors.Wrap(group.Wait(), "serve")
}

// uiURL turns a bound listener address into something a human can click.
//
// A wildcard bind renders as ":8080" or "[::]:8080", neither of which a browser
// will open, so the host is rewritten to localhost. Naming the port the server
// actually got also matters when --addr used port 0.
func uiURL(addr net.Addr) string {
	host, port, err := net.SplitHostPort(addr.String())
	if err != nil {
		return "http://" + addr.String() + webui.MountPath
	}
	if host == "" || host == "::" || host == "0.0.0.0" {
		host = "localhost"
	}
	return "http://" + net.JoinHostPort(host, port) + webui.MountPath
}
