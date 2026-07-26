package doc_test

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/go-go-golems/glazed/pkg/help"

	"github.com/go-go-golems/go-go-datadrop/pkg/doc"
)

// TestSectionsLoad is the only guard that catches a malformed help page.
//
// Frontmatter is data, not code, so the compiler has nothing to say about a
// missing Slug or a SectionType the loader does not recognise. Without this the
// first sign of a broken page is `datadrop help <slug>` reporting that a page
// the author just wrote does not exist.
func TestSectionsLoad(t *testing.T) {
	hs := help.NewHelpSystem()
	if err := doc.AddDocToHelpSystem(hs); err != nil {
		t.Fatalf("embedded documentation failed to load: %v", err)
	}
}

// TestEverySlugResolves asserts that each page is reachable by the name a
// reader would type, and that no two pages claim the same one.
//
// A duplicate slug is the failure worth guarding: the loser is not reported,
// it is simply unreachable, and the author sees the other page's content under
// their own page's name.
func TestEverySlugResolves(t *testing.T) {
	hs := help.NewHelpSystem()
	if err := doc.AddDocToHelpSystem(hs); err != nil {
		t.Fatalf("load: %v", err)
	}

	slugs := slugsInFS(t)
	if len(slugs) == 0 {
		t.Fatal("no help pages found; the embed pattern is matching nothing")
	}

	seen := map[string]string{}
	for path, slug := range slugs {
		if other, dup := seen[slug]; dup {
			t.Errorf("slug %q is claimed by both %s and %s", slug, other, path)
			continue
		}
		seen[slug] = path

		if _, err := hs.GetSectionWithSlug(slug); err != nil {
			t.Errorf("%s declares slug %q, which does not resolve: %v", path, slug, err)
		}
	}
}

// TestPagesHaveNoTopLevelHeading enforces the one formatting rule the help
// system cannot enforce itself: the title comes from the frontmatter, so a
// leading "# " in the body renders a second title under the first.
func TestPagesHaveNoTopLevelHeading(t *testing.T) {
	for path, body := range bodiesInFS(t) {
		for _, line := range strings.Split(body, "\n") {
			if strings.HasPrefix(line, "# ") {
				t.Errorf("%s has a top-level heading %q; the help system renders the Title", path, line)
				break
			}
		}
	}
}

// slugsInFS reads the Slug field out of each page's frontmatter.
//
// Deliberately a dumb line scan rather than a YAML parse: this test exists to
// check the loader, so parsing the frontmatter a second way keeps it from
// agreeing with a loader bug.
func slugsInFS(t *testing.T) map[string]string {
	t.Helper()
	out := map[string]string{}
	for path, body := range rawInFS(t) {
		for _, line := range strings.Split(body, "\n") {
			if rest, ok := strings.CutPrefix(line, "Slug:"); ok {
				out[path] = strings.TrimSpace(rest)
				break
			}
		}
		if _, ok := out[path]; !ok {
			t.Errorf("%s has no Slug in its frontmatter", path)
		}
	}
	return out
}

func bodiesInFS(t *testing.T) map[string]string {
	t.Helper()
	out := map[string]string{}
	for path, raw := range rawInFS(t) {
		// Everything after the closing frontmatter delimiter.
		if _, body, ok := strings.Cut(strings.TrimPrefix(raw, "---\n"), "\n---\n"); ok {
			out[path] = body
		} else {
			t.Errorf("%s has no closing frontmatter delimiter", path)
		}
	}
	return out
}

func rawInFS(t *testing.T) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := fs.WalkDir(doc.FS(), ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".md") {
			return err
		}
		data, err := fs.ReadFile(doc.FS(), path)
		if err != nil {
			return err
		}
		out[path] = string(data)
		return nil
	})
	if err != nil {
		t.Fatalf("walking the embedded FS: %v", err)
	}
	return out
}
