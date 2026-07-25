package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

// meResponse mirrors server.MeResponse. Duplicated rather than imported so the
// CLI does not depend on the server package for one struct.
type meResponse struct {
	AuthMode      string   `json:"auth_mode"`
	Authenticated bool     `json:"authenticated"`
	Kind          string   `json:"kind"`
	Scopes        []string `json:"scopes"`
	TokenID       string   `json:"token_id"`
	User          *struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		Name      string `json:"name"`
		CreatedAt string `json:"created_at"`
	} `json:"user"`
	Provider *struct {
		Issuer string `json:"issuer"`
	} `json:"provider"`
}

// newWhoamiCmd reports what the configured credential resolves to.
//
// Twenty lines, and it is the first thing anyone runs when a credential does
// not work. Without it the only diagnosis available is a 403 from an endpoint
// that cannot say which of "wrong token", "wrong user", "missing scope" or
// "not a member" it meant.
func newWhoamiCmd(opts *globalOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "whoami",
		Short: "Show who the current credential authenticates as",
		Long: `Report the identity, kind and scopes of the configured credential.

Answers the four questions a 403 cannot distinguish between: is the token
valid, whose is it, what may it do, and is this server even running with user
accounts.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runWhoami(cmd.Context(), opts)
		},
	}
	return cmd
}

func runWhoami(ctx context.Context, opts *globalOptions) error {
	base := strings.TrimRight(opts.addr, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/v1/me", nil)
	if err != nil {
		return errors.Wrap(err, "build request")
	}
	if opts.token != "" {
		req.Header.Set("Authorization", "Bearer "+opts.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return errors.Wrapf(err, "reach %s", base)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return errors.Errorf("%s answered %s", base, resp.Status)
	}

	var me meResponse
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return errors.Wrap(err, "decode response")
	}

	fmt.Printf("server     %s\n", base)
	fmt.Printf("auth mode  %s\n", me.AuthMode)

	if !me.Authenticated {
		// Say what to do about it, rather than only what is wrong.
		fmt.Println("identity   anonymous")
		switch me.AuthMode {
		case "oidc":
			fmt.Println("\nNo credential was accepted. Set DATADROP_TOKEN to an API token")
			fmt.Println("minted from the tokens tile, or use --token.")
		case "token":
			fmt.Println("\nNo credential was accepted. Set DATADROP_TOKEN to the server's token.")
		}
		return nil
	}

	fmt.Printf("kind       %s\n", me.Kind)
	if me.User != nil {
		fmt.Printf("user       %s", me.User.ID)
		if me.User.Name != "" {
			fmt.Printf("  (%s)", me.User.Name)
		}
		fmt.Println()
		if me.User.Email != "" {
			fmt.Printf("email      %s\n", me.User.Email)
		}
	}
	if me.TokenID != "" {
		// The public half of the credential, which is what an audit row
		// carries — so "which token did this" is answerable from here.
		fmt.Printf("token      %s\n", me.TokenID)
	}
	if len(me.Scopes) > 0 {
		fmt.Printf("scopes     %s\n", strings.Join(me.Scopes, " "))
	}
	if me.Provider != nil && me.Provider.Issuer != "" {
		fmt.Printf("issuer     %s\n", me.Provider.Issuer)
	}

	if me.Kind == "root" {
		fmt.Println("\nThis is the root credential: it bypasses every ownership and")
		fmt.Println("membership check, and its actions are audited as \"root\".")
	}
	return nil
}
