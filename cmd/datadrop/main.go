// Command datadrop is a self-hostable, CLI-first research data inbox.
//
// It is both the server (`datadrop serve`) and a thin client of that server's
// HTTP API (`datadrop create`, `push`, `query`, `tail`, `export`, `schema`).
//
// See ttmp/2026/07/24/DATADROP-1--*/design/02-intern-implementation-guide.md
// for the full design and API reference.
package main

import (
	"os"

	"github.com/go-go-golems/go-go-datadrop/pkg/cli"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/drops"
	"github.com/go-go-golems/go-go-datadrop/pkg/cli/events"
)

// The group registrars are named here rather than inside pkg/cli, because the
// group packages import pkg/cli for the client section, the row projections and
// the exit helper. This is the one place in the tree that knows about all of
// them.
func main() {
	os.Exit(cli.Execute(
		drops.Register,
		events.Register,
	))
}
