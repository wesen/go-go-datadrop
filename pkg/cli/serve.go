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

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/pkg/errors"
	"golang.org/x/sync/errgroup"

	"github.com/go-go-golems/go-go-datadrop/pkg/auth"
	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/server"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
	"github.com/go-go-golems/go-go-datadrop/pkg/webui"
)

// ServeCommand runs the datadrop HTTP server.
//
// It is a BareCommand (DR-81): it runs until it is stopped and its output is
// log lines, so there is nothing to emit rows about. It also does not carry the
// client section — `serve` used to have a client --token it never read, purely
// because the flag was persistent on the root.
type ServeCommand struct {
	*cmds.CommandDescription
}

var _ cmds.BareCommand = &ServeCommand{}

// serveSettings is the flag surface of the server.
//
// Every OIDC field keeps its environment fallback in the field default via
// envOr, rather than through the section machinery's env source; see
// buildOperatorCommand in build.go for why this verb reads no DATADROP_* prefix.
type serveSettings struct {
	ListenAddr       string        `glazed:"addr"`
	DBPath           string        `glazed:"db"`
	BlobDir          string        `glazed:"blobs"`
	Token            string        `glazed:"token"`
	AuthMode         string        `glazed:"auth"`
	ExternalURL      string        `glazed:"external-url"`
	OIDCIssuer       string        `glazed:"oidc-issuer"`
	OIDCClientID     string        `glazed:"oidc-client-id"`
	OIDCClientIDFile string        `glazed:"oidc-client-id-file"`
	OIDCClientSecret string        `glazed:"oidc-client-secret"`
	OIDCSecretFile   string        `glazed:"oidc-client-secret-file"`
	RequireVerified  bool          `glazed:"oidc-require-verified-email"`
	SessionLifetime  string        `glazed:"session-lifetime"`
	SessionIdle      string        `glazed:"session-idle"`
	MaxBodyBytes     int           `glazed:"max-body-bytes"`
	MaxUploadBytes   int           `glazed:"max-upload-bytes"`
	DisableUI        bool          `glazed:"no-ui"`
	UIDir            string        `glazed:"ui-dir"`
	sessionLifetime  time.Duration `glazed:"-"`
	sessionIdle      time.Duration `glazed:"-"`
}

// NewServeCommand builds `datadrop serve`.
func NewServeCommand() (cmds.Command, error) {
	return &ServeCommand{cmds.NewCommandDescription(
		"serve",
		cmds.WithShort("Run the datadrop HTTP server"),
		cmds.WithLong(strings.TrimSpace(`
Run the datadrop HTTP server against a SQLite database file.

The database is created and migrated on startup if it does not exist, so this
command is safe to re-run against the same file.

    datadrop serve --addr :8080 --db ./datadrop.db --token secret

--addr here is the socket to bind, not a server to talk to. It deliberately
does not read $DATADROP_ADDR, which is the client's address for a running
server and would be the wrong thing to listen on.
`)),
		cmds.WithFlags(
			fields.New("addr", fields.TypeString,
				fields.WithDefault(":8080"),
				fields.WithHelp("listen address")),
			fields.New("db", fields.TypeString,
				fields.WithDefault("./datadrop.db"),
				fields.WithHelp("path to the SQLite database file")),
			fields.New("blobs", fields.TypeString,
				fields.WithDefault(""),
				fields.WithHelp("directory holding dataset file bytes (default: <db-dir>/blobs)")),
			fields.New("token", fields.TypeSecret,
				fields.WithDefault(os.Getenv("DATADROP_TOKEN")),
				fields.WithHelp("static root bearer token; in oidc mode this is an operator break-glass [$DATADROP_TOKEN]")),
			fields.New("auth", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_AUTH", "")),
				fields.WithHelp("authentication mode: none, token or oidc (default: token when --token is set, else none) [$DATADROP_AUTH]")),
			fields.New("external-url", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_EXTERNAL_URL", "")),
				fields.WithHelp("the origin a browser reaches this server on, e.g. http://datadrop.localhost:7070 [$DATADROP_EXTERNAL_URL]")),
			fields.New("oidc-issuer", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_OIDC_ISSUER", "")),
				fields.WithHelp("OIDC issuer URL [$DATADROP_OIDC_ISSUER]")),
			fields.New("oidc-client-id", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_OIDC_CLIENT_ID", "")),
				fields.WithHelp("OIDC client id [$DATADROP_OIDC_CLIENT_ID]")),
			fields.New("oidc-client-id-file", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_OIDC_CLIENT_ID_FILE", "")),
				fields.WithHelp("read the OIDC client id from this file")),
			fields.New("oidc-client-secret", fields.TypeSecret,
				fields.WithDefault(envOr("DATADROP_OIDC_CLIENT_SECRET", "")),
				fields.WithHelp("OIDC client secret [$DATADROP_OIDC_CLIENT_SECRET]")),
			// A file, not just an environment variable: a secret passed by env
			// is visible in `docker inspect`, is inherited by every child
			// process, and lands in a crash dump of the process environment.
			fields.New("oidc-client-secret-file", fields.TypeString,
				fields.WithDefault(envOr("DATADROP_OIDC_CLIENT_SECRET_FILE", "")),
				fields.WithHelp("read the OIDC client secret from this file (preferred over --oidc-client-secret)")),
			fields.New("oidc-require-verified-email", fields.TypeBool,
				fields.WithDefault(true),
				fields.WithHelp("refuse a sign-in whose email is unverified at the provider")),
			fields.New("session-lifetime", fields.TypeString,
				fields.WithDefault("12h"),
				fields.WithHelp("absolute session lifetime; never extended by activity")),
			fields.New("session-idle", fields.TypeString,
				fields.WithDefault("2h"),
				fields.WithHelp("sign out a session that has been unused for this long")),
			fields.New("max-body-bytes", fields.TypeInteger,
				fields.WithDefault(int(server.DefaultMaxBodyBytes)),
				fields.WithHelp("maximum accepted JSON request body size")),
			fields.New("max-upload-bytes", fields.TypeInteger,
				fields.WithDefault(int(server.DefaultMaxUploadBytes)),
				fields.WithHelp("maximum accepted dataset file upload size")),
			fields.New("no-ui", fields.TypeBool,
				fields.WithDefault(false),
				fields.WithHelp("do not mount the web UI at /ui")),
			fields.New("ui-dir", fields.TypeString,
				fields.WithDefault(""),
				fields.WithHelp("serve the web UI from this directory instead of the embedded copy")),
		),
	)}, nil
}

// Run starts the server and blocks until the context is cancelled.
func (c *ServeCommand) Run(ctx context.Context, vals *values.Values) error {
	s := &serveSettings{}
	if err := vals.DecodeSectionInto(schema.DefaultSlug, s); err != nil {
		return err
	}

	// The two durations are strings on the flag so that the field types stay
	// within what the section machinery renders in --print-schema; parsing them
	// here keeps the bad-value message next to the flag name.
	var err error
	if s.sessionLifetime, err = time.ParseDuration(s.SessionLifetime); err != nil {
		return errors.Wrapf(err, "invalid --session-lifetime %q", s.SessionLifetime)
	}
	if s.sessionIdle, err = time.ParseDuration(s.SessionIdle); err != nil {
		return errors.Wrapf(err, "invalid --session-idle %q", s.SessionIdle)
	}

	return runServe(ctx, s)
}

// readSecretFile loads a credential written to a file by the provisioning job.
func readSecretFile(path string) (string, error) {
	raw, err := os.ReadFile(path) //nolint:gosec // an operator-supplied path
	if err != nil {
		return "", errors.Wrapf(err, "read %s", path)
	}
	return strings.TrimSpace(string(raw)), nil
}

func runServe(ctx context.Context, opts *serveSettings) error {
	// Ctrl-C and SIGTERM cancel ctx, which unwinds Serve and then the store.
	ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, opts.DBPath)
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
	blobDir := opts.BlobDir
	if blobDir == "" {
		blobDir = filepath.Join(filepath.Dir(st.Path()), "blobs")
	}
	blobs, err := blob.Open(blobDir)
	if err != nil {
		return err
	}

	srv, err := server.New(server.Config{
		Addr:           opts.ListenAddr,
		Auth:           authCfg.Auth,
		Token:          authCfg.Token,
		ExternalURL:    authCfg.ExternalURL,
		OIDC:           authCfg.OIDC,
		MaxBodyBytes:   int64(opts.MaxBodyBytes),
		MaxUploadBytes: int64(opts.MaxUploadBytes),
		DisableUI:      opts.DisableUI,
		UIDir:          opts.UIDir,
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
			if !opts.DisableUI {
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
func resolveAuth(opts *serveSettings) (server.Config, error) {
	cfg := server.Config{
		Auth:        opts.AuthMode,
		Token:       opts.Token,
		ExternalURL: strings.TrimRight(opts.ExternalURL, "/"),
		OIDC: server.OIDCConfig{
			Issuer:               strings.TrimRight(opts.OIDCIssuer, "/"),
			ClientID:             opts.OIDCClientID,
			ClientSecret:         opts.OIDCClientSecret,
			Scopes:               []string{"openid", "profile", "email"},
			RequireVerifiedEmail: opts.RequireVerified,
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

	if opts.OIDCClientIDFile != "" {
		id, err := readSecretFile(opts.OIDCClientIDFile)
		if err != nil {
			return cfg, err
		}
		cfg.OIDC.ClientID = id
	}
	if opts.OIDCSecretFile != "" {
		secret, err := readSecretFile(opts.OIDCSecretFile)
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
