package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/pkg/errors"
	"github.com/spf13/cobra"

	"github.com/go-go-golems/go-go-datadrop/pkg/client"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

func newDatasetCmd(opts *globalOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "dataset",
		Short: "Publish and retrieve bulk datasets",
		Long: `Publish and retrieve bulk datasets.

A dataset is a named, versioned collection of files inside a drop. Unlike a
stream, which is unbounded and appended to one event at a time, a dataset
version is finite and immutable: correcting it means publishing a new version.`,
	}

	cmd.AddCommand(
		newDatasetPushCmd(opts),
		newDatasetListCmd(opts),
		newDatasetShowCmd(opts),
		newDatasetGetCmd(opts),
		newDatasetImportCmd(opts),
		newDatasetRmCmd(opts),
	)
	return cmd
}

func newDatasetPushCmd(opts *globalOptions) *cobra.Command {
	var (
		files        []string
		manifestPath string
		schemaPath   string
		title        string
		license      string
		description  string
		stripPrefix  bool
	)

	cmd := &cobra.Command{
		Use:   "push DROP DATASET",
		Short: "Publish a new dataset version",
		Long: `Publish a new dataset version.

Each file is hashed locally first, and the server is asked whether it already
holds those bytes. Files it already has are recorded without being transferred,
so republishing a dataset with one changed file uploads only that file.

    datadrop dataset push greenhouse readings-2026 \
        --file data/readings.csv --file README.md \
        --title "Greenhouse readings, 2026 season" --license CC-BY-4.0`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(files) == 0 {
				return errors.New("at least one --file is required")
			}

			commitReq, err := buildCommitRequest(cmd, manifestPath, schemaPath, title, license, description)
			if err != nil {
				return err
			}

			pushFiles, err := resolvePushFiles(files, stripPrefix)
			if err != nil {
				return err
			}

			api, err := newClient(opts)
			if err != nil {
				return err
			}

			result, err := api.PushDataset(cmd.Context(), args[0], args[1], pushFiles, commitReq)
			if err != nil {
				return err
			}

			// The transfer summary is a diagnostic; the version document is the
			// result. Keeping them on separate streams means the output stays
			// pipeable.
			fmt.Fprintf(cmd.ErrOrStderr(),
				"uploaded %d file(s) (%s), reused %d already-stored file(s) (%s)\n",
				result.Uploaded, humanBytes(result.BytesSent),
				result.Mounted, humanBytes(result.BytesSkipped))

			return renderJSON(cmd.OutOrStdout(), result.Version)
		},
	}

	flags := cmd.Flags()
	flags.StringArrayVar(&files, "file", nil,
		"local file to publish; repeatable. Use LOCAL:LOGICAL to rename within the dataset")
	flags.StringVar(&manifestPath, "manifest", "", `manifest JSON document, or "-" for stdin`)
	flags.StringVar(&schemaPath, "schema", "", "JSON Schema describing one record of the dataset")
	flags.StringVar(&title, "title", "", "dataset title (merged into the manifest)")
	flags.StringVar(&license, "license", "", "license identifier, e.g. CC-BY-4.0 (merged into the manifest)")
	flags.StringVar(&description, "description", "", "dataset description (merged into the manifest)")
	flags.BoolVar(&stripPrefix, "flatten", false,
		"store files under their base name instead of their local path")

	return cmd
}

// resolvePushFiles turns --file arguments into local/logical pairs.
//
// A LOCAL:LOGICAL form allows renaming; otherwise the local path is used as the
// logical path, cleaned of any leading "./" and rejected if it escapes upwards.
func resolvePushFiles(files []string, flatten bool) ([]client.PushFile, error) {
	resolved := make([]client.PushFile, 0, len(files))
	seen := map[string]string{}

	for _, entry := range files {
		local, logical := entry, ""
		if before, after, found := strings.Cut(entry, ":"); found && after != "" {
			local, logical = before, after
		}

		if logical == "" {
			logical = local
			if flatten {
				logical = filepath.Base(local)
			}
		}
		logical = filepath.ToSlash(filepath.Clean(logical))
		logical = strings.TrimPrefix(logical, "./")

		if err := datadrop.ValidateDatasetPath(logical); err != nil {
			return nil, errors.Wrapf(err, "--file %q", entry)
		}
		if info, err := os.Stat(local); err != nil {
			return nil, errors.Wrapf(err, "--file %q", entry)
		} else if info.IsDir() {
			return nil, errors.Errorf("--file %q is a directory; pass individual files", entry)
		}
		if previous, duplicate := seen[logical]; duplicate {
			return nil, errors.Errorf("two files map to the same dataset path %q: %q and %q",
				logical, previous, local)
		}
		seen[logical] = local

		resolved = append(resolved, client.PushFile{LocalPath: local, LogicalPath: logical})
	}
	return resolved, nil
}

// buildCommitRequest merges the manifest document with the convenience flags.
//
// The flags win over the document, so a scripted manifest can be overridden on
// the command line without editing the file.
func buildCommitRequest(
	cmd *cobra.Command, manifestPath, schemaPath, title, license, description string,
) (datadrop.CommitVersionRequest, error) {
	manifest := map[string]any{}

	if manifestPath != "" {
		raw, err := readSpec(cmd, manifestPath)
		if err != nil {
			return datadrop.CommitVersionRequest{}, err
		}
		if err := json.Unmarshal(raw, &manifest); err != nil {
			return datadrop.CommitVersionRequest{}, errors.Wrapf(err, "manifest %s", manifestPath)
		}
	}

	for key, value := range map[string]string{
		"title": title, "license": license, "description": description,
	} {
		if value != "" {
			manifest[key] = value
		}
	}

	req := datadrop.CommitVersionRequest{}
	if len(manifest) > 0 {
		encoded, err := json.Marshal(manifest)
		if err != nil {
			return datadrop.CommitVersionRequest{}, errors.Wrap(err, "encode manifest")
		}
		req.Manifest = encoded
	}

	if schemaPath != "" {
		schema, err := readSpec(cmd, schemaPath)
		if err != nil {
			return datadrop.CommitVersionRequest{}, err
		}
		req.Schema = schema
	}
	return req, nil
}

func newDatasetListCmd(opts *globalOptions) *cobra.Command {
	return &cobra.Command{
		Use:   "list DROP",
		Short: "List a drop's datasets",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			format, err := parseOutput(opts.output)
			if err != nil {
				return err
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			datasets, err := api.ListDatasets(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			return renderDatasets(cmd.OutOrStdout(), format, datasets)
		},
	}
}

func newDatasetShowCmd(opts *globalOptions) *cobra.Command {
	var version string

	cmd := &cobra.Command{
		Use:   "show DROP DATASET",
		Short: "Show a dataset or one of its versions",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			if version == "" {
				dataset, err := api.GetDataset(cmd.Context(), args[0], args[1])
				if err != nil {
					return err
				}
				return renderJSON(cmd.OutOrStdout(), dataset)
			}

			found, err := api.GetDatasetVersion(cmd.Context(), args[0], args[1], version)
			if err != nil {
				return err
			}
			return renderJSON(cmd.OutOrStdout(), found)
		},
	}

	cmd.Flags().StringVar(&version, "version", "",
		`version to show: a number or "latest" (default: the dataset with all its versions)`)
	return cmd
}

func newDatasetGetCmd(opts *globalOptions) *cobra.Command {
	var (
		version  string
		output   string
		singleF  string
		archive  bool
		noVerify bool
	)

	cmd := &cobra.Command{
		Use:   "get DROP DATASET",
		Short: "Download a dataset version",
		Long: `Download a dataset version.

Each downloaded file's digest is recomputed and compared against the version's
file list, so corruption in transit is caught at the point of use rather than
trusted away.

    datadrop dataset get greenhouse readings-2026 --output ./downloaded/
    datadrop dataset get greenhouse readings-2026 --file data/readings.csv -o -`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if version == "" {
				version = datadrop.LatestVersion
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			drop, dataset := args[0], args[1]

			if archive {
				return streamToDestination(cmd, output, func() (io.ReadCloser, error) {
					return api.DownloadDatasetArchive(cmd.Context(), drop, dataset, version)
				})
			}

			if singleF != "" {
				return streamToDestination(cmd, output, func() (io.ReadCloser, error) {
					return api.DownloadDatasetFile(cmd.Context(), drop, dataset, version, singleF)
				})
			}

			if output == "" || output == "-" {
				return errors.New("--output DIRECTORY is required when downloading a whole version")
			}
			return downloadVersion(cmd, api, drop, dataset, version, output, !noVerify)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&version, "version", "", `version to download: a number or "latest" (default)`)
	flags.StringVarP(&output, "output", "o", "", `output directory, or a file path / "-" with --file or --archive`)
	flags.StringVar(&singleF, "file", "", "download only this file from the version")
	flags.BoolVar(&archive, "archive", false, "download the whole version as a tar archive")
	flags.BoolVar(&noVerify, "no-verify", false, "skip the digest check on downloaded files")

	return cmd
}

// downloadVersion writes every file of a version beneath dir, at its logical
// path, and verifies each digest.
func downloadVersion(
	cmd *cobra.Command, api *client.Client,
	drop, dataset, version, dir string, verify bool,
) error {
	found, err := api.GetDatasetVersion(cmd.Context(), drop, dataset, version)
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
		target := filepath.Join(dir, filepath.FromSlash(file.Path))

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return errors.Wrapf(err, "create directory for %s", file.Path)
		}

		body, err := api.DownloadDatasetFile(cmd.Context(), drop, dataset, version, file.Path)
		if err != nil {
			return errors.Wrapf(err, "download %s", file.Path)
		}
		if err := writeStream(target, body); err != nil {
			return err
		}

		if verify {
			if err := client.VerifyFile(target, file.Digest); err != nil {
				return err
			}
		}
		fmt.Fprintf(cmd.ErrOrStderr(), "%s  %s\n", humanBytes(file.SizeBytes), file.Path)
	}

	fmt.Fprintf(cmd.OutOrStdout(), "%s/%s version %d: %d file(s) written to %s\n",
		drop, dataset, found.Version, len(found.Files), dir)
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
func streamToDestination(
	cmd *cobra.Command, output string, open func() (io.ReadCloser, error),
) error {
	body, err := open()
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()

	sink := cmd.OutOrStdout()
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

func newDatasetRmCmd(opts *globalOptions) *cobra.Command {
	var version string

	cmd := &cobra.Command{
		Use:   "rm DROP DATASET",
		Short: "Delete a dataset version",
		Long: `Delete a dataset version.

The version's file records are removed. The bytes themselves are left in place,
because other versions may share them; unreferenced bytes are reclaimed by a
garbage-collection sweep.`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if version == "" {
				return errors.New("--version is required; deleting a whole dataset is not supported")
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			if err := api.DeleteDatasetVersion(cmd.Context(), args[0], args[1], version); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s/%s version %s deleted\n", args[0], args[1], version)
			return nil
		},
	}

	cmd.Flags().StringVar(&version, "version", "", `version to delete: a number or "latest" (required)`)
	return cmd
}

// renderDatasets prints a dataset listing.
func renderDatasets(w io.Writer, format string, datasets []datadrop.Dataset) error {
	if format == OutputJSON || format == OutputNDJSON {
		return renderJSON(w, datasets)
	}

	if len(datasets) == 0 {
		_, err := fmt.Fprintln(w, "no datasets")
		return errors.Wrap(err, "write table")
	}

	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	if _, err := fmt.Fprintln(tw, "NAME\tVERSIONS\tLATEST\tFILES\tSIZE"); err != nil {
		return errors.Wrap(err, "write table header")
	}

	for _, d := range datasets {
		latest, files, size := "-", "-", "-"
		if len(d.Versions) > 0 {
			newest := d.Versions[0] // ListDatasetVersions returns newest first
			latest = strconv.Itoa(newest.Version)
			files = strconv.Itoa(newest.FileCount)
			size = humanBytes(newest.TotalBytes)
		}
		if _, err := fmt.Fprintf(tw, "%s\t%d\t%s\t%s\t%s\n",
			d.Name, len(d.Versions), latest, files, size); err != nil {
			return errors.Wrap(err, "write table row")
		}
	}
	return errors.Wrap(tw.Flush(), "flush table")
}

// humanBytes renders a byte count for a diagnostic line. Exact values belong in
// the JSON output; this is for a human watching an upload.
func humanBytes(n int64) string {
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

func newDatasetImportCmd(opts *globalOptions) *cobra.Command {
	var (
		version     string
		logicalPath string
		streamName  string
		format      string
		maxRows     int
		strict      bool
	)

	cmd := &cobra.Command{
		Use:   "import DROP DATASET",
		Short: "Materialize a dataset file's rows into an event stream",
		Long: `Materialize a dataset file's rows into an event stream.

Each row becomes one event carrying provenance back to the dataset version, the
file, the row number, and the digest of the exact bytes it came from.

Event identifiers are derived from (digest, row), so re-running an interrupted
import resumes rather than duplicating: rows already imported are reported as
skipped.

    datadrop dataset import greenhouse readings-2026 --path data/readings.csv`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if logicalPath == "" {
				return errors.New("--path is required: name the file within the dataset")
			}
			if version == "" {
				version = datadrop.LatestVersion
			}
			api, err := newClient(opts)
			if err != nil {
				return err
			}

			result, err := api.ImportDataset(cmd.Context(), args[0], args[1], version,
				logicalPath, streamName, format, maxRows, strict)
			if err != nil {
				return err
			}

			for _, warning := range result.Warnings {
				location := warning.Path
				if location == "" {
					location = "(root)"
				}
				fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s: %s\n", location, warning.Message)
			}
			if result.Truncated {
				fmt.Fprintf(cmd.ErrOrStderr(),
					"note: stopped at the %d-row limit; pass --max-rows to raise it\n", maxRows)
			}

			return renderJSON(cmd.OutOrStdout(), result)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&version, "version", "", `version to import from: a number or "latest" (default)`)
	flags.StringVar(&logicalPath, "path", "", "file within the dataset to import (required)")
	flags.StringVar(&streamName, "stream", datadrop.DefaultStream, "destination stream")
	flags.StringVar(&format, "format", "", "row format: csv or ndjson (default: inferred from the file name)")
	flags.IntVar(&maxRows, "max-rows", 0, "maximum rows to import (default: the server's limit)")
	flags.BoolVar(&strict, "strict", false, "reject the import if any row fails the dataset schema")

	return cmd
}
