package dataset

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-go-golems/glazed/pkg/cmds"
	"github.com/go-go-golems/glazed/pkg/cmds/fields"
	"github.com/go-go-golems/glazed/pkg/cmds/schema"
	"github.com/go-go-golems/glazed/pkg/cmds/values"
	"github.com/pkg/errors"

	ddcli "github.com/go-go-golems/go-go-datadrop/pkg/cli"
	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// GetCommand downloads a dataset version.
//
// It is a BareCommand (DR-81): its result is files on disk, and a row saying
// "four files were written" would be a description of the answer rather than
// the answer. Emitting a row per downloaded file as *well* is a reasonable
// thing to want and is deliberately out of scope — progress goes to stderr
// today and rows would go to stdout, which is a behaviour change for anyone
// redirecting.
type GetCommand struct {
	*cmds.CommandDescription
}

var _ cmds.BareCommand = &GetCommand{}

// NewGetCommand builds `datadrop dataset get DROP DATASET`.
func NewGetCommand() (cmds.Command, error) {
	clientSection, err := ddcli.NewClientSection()
	if err != nil {
		return nil, err
	}

	return &GetCommand{cmds.NewCommandDescription(
		"get",
		cmds.WithShort("Download a dataset version"),
		cmds.WithLong(strings.TrimSpace(`
Download a dataset version.

Each downloaded file's digest is recomputed and compared against the version's
file list, so corruption in transit is caught at the point of use rather than
trusted away.

    datadrop dataset get greenhouse readings-2026 --output ./downloaded/
    datadrop dataset get greenhouse readings-2026 --file data/readings.csv -o -
    datadrop dataset get greenhouse readings-2026 --archive -o version.tar

This verb writes files, so it has no --output format flag: --output here is a
destination, the same one it has always been.
`)),
		cmds.WithArguments(
			fields.New("drop", fields.TypeString,
				fields.WithIsArgument(true),
				fields.WithHelp("the drop holding the dataset")),
			fields.New("dataset", fields.TypeString,
				fields.WithIsArgument(true),
				fields.WithHelp("the dataset name")),
		),
		cmds.WithFlags(
			fields.New("version", fields.TypeString,
				fields.WithDefault(""),
				fields.WithHelp(`version to download: a number or "latest" (default)`)),
			fields.New("output", fields.TypeString,
				fields.WithShortFlag("o"),
				fields.WithDefault(""),
				fields.WithHelp(`output directory, or a file path / "-" with --file or --archive`)),
			fields.New("file", fields.TypeString,
				fields.WithDefault(""),
				fields.WithHelp("download only this file from the version")),
			fields.New("archive", fields.TypeBool,
				fields.WithDefault(false),
				fields.WithHelp("download the whole version as a tar archive")),
			fields.New("no-verify", fields.TypeBool,
				fields.WithDefault(false),
				fields.WithHelp("skip the digest check on downloaded files")),
		),
		cmds.WithSections(clientSection),
	)}, nil
}

type getSettings struct {
	Drop     string `glazed:"drop"`
	Dataset  string `glazed:"dataset"`
	Version  string `glazed:"version"`
	Output   string `glazed:"output"`
	File     string `glazed:"file"`
	Archive  bool   `glazed:"archive"`
	NoVerify bool   `glazed:"no-verify"`
}

// Run downloads the version.
func (c *GetCommand) Run(ctx context.Context, vals *values.Values) error {
	s := &getSettings{}
	if err := vals.DecodeSectionInto(schema.DefaultSlug, s); err != nil {
		return err
	}
	if s.Version == "" {
		s.Version = datadrop.LatestVersion
	}

	api, err := ddcli.ClientFrom(vals)
	if err != nil {
		return err
	}

	if s.Archive {
		return streamToDestination(s.Output, func() (io.ReadCloser, error) {
			return api.DownloadDatasetArchive(ctx, s.Drop, s.Dataset, s.Version)
		})
	}

	if s.File != "" {
		return streamToDestination(s.Output, func() (io.ReadCloser, error) {
			return api.DownloadDatasetFile(ctx, s.Drop, s.Dataset, s.Version, s.File)
		})
	}

	if s.Output == "" || s.Output == "-" {
		return errors.New("--output DIRECTORY is required when downloading a whole version")
	}
	return downloadVersion(ctx, api, s)
}

// downloadVersion writes every file of a version beneath a directory, at its
// logical path, and verifies each digest.
func downloadVersion(ctx context.Context, api *client.Client, s *getSettings) error {
	found, err := api.GetDatasetVersion(ctx, s.Drop, s.Dataset, s.Version)
	if err != nil {
		return err
	}

	for _, file := range found.Files {
		// The logical path is server-validated, but this is the moment where a
		// hostile path would escape the output directory, so it is checked again
		// on the machine that is about to write it.
		if err := datadrop.ValidateDatasetPath(file.Path); err != nil {
			return errors.Wrapf(err, "refusing to write %q", file.Path)
		}
		target := filepath.Join(s.Output, filepath.FromSlash(file.Path))

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return errors.Wrapf(err, "create directory for %s", file.Path)
		}

		body, err := api.DownloadDatasetFile(ctx, s.Drop, s.Dataset, s.Version, file.Path)
		if err != nil {
			return errors.Wrapf(err, "download %s", file.Path)
		}
		if err := writeStream(target, body); err != nil {
			return err
		}

		if !s.NoVerify {
			if err := client.VerifyFile(target, file.Digest); err != nil {
				return err
			}
		}
		fmt.Fprintf(os.Stderr, "%s  %s\n", ddcli.HumanBytes(file.SizeBytes), file.Path)
	}

	fmt.Fprintf(os.Stdout, "%s/%s version %d: %d file(s) written to %s\n",
		s.Drop, s.Dataset, found.Version, len(found.Files), s.Output)
	return nil
}

func writeStream(target string, body io.ReadCloser) error {
	defer func() { _ = body.Close() }()

	file, err := os.Create(target)
	if err != nil {
		return errors.Wrapf(err, "create %s", target)
	}
	defer func() { _ = file.Close() }()

	if _, err := io.Copy(file, body); err != nil {
		return errors.Wrapf(err, "write %s", target)
	}
	return errors.Wrapf(file.Close(), "close %s", target)
}

// streamToDestination writes a single stream to stdout or a file.
func streamToDestination(output string, open func() (io.ReadCloser, error)) error {
	body, err := open()
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()

	var sink io.Writer = os.Stdout
	if output != "" && output != "-" {
		file, err := os.Create(output)
		if err != nil {
			return errors.Wrapf(err, "create %s", output)
		}
		defer func() { _ = file.Close() }()
		sink = file
	}

	_, err = io.Copy(sink, body)
	return errors.Wrap(err, "write download")
}
