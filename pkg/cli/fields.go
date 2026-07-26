package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"

	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// DropStreamFlag names the stream within a drop.
//
// It is "drop-stream" and not "stream", which it was before this ticket,
// because glazed's output section owns --stream: a bool that switches
// row-at-a-time emission. Two sections cannot both define it. Building a
// command with the old name fails, and fails loudly enough to take the whole
// binary with it:
//
//	$ datadrop query greenhouse
//	datadrop: building the query command: Flag 'stream' (usage: stream within
//	the drop - <string>) already exists
//
// That is the command tree failing to assemble, so *no* verb runs, not just the
// one that declared it. glazed's --stream cannot be renamed or removed either:
// a section's fields are fixed at construction and its settings struct reads
// them by tag.
//
// So the datadrop flag moved. --drop-stream says which noun the stream belongs
// to, which is also what made the old name ambiguous the moment row-streaming
// existed. Seven verbs carry it, so it lives here rather than in one of them.
const DropStreamFlag = "drop-stream"

// DropStreamField is the flag itself, for the verbs that address a single
// stream rather than a whole time range.
func DropStreamField() *fields.Definition {
	return fields.New(DropStreamFlag, fields.TypeString,
		fields.WithDefault(datadrop.DefaultStream),
		fields.WithHelp("stream within the drop (was --stream before v0.2)"))
}

// ReadSpec reads a JSON document from a file or, for "-", from stdin.
//
// Used for schema documents and dataset manifests, which are the two places a
// verb takes a whole document rather than a scalar.
func ReadSpec(path string) (json.RawMessage, error) {
	if path == "-" {
		body, err := io.ReadAll(os.Stdin)
		return body, errors.Wrap(err, "read from stdin")
	}

	body, err := os.ReadFile(path) //nolint:gosec // the path is the user's own argument
	return body, errors.Wrapf(err, "read %s", path)
}

// HumanBytes renders a byte count for a diagnostic line.
//
// Exact values belong in the row; this is for a human watching an upload.
func HumanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return strconv.FormatInt(n, 10) + " B"
	}

	div, exp := int64(unit), 0
	for size := n / unit; size >= unit && exp < 3; size /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGT"[exp])
}
