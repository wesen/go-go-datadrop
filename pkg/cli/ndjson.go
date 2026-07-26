package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

// The --output ndjson deprecation (DR-78).
//
// Before this ticket, --output accepted table, json and ndjson, and ndjson
// meant "one compact JSON object per line". Glazed's --output accepts table,
// csv, tsv, json, yaml, sql, template, markdown and excel. There is no ndjson,
// and there is no exact equivalent.
//
// The closest is --output json --output-as-objects, which emits a stream of
// concatenated JSON values. jq reads it correctly and so does any streaming
// JSON parser. But it is not line-oriented, and that is the whole difference:
//
//	datadrop query greenhouse --output ndjson | while read -r line; do
//	  echo "$line" | jq -r .seq
//	done
//
// silently produces garbage under the replacement, because a "line" is now "{"
// or "  \"seq\": 1,". A script that pipes into jq is unaffected; a script that
// reads lines breaks quietly. Quietly is the part that is unacceptable.
//
// So ndjson is kept for one release, mapped onto the replacement, and announced
// on stderr — the one place the person running it will see it.
//
// The design guide names `--output template --template '{{ toJson . }}'` as the
// strictly line-oriented successor. It is not: glazed v1.3.8's template output
// formatter produces no output at all, for any template, including a string
// literal. Verified at the terminal. It also treats the template as a
// whole-table template over {{.rows}} rather than a per-row one, so even
// working it would not have emitted one object per line.
//
// The line-oriented answer that does work is `datadrop export --format ndjson`,
// which is the server's own NDJSON: one compact JSON object per line, of the
// original nested envelope, streamed. That is what a caller reading lines
// actually wanted, and it is what the message names.

// NDJSONOutput is the retired --output value.
const NDJSONOutput = "ndjson"

// ndjsonWarning is what a caller sees on stderr, once, when they use it.
var ndjsonWarning = strings.TrimSpace(`
datadrop: --output ndjson is deprecated and will be removed in the next release.
  Piping into jq?           use --output json --output-as-objects
  Reading one line at a time? use 'datadrop export --format ndjson', which is the
                            server's own NDJSON: one compact object per line.
  Continuing as --output json --output-as-objects, which is a stream of
  concatenated JSON values and is NOT line-oriented.
`)

// installNDJSONShim maps --output ndjson onto its replacement before Glazed
// parses the flag.
//
// It has to run in PreRunE rather than inside the command, because Glazed's
// output field is a choice and "ndjson" is not one of its choices: by the time
// a command body runs, the parse has already failed with "Argument output has
// invalid choice ndjson", which tells a reader that the value is wrong but not
// what to do instead. pflag has accepted the raw string by then — choice
// validation happens later, in Glazed's own parse — so PreRunE is the window in
// which the value can still be rewritten.
func installNDJSONShim(cmd *cobra.Command) {
	previous := cmd.PreRunE

	cmd.PreRunE = func(c *cobra.Command, args []string) error {
		if previous != nil {
			if err := previous(c, args); err != nil {
				return err
			}
		}
		return rewriteNDJSONOutput(c)
	}
}

func rewriteNDJSONOutput(cmd *cobra.Command) error {
	flags := cmd.Flags()

	output := flags.Lookup("output")
	if output == nil || !flags.Changed("output") {
		return nil
	}
	if !strings.EqualFold(strings.TrimSpace(output.Value.String()), NDJSONOutput) {
		return nil
	}

	// stderr, so that `datadrop query … --output ndjson | jq` keeps working
	// while the person running it is still told.
	fmt.Fprintln(os.Stderr, ndjsonWarning)

	if err := flags.Set("output", "json"); err != nil {
		return errors.Wrap(err, "mapping --output ndjson onto --output json")
	}
	if err := flags.Set("output-as-objects", "true"); err != nil {
		return errors.Wrap(err, "mapping --output ndjson onto --output-as-objects")
	}
	return nil
}
