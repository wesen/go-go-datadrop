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
)

func main() {
	os.Exit(cli.Execute())
}
