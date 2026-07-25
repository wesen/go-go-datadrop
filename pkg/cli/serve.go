package cli

import (
	"context"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/server"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
	"github.com/go-go-golems/go-go-datadrop/pkg/webui"
)

func newServeCmd(opts *globalOptions) *cobra.Command {
	var (
		listenAddr       string
		dbPath           string
		blobDir          string
		token            string
		authMode         string
		externalURL      string
		oidcIssuer       string
		oidcClientID     string
		oidcClientIDFile string
		oidcClientSecret string
		oidcSecretFile   string
		requireVerified  bool
		sessionLifetime  time.Duration
		sessionIdle      time.Duration
		maxBodyBytes     int64
		maxUploadBytes   int64
		disableUI        bool
		uiDir            string
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
				listenAddr:       listenAddr,
				dbPath:           dbPath,
				blobDir:          blobDir,
				token:            token,
				authMode:         authMode,
				externalURL:      externalURL,
				oidcIssuer:       oidcIssuer,
				oidcClientID:     oidcClientID,
				oidcClientIDFile: oidcClientIDFile,
				oidcClientSecret: oidcClientSecret,
				oidcSecretFile:   oidcSecretFile,
				requireVerified:  requireVerified,
				sessionLifetime:  sessionLifetime,
				sessionIdle:      sessionIdle,
				maxBodyBytes:     maxBodyBytes,
				maxUploadBytes:   maxUploadBytes,
				disableUI:        disableUI,
				uiDir:            uiDir,
			})
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&listenAddr, "addr", ":8080", "listen address")
	flags.StringVar(&dbPath, "db", "./datadrop.db", "path to the SQLite database file")
	flags.StringVar(&blobDir, "blobs", "", "directory holding dataset file bytes (default: <db-dir>/blobs)")
	flags.StringVar(&token, "token", "",
		"static root bearer token; in oidc mode this is an operator break-glass [$DATADROP_TOKEN]")
	flags.StringVar(&authMode, "auth", envOr("DATADROP_AUTH", ""),
		"authentication mode: none, token or oidc (default: token when --token is set, else none) [$DATADROP_AUTH]")
	flags.StringVar(&externalURL, "external-url", envOr("DATADROP_EXTERNAL_URL", ""),
		"the origin a browser reaches this server on, e.g. http://datadrop.localhost:7070 [$DATADROP_EXTERNAL_URL]")
	flags.StringVar(&oidcIssuer, "oidc-issuer", envOr("DATADROP_OIDC_ISSUER", ""),
		"OIDC issuer URL [$DATADROP_OIDC_ISSUER]")
	flags.StringVar(&oidcClientID, "oidc-client-id", envOr("DATADROP_OIDC_CLIENT_ID", ""),
		"OIDC client id [$DATADROP_OIDC_CLIENT_ID]")
	flags.StringVar(&oidcClientIDFile, "oidc-client-id-file", envOr("DATADROP_OIDC_CLIENT_ID_FILE", ""),
		"read the OIDC client id from this file")
	flags.StringVar(&oidcClientSecret, "oidc-client-secret", envOr("DATADROP_OIDC_CLIENT_SECRET", ""),
		"OIDC client secret [$DATADROP_OIDC_CLIENT_SECRET]")
	// A file, not just an environment variable: a secret passed by env is
	// visible in `docker inspect`, is inherited by every child process, and
	// lands in a crash dump of the process environment.
	flags.StringVar(&oidcSecretFile, "oidc-client-secret-file", envOr("DATADROP_OIDC_CLIENT_SECRET_FILE", ""),
		"read the OIDC client secret from this file (preferred over --oidc-client-secret)")
	flags.BoolVar(&requireVerified, "oidc-require-verified-email", true,
		"refuse a sign-in whose email is unverified at the provider")
	flags.DurationVar(&sessionLifetime, "session-lifetime", 12*time.Hour,
		"absolute session lifetime; never extended by activity")
	flags.DurationVar(&sessionIdle, "session-idle", 2*time.Hour,
		"sign out a session that has been unused for this long")
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
	listenAddr       string
	dbPath           string
	blobDir          string
	token            string
	authMode         string
	externalURL      string
	oidcIssuer       string
	oidcClientID     string
	oidcClientIDFile string
	oidcClientSecret string
	oidcSecretFile   string
	requireVerified  bool
	sessionLifetime  time.Duration
	sessionIdle      time.Duration
	maxBodyBytes     int64
	maxUploadBytes   int64
	disableUI        bool
	uiDir            string
}

// Every OIDC flag has an environment fallback (envOr, in root.go) so the
// compose file can supply configuration without a shell wrapper.

// readSecretFile loads a credential written to a file by the provisioning job.
func readSecretFile(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", errors.Wrapf(err, "read %s", path)
	}
	return strings.TrimSpace(string(raw)), nil
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

	authCfg, err := resolveAuth(opts)
	if err != nil {
		return err
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
		Auth:           authCfg.Auth,
		Token:          authCfg.Token,
		ExternalURL:    authCfg.ExternalURL,
		OIDC:           authCfg.OIDC,
		MaxBodyBytes:   opts.maxBodyBytes,
		MaxUploadBytes: opts.maxUploadBytes,
		DisableUI:      opts.disableUI,
		UIDir:          opts.uiDir,
	}, st, blobs)
	if err != nil {
		return err
	}

	// Discovery is a network call and New must not make one, so the relying
	// party is built here and installed. Retried, because the compose stack
	// starts datadrop as soon as provisioning exits and the provider may still
	// be finishing its first-boot projections.
	if authCfg.Auth == server.AuthOIDC {
		provider, err := auth.DiscoverWithRetry(ctx,
			authCfg.OIDC.Issuer, authCfg.OIDC.ClientID, authCfg.OIDC.ClientSecret,
			authCfg.RedirectURI(), authCfg.OIDC.Scopes, 20, 3*time.Second)
		if err != nil {
			return errors.Wrapf(err,
				"OIDC discovery at %s failed; if the message mentions a mismatched "+
					"issuer, the URL datadrop uses must be the same one the browser "+
					"uses (see guide 13.2)", authCfg.OIDC.Issuer)
		}
		srv.SetOIDCProvider(provider)
		log.Info().Str("redirect_uri", authCfg.RedirectURI()).Msg("OIDC relying party ready")
	}

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		return srv.Serve(groupCtx, func(addr net.Addr) {
			event := log.Info().
				Str("addr", addr.String()).
				Str("db", st.Path()).
				Str("blobs", blobs.Root())
			if !opts.disableUI {
				event = event.Str("ui", uiURL(addr, authCfg.ExternalURL))
			}
			event.Msg("datadrop ready")
		})
	})

	return errors.Wrap(group.Wait(), "serve")
}

// uiURL is the address to hand a human, which is not always the one bound.
//
// A wildcard bind renders as ":8080" or "[::]:8080", neither of which a browser
// will open, so the host is rewritten to localhost. Naming the port the server
// actually got also matters when --addr used port 0.
func uiURL(addr net.Addr, externalURL string) string {
	// The external URL wins whenever it is configured, because the bound
	// address is not necessarily reachable from anywhere a human is sitting.
	// In a container it never is: the listener says [::]:8080 and this line
	// used to print http://localhost:8080/ui/, which resolves to the container
	// itself and is exactly the wrong thing to hand someone.
	if externalURL != "" {
		return strings.TrimRight(externalURL, "/") + webui.MountPath
	}

	host, port, err := net.SplitHostPort(addr.String())
	if err != nil {
		return "http://" + addr.String() + webui.MountPath
	}
	if host == "" || host == "::" || host == "0.0.0.0" {
		host = "localhost"
	}
	return "http://" + net.JoinHostPort(host, port) + webui.MountPath
}

// resolveAuth turns the flag surface into a server auth configuration, and
// refuses to start on a misconfiguration that would fail open.
//
// The asymmetry is the point: getting oidc mode wrong is FATAL, while running
// deliberately open is a warning that names the consequence. A server that
// degrades quietly to open is the worst outcome in this whole ticket.
func resolveAuth(opts serveOptions) (server.Config, error) {
	cfg := server.Config{
		Auth:        opts.authMode,
		Token:       opts.token,
		ExternalURL: strings.TrimRight(opts.externalURL, "/"),
		OIDC: server.OIDCConfig{
			Issuer:               strings.TrimRight(opts.oidcIssuer, "/"),
			ClientID:             opts.oidcClientID,
			ClientSecret:         opts.oidcClientSecret,
			Scopes:               []string{"openid", "profile", "email"},
			RequireVerifiedEmail: opts.requireVerified,
			SessionLifetime:      opts.sessionLifetime,
			SessionIdle:          opts.sessionIdle,
		},
	}

	if cfg.Auth == "" {
		cfg.Auth = server.AuthNone
		if cfg.Token != "" {
			cfg.Auth = server.AuthToken
		}
	}

	if opts.oidcClientIDFile != "" {
		id, err := readSecretFile(opts.oidcClientIDFile)
		if err != nil {
			return cfg, err
		}
		cfg.OIDC.ClientID = id
	}
	if opts.oidcSecretFile != "" {
		secret, err := readSecretFile(opts.oidcSecretFile)
		if err != nil {
			return cfg, err
		}
		cfg.OIDC.ClientSecret = secret
	}

	switch cfg.Auth {
	case server.AuthNone:
		log.Warn().Msg("authentication is disabled (--auth=none): " +
			"every request is the root principal and every write is unauthenticated")
	case server.AuthToken:
		if cfg.Token == "" {
			return cfg, errors.New("--auth=token requires --token")
		}
		log.Info().Msg("authentication: static token; there are no user accounts in this mode")
	case server.AuthOIDC:
		var missing []string
		if cfg.OIDC.Issuer == "" {
			missing = append(missing, "--oidc-issuer")
		}
		if cfg.OIDC.ClientID == "" {
			missing = append(missing, "--oidc-client-id or --oidc-client-id-file")
		}
		if cfg.OIDC.ClientSecret == "" {
			missing = append(missing, "--oidc-client-secret or --oidc-client-secret-file")
		}
		if cfg.ExternalURL == "" {
			missing = append(missing, "--external-url")
		}
		if len(missing) > 0 {
			return cfg, errors.Errorf("--auth=oidc requires %s", strings.Join(missing, ", "))
		}

		if !server.PotentiallyTrustworthy(cfg.ExternalURL) {
			// Not fatal — someone is entitled to run this behind a TLS-
			// terminating proxy they have configured themselves — but it names
			// the consequence rather than saying "insecure".
			log.Warn().
				Str("external_url", cfg.ExternalURL).
				Msg("session cookies will be sent without the Secure attribute over plaintext HTTP, " +
					"and the browser will not expose crypto.subtle to the upload tile")
		}
		if cfg.Token != "" {
			log.Warn().Msg("a root --token is configured alongside OIDC: " +
				"it bypasses every ownership and membership check")
		}
		log.Info().
			Str("issuer", cfg.OIDC.Issuer).
			Str("external_url", cfg.ExternalURL).
			Bool("require_verified_email", cfg.OIDC.RequireVerifiedEmail).
			Msg("authentication: OIDC")
	default:
		return cfg, errors.Errorf("unknown --auth mode %q (want none, token or oidc)", cfg.Auth)
	}

	return cfg, nil
}
