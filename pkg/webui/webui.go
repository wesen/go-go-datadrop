// Package webui serves the single-page visualization workbench out of the
// datadrop binary.
//
// Mount points, and why they are these:
//
//	GET /                  302 to /ui/
//	GET /ui/{path...}      the SPA shell, with a fallback to index.html
//	GET /static/{path...}  the hashed asset bundles
//
// The SPA is not mounted at "/" with a catch-all fallback, which is the usual
// arrangement. A fallback at the root returns index.html for anything
// unmatched, including a mistyped "/v1/drop" — turning an API 404 into an HTML
// page and a genuinely confusing afternoon for whoever wrote the client.
// Mounting at /ui keeps the API's 404s 404s. Assets live under /static per
// AGENT.md, and Vite is configured with base "/static/" so the URLs it emits
// already point there.
package webui

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
	"time"
)

// assets holds the built frontend.
//
// The directory is committed rather than produced at build time: embedding
// needs the files present at compile time, and a `go install` of this module
// must not require a JavaScript toolchain. `make ui` regenerates it; until it
// is first run, index.html is a placeholder that says so.
//
// "all:" matters. Without it embed skips names beginning with "_" or ".", and
// Vite emits such names often enough that a chunk goes missing and the failure
// only appears as a 404 in a browser console.
//
//go:embed all:dist
var assets embed.FS

// MountPath is the URL prefix the SPA is served from.
const MountPath = "/ui/"

// AssetPath is the URL prefix the bundles are served from.
const AssetPath = "/static/"

// Register mounts the UI routes on mux.
//
// dir, when non-empty, serves the assets from that directory instead of from
// the embedded copy. It exists so that a developer can point a running server
// at a fresh `bun run build` without recompiling; production leaves it empty.
func Register(mux *http.ServeMux, dir string) {
	fsys := Assets(dir)

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, MountPath, http.StatusFound)
	})
	mux.Handle("GET "+MountPath+"{path...}", shell(fsys))
	mux.Handle("GET "+AssetPath+"{path...}", static(fsys))
}

// Assets returns the filesystem the UI is served from.
func Assets(dir string) fs.FS {
	if dir != "" {
		return os.DirFS(dir)
	}
	sub, err := fs.Sub(assets, "dist")
	if err != nil {
		// Unreachable: "dist" is embedded above, so the subtree exists.
		return assets
	}
	return sub
}

// shell serves the SPA. An unknown path returns index.html so that client-side
// routing works on a hard refresh.
func shell(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := cleanRelative(strings.TrimPrefix(r.URL.Path, MountPath))
		if name == "" {
			name = "index.html"
		}

		if serveFile(w, r, fsys, name) {
			return
		}
		if serveFile(w, r, fsys, "index.html") {
			return
		}
		http.Error(w, "the datadrop web UI is not present in this binary; run `make ui`",
			http.StatusServiceUnavailable)
	})
}

// static serves the hashed bundles. There is no index.html fallback here: a
// missing asset must be a 404 so that a stale cached shell requesting a chunk
// from a previous build fails loudly instead of receiving HTML and reporting an
// unrelated syntax error.
func static(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := cleanRelative(strings.TrimPrefix(r.URL.Path, AssetPath))
		if name == "" || !serveFile(w, r, fsys, name) {
			http.NotFound(w, r)
		}
	})
}

// cleanRelative normalizes a path from a URL into something safe to open in an
// fs.FS.
//
// http.ServeMux already cleans request paths before routing, so this is belt
// and braces rather than the primary control — but it is cheap, and the fs.FS
// contract requires unrooted, slash-separated, lexically clean names.
func cleanRelative(p string) string {
	p = strings.TrimPrefix(path.Clean("/"+p), "/")
	if p == "." || strings.HasPrefix(p, "../") {
		return ""
	}
	return p
}

// serveFile writes one asset, or reports that it is not there.
//
// http.ServeContent handles Range, ETag and 304 — the same function the dataset
// download path uses, for the same reasons. It needs an io.ReadSeeker; every
// file in an embed.FS and in an os.DirFS provides one.
func serveFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	file, err := fsys.Open(name)
	if err != nil {
		return false
	}
	defer func() { _ = file.Close() }()

	info, err := file.Stat()
	if err != nil || info.IsDir() {
		return false
	}

	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		return false
	}

	// An embedded file has a zero modification time, which ServeContent reads
	// as "unknown" and simply omits from the response. A hashed bundle name is
	// the cache key that matters anyway.
	modTime := info.ModTime()
	if modTime.IsZero() {
		modTime = time.Time{}
	}

	http.ServeContent(w, r, path.Base(name), modTime, seeker)
	return true
}
