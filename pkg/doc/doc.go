// Package doc embeds datadrop's long-form documentation into the binary.
//
// The pages here are extracted from the ticket design guides under ttmp/ —
// specifically DATADROP-4 (the presentation protocol, the object model, the
// window manager, the component layers) and DATADROP-7 (the store as an
// instance boundary, and embedding). Those guides are ticket-scoped: they argue
// for a change against the code as it stood, and they go stale the moment the
// change lands. What is extracted here is the part that does not go stale — how
// the system works and why it is shaped that way — rewritten as reference
// rather than as a proposal.
//
// The pages carry Glazed help frontmatter, so they are queryable by slug
// (`datadrop help web-ui-object-model`), filterable by topic, and rendered with
// the same machinery as every other go-go-golems tool.
//
// They describe the browser workbench that `datadrop serve` hosts. That is not a
// category error: pkg/webui embeds the built SPA into this binary, so the
// browser interface ships here, and its architecture is as much a property of
// this program as the HTTP surface is.
package doc

import (
	"embed"
	"io/fs"

	"github.com/go-go-golems/glazed/pkg/help"
)

//go:embed topics tutorials
var docFS embed.FS

// FS returns the embedded documentation tree. Consumers that want to walk the
// markdown directly — a documentation server, a static site renderer — can use
// this instead of going through a HelpSystem.
func FS() fs.FS {
	return docFS
}

// AddDocToHelpSystem loads every embedded section into the given help system.
//
// Called once, from the CLI root. A duplicate slug is a load-time error rather
// than a silently shadowed page, which is why slugs are checked in
// pkg/doc/doc_test.go as well.
func AddDocToHelpSystem(helpSystem *help.HelpSystem) error {
	return helpSystem.LoadSectionsFromFS(docFS, ".")
}
