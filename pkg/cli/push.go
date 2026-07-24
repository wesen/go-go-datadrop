package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"

	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func newCreateCmd(opts *globalOptions) *cobra.Command {
	var (
		publicRead bool
		retention  string
	)

	cmd := &cobra.Command{
		Use:   "create NAME",
		Short: "Create a drop",
		Long: `Create a named drop.

A drop is the unit of naming, sharing and export. It always has a default
stream called "events".`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			created, err := api.CreateDrop(cmd.Context(), datadrop.CreateDropRequest{
				Name:       args[0],
				Retention:  retention,
				PublicRead: publicRead,
			})
			if err != nil {
				return err
			}

			if retention != "" {
				// Say so once, at the point of surprise, rather than only in
				// the README: an operator who sets a retention and sees no
				// deletions must not conclude the server is broken.
				fmt.Fprintf(cmd.ErrOrStderr(),
					"note: retention %q is recorded but not enforced in v0.1; nothing is deleted\n",
					retention)
			}
			return renderJSON(cmd.OutOrStdout(), created)
		},
	}

	cmd.Flags().BoolVar(&publicRead, "public-read", false, "allow unauthenticated reads of this drop")
	cmd.Flags().StringVar(&retention, "retention", "", `retention window, e.g. "90d" (stored but not enforced in v0.1)`)

	return cmd
}

func newListCmd(opts *globalOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List drops",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			format, err := parseOutput(opts.output)
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			drops, err := api.ListDrops(cmd.Context())
			if err != nil {
				return err
			}
			return renderDrops(cmd.OutOrStdout(), format, drops)
		},
	}
}

func newInspectCmd(opts *globalOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "inspect DROP",
		Short: "Show a drop's metadata and counters",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			stats, err := api.GetDrop(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			return renderJSON(cmd.OutOrStdout(), stats)
		},
	}
}

func newPushCmd(opts *globalOptions) *cobra.Command {
	var (
		stream       string
		fromStdin    bool
		ndjson       bool
		stringValues []string
		source       string
		eventType    string
		subject      string
	)

	cmd := &cobra.Command{
		Use:   "push DROP [key=value ...]",
		Short: "Append an event to a drop",
		Long: `Append an event to a drop.

Values in key=value pairs are parsed as JSON when possible, so temperature=21.7
becomes the number 21.7 rather than the string "21.7". Use --string to force
string interpretation.

Payloads can also be piped in:

    printf '{"temperature":22.8}' | datadrop push greenhouse --stdin
    cat readings.ndjson | datadrop push greenhouse --stdin --ndjson`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			drop := args[0]
			fields := args[1:]

			if fromStdin && len(fields) > 0 {
				return errors.New("--stdin cannot be combined with key=value arguments")
			}
			if ndjson && !fromStdin {
				return errors.New("--ndjson requires --stdin")
			}

			envelope := envelopeOverrides{source: source, eventType: eventType, subject: subject}

			if fromStdin {
				return pushFromStdin(cmd, api, drop, stream, ndjson, envelope)
			}
			if len(fields) == 0 {
				return errors.New("provide key=value arguments or --stdin")
			}

			payload, err := payloadFromFields(fields, stringValues)
			if err != nil {
				return err
			}
			return pushOne(cmd, api, drop, stream, payload, envelope)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&stream, "stream", datadrop.DefaultStream, "stream within the drop")
	flags.BoolVar(&fromStdin, "stdin", false, "read the payload from stdin instead of key=value arguments")
	flags.BoolVar(&ndjson, "ndjson", false, "with --stdin, treat input as newline-delimited JSON (one event per line)")
	flags.StringArrayVar(&stringValues, "string", nil, "key=value pair whose value is always treated as a string")
	flags.StringVar(&source, "source", "", "CloudEvents source, e.g. device:sensor-7")
	flags.StringVar(&eventType, "type", "", "CloudEvents type, e.g. io.datadrop.reading.v1")
	flags.StringVar(&subject, "subject", "", "CloudEvents subject, e.g. greenhouse/zone-a")

	return cmd
}

// envelopeOverrides are the CloudEvents attributes a pusher can set.
type envelopeOverrides struct {
	source    string
	eventType string
	subject   string
}

func (o envelopeOverrides) empty() bool {
	return o.source == "" && o.eventType == "" && o.subject == ""
}

// wrap builds a full envelope around a payload when any attribute was set.
// Otherwise the payload is sent bare, which keeps the simple path simple.
func (o envelopeOverrides) wrap(payload json.RawMessage) (json.RawMessage, bool, error) {
	if o.empty() {
		return payload, false, nil
	}

	envelope := map[string]any{
		"specversion": datadrop.SpecVersion,
		"data":        payload,
	}
	if o.source != "" {
		envelope["source"] = o.source
	}
	if o.eventType != "" {
		envelope["type"] = o.eventType
	}
	if o.subject != "" {
		envelope["subject"] = o.subject
	}

	encoded, err := json.Marshal(envelope)
	if err != nil {
		return nil, false, errors.Wrap(err, "encode envelope")
	}
	return encoded, true, nil
}

func pushOne(
	cmd *cobra.Command, api *client.Client,
	drop, stream string, payload json.RawMessage, overrides envelopeOverrides,
) error {
	body, isEnvelope, err := overrides.wrap(payload)
	if err != nil {
		return err
	}

	result, err := api.Push(cmd.Context(), drop, stream, body, isEnvelope)
	if err != nil {
		return err
	}
	reportPush(cmd, result)
	return nil
}

// pushFromStdin sends either one JSON document or a stream of NDJSON lines.
func pushFromStdin(
	cmd *cobra.Command, api *client.Client,
	drop, stream string, ndjson bool, overrides envelopeOverrides,
) error {
	if !ndjson {
		body, err := io.ReadAll(cmd.InOrStdin())
		if err != nil {
			return errors.Wrap(err, "read stdin")
		}
		if len(strings.TrimSpace(string(body))) == 0 {
			return errors.New("stdin is empty")
		}
		return pushOne(cmd, api, drop, stream, body, overrides)
	}

	scanner := bufio.NewScanner(cmd.InOrStdin())
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	pushed := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if err := pushOne(cmd, api, drop, stream, json.RawMessage(line), overrides); err != nil {
			return errors.Wrapf(err, "line %d", pushed+1)
		}
		pushed++
	}
	if err := scanner.Err(); err != nil {
		return errors.Wrap(err, "read stdin")
	}

	fmt.Fprintf(cmd.ErrOrStderr(), "pushed %d events\n", pushed)
	return nil
}

// reportPush writes the machine-readable result to stdout and any warnings to
// stderr, so the two never interleave in a pipe.
func reportPush(cmd *cobra.Command, result datadrop.AppendResult) {
	for _, warning := range result.Warnings {
		location := warning.Path
		if location == "" {
			location = "(root)"
		}
		fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s: %s\n", location, warning.Message)
	}
	if result.Duplicate {
		fmt.Fprintf(cmd.ErrOrStderr(),
			"note: event %s already existed; no new event was appended\n", result.ID)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "%s seq=%d\n", result.ID, result.Seq)
}

// payloadFromFields turns key=value arguments into a JSON object.
//
// Each value is parsed as JSON when it is valid JSON, and treated as a string
// otherwise — so temperature=21.7 is a number, note=hello is a string, and
// tags=["a","b"] is an array. --string forces the string reading when the
// heuristic guesses wrong.
func payloadFromFields(fields, stringFields []string) (json.RawMessage, error) {
	payload := map[string]any{}

	for _, field := range stringFields {
		key, value, err := splitField(field)
		if err != nil {
			return nil, err
		}
		payload[key] = value
	}

	for _, field := range fields {
		key, value, err := splitField(field)
		if err != nil {
			return nil, err
		}

		var parsed any
		if json.Valid([]byte(value)) && json.Unmarshal([]byte(value), &parsed) == nil {
			payload[key] = parsed
		} else {
			payload[key] = value
		}
	}

	encoded, err := json.Marshal(payload)
	return encoded, errors.Wrap(err, "encode payload")
}

func splitField(field string) (string, string, error) {
	key, value, found := strings.Cut(field, "=")
	if !found || key == "" {
		return "", "", errors.Errorf("invalid field %q: expected key=value", field)
	}
	return key, value, nil
}

// readSpec reads a schema document from a file or, for "-", from stdin.
func readSpec(cmd *cobra.Command, path string) (json.RawMessage, error) {
	if path == "-" {
		body, err := io.ReadAll(cmd.InOrStdin())
		return body, errors.Wrap(err, "read schema from stdin")
	}

	body, err := os.ReadFile(path)
	return body, errors.Wrapf(err, "read schema %s", path)
}
