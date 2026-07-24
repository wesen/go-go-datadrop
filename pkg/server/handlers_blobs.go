package server

import (
	"archive/tar"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/blob"
	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// CodeDigestMismatch is returned when the bytes received do not hash to the
// digest the client asserted.
const CodeDigestMismatch = "DigestMismatch"

// handleUploadDatasetFile adds one file to a draft version.
//
// Two request shapes are accepted, and they are distinguished by whether a body
// is present:
//
//   - With a body, the bytes are streamed through the blob store, which hashes
//     while writing. If ?digest= was supplied it is verified against what was
//     actually received.
//   - With ?digest= and no body, the file is "mounted": the server checks that
//     it already holds those bytes and records the metadata row without any
//     transfer. This is the fast path that makes republishing a dataset with one
//     changed file cheap, and it is why the upload protocol is staged at all.
func (s *Server) handleUploadDatasetFile(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}

	// Uploads target a draft, so "latest" — which resolves over committed
	// versions — is not meaningful here.
	version, ok := s.parseVersionNumber(w, r)
	if !ok {
		return
	}

	logicalPath := r.PathValue("path")
	if err := datadrop.ValidateDatasetPath(logicalPath); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	var asserted blob.Digest
	if raw := strings.TrimSpace(r.URL.Query().Get("digest")); raw != "" {
		parsed, err := blob.ParseDigest(raw)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
			return
		}
		asserted = parsed
	}

	// The draft must exist and still be open before any bytes are accepted.
	// Streaming a 400 MB body and only then discovering the version is
	// committed would be a poor use of everyone's time.
	if _, err := s.store.GetDatasetVersion(r.Context(), dropName, datasetName, version, true); err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	result, err := s.storeUploadedBytes(w, r, asserted)
	if err != nil {
		return // storeUploadedBytes has already written the problem document
	}

	file := datadrop.DatasetFile{
		Path:      logicalPath,
		Digest:    result.Digest.String(),
		SizeBytes: result.Size,
		MediaType: uploadMediaType(r, logicalPath),
	}
	if err := s.store.AddDatasetFile(auditContext(r), dropName, datasetName, version, file); err != nil {
		s.writeDatasetError(w, r, err)
		return
	}

	writeJSON(w, r, http.StatusCreated, datadrop.UploadFileResult{
		Path:         file.Path,
		Digest:       file.Digest,
		SizeBytes:    file.SizeBytes,
		Deduplicated: result.Deduplicated,
	})
}

// storeUploadedBytes resolves the body into a stored blob, handling both the
// streamed and the mounted form. It writes its own problem document on failure
// and returns a non-nil error so the caller stops.
func (s *Server) storeUploadedBytes(
	w http.ResponseWriter, r *http.Request, asserted blob.Digest,
) (blob.PutResult, error) {
	// The mount form: a digest with no body. Nothing is transferred; the server
	// only confirms it already holds the bytes and lets the caller record the
	// metadata row.
	if asserted != "" && r.ContentLength == 0 {
		exists, err := s.blobs.Exists(asserted)
		if err != nil {
			s.internalError(w, r, err)
			return blob.PutResult{}, err
		}
		if !exists {
			writeProblem(w, r, http.StatusNotFound, CodeNotFound,
				"no stored blob has digest "+asserted.String()+"; send the body to upload it")
			return blob.PutResult{}, errors.New("blob not present")
		}

		size, err := s.blobs.Stat(asserted)
		if err != nil {
			s.internalError(w, r, err)
			return blob.PutResult{}, err
		}
		return blob.PutResult{Digest: asserted, Size: size, Deduplicated: true}, nil
	}

	// The streamed form. MaxBytesReader is what makes the cap real: without it
	// a client could stream indefinitely and the store would write all of it.
	body := http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)

	result, err := s.blobs.Put(r.Context(), body, asserted)
	if err != nil {
		switch {
		case errors.Is(err, blob.ErrDigestMismatch):
			writeProblem(w, r, http.StatusBadRequest, CodeDigestMismatch, err.Error())
		case isMaxBytesError(err):
			writeProblem(w, r, http.StatusRequestEntityTooLarge, CodePayloadTooLarge,
				"upload exceeds the configured maximum of "+
					strconv.FormatInt(s.cfg.MaxUploadBytes, 10)+" bytes")
		default:
			s.internalError(w, r, err)
		}
		return blob.PutResult{}, err
	}
	return result, nil
}

// isMaxBytesError reports whether err came from http.MaxBytesReader. The error
// is wrapped by the blob store, so errors.As is required rather than a type
// assertion.
func isMaxBytesError(err error) bool {
	var maxBytes *http.MaxBytesError
	return errors.As(err, &maxBytes)
}

// defaultMediaTypes are the values HTTP clients send when they have no opinion.
// curl sends application/x-www-form-urlencoded for --data-binary without an
// explicit -H, which is not a claim about the content. Treating these as
// meaningful would bake a wrong type into an immutable version forever, so the
// filename extension is preferred over them.
var defaultMediaTypes = map[string]struct{}{
	"application/octet-stream":          {},
	"application/x-www-form-urlencoded": {},
}

// uploadMediaType determines the media type recorded for an uploaded file.
//
// A deliberate Content-Type wins, because it is the only thing that can
// describe a file with no extension. A client's default Content-Type loses to
// the extension, because it carries no information.
func uploadMediaType(r *http.Request, logicalPath string) string {
	declared := ""
	if raw := strings.TrimSpace(r.Header.Get("Content-Type")); raw != "" {
		if parsed, _, err := mime.ParseMediaType(raw); err == nil {
			declared = parsed
		}
	}

	if declared != "" {
		if _, isDefault := defaultMediaTypes[declared]; !isDefault {
			return declared
		}
	}

	if byExtension := mime.TypeByExtension(path.Ext(logicalPath)); byExtension != "" {
		if parsed, _, err := mime.ParseMediaType(byExtension); err == nil {
			return parsed
		}
	}
	return declared
}

// handlePutDatasetData is the single-shot convenience form: open a draft,
// upload one file, and commit, in one request.
//
// It exists so that `curl -T readings.csv` works. It is implemented in terms of
// the staged operations rather than as a parallel path, so there is exactly one
// commit implementation and one place the state transition can be wrong.
func (s *Server) handlePutDatasetData(w http.ResponseWriter, r *http.Request) {
	if !s.authenticate(w, r) {
		return
	}
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}

	logicalPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if logicalPath == "" {
		logicalPath = "data"
	}
	if err := datadrop.ValidateDatasetPath(logicalPath); err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	var asserted blob.Digest
	if raw := strings.TrimSpace(r.URL.Query().Get("digest")); raw != "" {
		parsed, err := blob.ParseDigest(raw)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
			return
		}
		asserted = parsed
	}

	ctx := auditContext(r)

	version, err := s.store.OpenDatasetVersion(ctx, dropName, datasetName)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	result, err := s.storeUploadedBytes(w, r, asserted)
	if err != nil {
		// The draft is left behind deliberately: deleting it here would race
		// with a client retrying, and an abandoned draft is invisible to every
		// reader anyway.
		return
	}

	if err := s.store.AddDatasetFile(ctx, dropName, datasetName, version.Version, datadrop.DatasetFile{
		Path:      logicalPath,
		Digest:    result.Digest.String(),
		SizeBytes: result.Size,
		MediaType: uploadMediaType(r, logicalPath),
	}); err != nil {
		s.writeDatasetError(w, r, err)
		return
	}

	committed, err := s.store.CommitDatasetVersion(ctx, dropName, datasetName, version.Version,
		datadrop.CommitVersionRequest{})
	if err != nil {
		s.writeDatasetError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusCreated, committed)
}

// handleDownloadDatasetFile serves one file's bytes.
//
// http.ServeContent supplies Range requests, If-None-Match against the ETag,
// If-Modified-Since, Accept-Ranges, and a correct Content-Length. Hand-rolling
// Range parsing is a well-known source of off-by-one errors and of incorrect
// handling of unsatisfiable ranges, and there is no reason to.
func (s *Server) handleDownloadDatasetFile(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, dropName) {
		return
	}
	version, ok := s.resolveVersion(w, r, dropName, datasetName)
	if !ok {
		return
	}

	logicalPath := r.PathValue("path")
	record, err := s.store.GetDatasetFile(r.Context(), dropName, datasetName, version, logicalPath)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	file, err := s.blobs.Open(blob.Digest(record.Digest))
	if err != nil {
		if errors.Is(err, blob.ErrNotFound) {
			// Metadata references bytes that are not on disk. That is a server
			// inconsistency, not a client error.
			s.internalError(w, r, errors.Wrapf(err,
				"metadata references missing blob %s", record.Digest))
			return
		}
		s.internalError(w, r, err)
		return
	}
	defer func() { _ = file.Close() }()

	if record.MediaType != "" {
		w.Header().Set("Content-Type", record.MediaType)
	}
	// The digest is a genuinely strong validator: two responses carrying the
	// same ETag are byte-identical by construction rather than by convention.
	w.Header().Set("ETag", strconv.Quote(record.Digest))
	w.Header().Set("Content-Disposition",
		`attachment; filename="`+path.Base(record.Path)+`"`)

	modTime := s.versionModTime(r, dropName, datasetName, version)
	http.ServeContent(w, r, record.Path, modTime, file)
}

// versionModTime is the version's commit time, used as the Last-Modified basis.
// A zero time makes ServeContent omit the header, which is the correct
// degradation if the lookup fails.
func (s *Server) versionModTime(r *http.Request, drop, dataset string, version int) time.Time {
	found, err := s.store.GetDatasetVersion(r.Context(), drop, dataset, version, false)
	if err != nil || found.CommittedAt == nil {
		return time.Time{}
	}
	return *found.CommittedAt
}

// handleHeadBlob answers "do you already have these bytes".
//
// This is the digest precheck. A client hashes a file locally, asks this
// question, and skips the transfer entirely on a 200 — which for a dataset
// republished with one changed file is the difference between re-uploading
// gigabytes and re-uploading nothing.
func (s *Server) handleHeadBlob(w http.ResponseWriter, r *http.Request) {
	// A blob is shared across drops, so there is no per-drop policy to consult;
	// existence is gated on the instance token.
	if !s.authenticate(w, r) {
		return
	}

	digest, err := blob.ParseDigest(r.PathValue("digest"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, CodeInvalidRequest, err.Error())
		return
	}

	size, err := s.blobs.Stat(digest)
	if err != nil {
		if errors.Is(err, blob.ErrNotFound) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		s.internalError(w, r, err)
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("ETag", strconv.Quote(digest.String()))
	w.WriteHeader(http.StatusOK)
}

// handleDatasetArchive streams a whole version as a tar archive.
//
// tar rather than zip: it can be written as a pure stream, where zip requires
// seeking back to patch a central directory, which is impossible on a response
// body and would force buffering the whole archive.
func (s *Server) handleDatasetArchive(w http.ResponseWriter, r *http.Request) {
	dropName, datasetName, ok := s.datasetPath(w, r)
	if !ok {
		return
	}
	if !s.authorizeRead(w, r, dropName) {
		return
	}
	version, ok := s.resolveVersion(w, r, dropName, datasetName)
	if !ok {
		return
	}

	found, err := s.store.GetDatasetVersion(r.Context(), dropName, datasetName, version, false)
	if err != nil {
		s.writeStoreError(w, r, err)
		return
	}

	filename := datasetName + "-v" + strconv.Itoa(version) + ".tar"
	w.Header().Set("Content-Type", "application/x-tar")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)

	if err := s.writeArchive(w, found); err != nil {
		// The status line is already on the wire, so a problem document is
		// impossible. Log it and drop the connection; the client sees a
		// truncated archive, which tar will report as such.
		log.Error().Err(err).
			Str("drop", dropName).Str("dataset", datasetName).Int("version", version).
			Str("request_id", RequestIDFromContext(r.Context())).
			Msg("dataset archive failed mid-stream")
	}
}

func (s *Server) writeArchive(w io.Writer, version datadrop.DatasetVersion) error {
	archive := tar.NewWriter(w)
	defer func() { _ = archive.Close() }()

	modTime := time.Time{}
	if version.CommittedAt != nil {
		modTime = *version.CommittedAt
	}

	// The manifest and schema travel with the bytes, so the archive is
	// self-describing and can be verified elsewhere.
	manifest := version.Manifest
	if len(manifest) == 0 {
		manifest = json.RawMessage("{}")
	}
	if err := writeArchiveEntry(archive, "manifest.json", manifest, modTime); err != nil {
		return err
	}
	if len(version.Schema) > 0 {
		if err := writeArchiveEntry(archive, "schema.json", version.Schema, modTime); err != nil {
			return err
		}
	}

	for _, file := range version.Files {
		if err := s.writeArchiveFile(archive, file, modTime); err != nil {
			return err
		}
	}
	return errors.Wrap(archive.Close(), "close archive")
}

func writeArchiveEntry(archive *tar.Writer, name string, body []byte, modTime time.Time) error {
	header := &tar.Header{
		Name: name, Mode: 0o644, Size: int64(len(body)),
		ModTime: modTime, Typeflag: tar.TypeReg,
	}
	if err := archive.WriteHeader(header); err != nil {
		return errors.Wrapf(err, "write archive header for %s", name)
	}
	_, err := archive.Write(body)
	return errors.Wrapf(err, "write archive entry %s", name)
}

func (s *Server) writeArchiveFile(
	archive *tar.Writer, file datadrop.DatasetFile, modTime time.Time,
) error {
	source, err := s.blobs.Open(blob.Digest(file.Digest))
	if err != nil {
		return errors.Wrapf(err, "open blob for %s", file.Path)
	}
	defer func() { _ = source.Close() }()

	header := &tar.Header{
		Name: path.Join("files", file.Path), Mode: 0o644, Size: file.SizeBytes,
		ModTime: modTime, Typeflag: tar.TypeReg,
	}
	if err := archive.WriteHeader(header); err != nil {
		return errors.Wrapf(err, "write archive header for %s", file.Path)
	}

	// Streamed, so the archive's memory cost is independent of file size.
	if _, err := io.Copy(archive, source); err != nil {
		return errors.Wrapf(err, "copy %s into archive", file.Path)
	}
	return nil
}
