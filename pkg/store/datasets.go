package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
)

// ErrImmutable means an operation tried to modify a committed dataset version.
// A correction is a new version, never a mutation of an existing one.
var ErrImmutable = errors.New("committed version is immutable")

// OpenDatasetVersion creates the dataset if needed and opens a new draft
// version numbered MAX(version)+1.
//
// Allocation and insertion share one transaction, for the same reason event
// sequence reservation does: two concurrent opens must not receive the same
// version number, and a failed insert must not consume one.
func (s *Store) OpenDatasetVersion(ctx context.Context, drop, dataset string) (datadrop.DatasetVersion, error) {
	if err := datadrop.ValidateName("drop", drop); err != nil {
		return datadrop.DatasetVersion{}, err
	}
	if err := datadrop.ValidateName("dataset", dataset); err != nil {
		return datadrop.DatasetVersion{}, err
	}

	now := s.Now()

	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return datadrop.DatasetVersion{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	var dropExists int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM drops WHERE name = ?`, drop).Scan(&dropExists); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: check drop %q", drop)
	}
	if dropExists == 0 {
		return datadrop.DatasetVersion{}, errors.Wrapf(ErrNotFound, "drop %q", drop)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO datasets(drop_name, name, next_version, created_at) VALUES(?, ?, 0, ?)
		 ON CONFLICT(drop_name, name) DO NOTHING`,
		drop, dataset, FormatTime(now)); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: ensure dataset %s/%s", drop, dataset)
	}

	// Allocate from the counter rather than from MAX(version) over live rows.
	// Deleting a version must not free its number for reuse: a reference to
	// "version 3" would otherwise start resolving to different content, which
	// defeats the point of immutable versions.
	var allocated int
	if err := tx.QueryRowContext(ctx,
		`SELECT next_version FROM datasets WHERE drop_name = ? AND name = ?`,
		drop, dataset).Scan(&allocated); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: read version counter of %s/%s", drop, dataset)
	}
	version := allocated + 1

	if _, err := tx.ExecContext(ctx,
		`UPDATE datasets SET next_version = ? WHERE drop_name = ? AND name = ?`,
		version, drop, dataset); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: advance version counter of %s/%s", drop, dataset)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO dataset_versions(drop_name, dataset_name, version, state, manifest, created_at)
		VALUES(?, ?, ?, ?, '{}', ?)`,
		drop, dataset, version, string(datadrop.StateDraft), FormatTime(now)); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: open version of %s/%s", drop, dataset)
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionDatasetVersionOpen,
		Drop:   drop,
		Detail: jsonObject(map[string]any{"dataset": dataset, "version": version}),
	}); err != nil {
		return datadrop.DatasetVersion{}, err
	}

	if err := tx.Commit(); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrap(err, "store: commit version open")
	}
	committed = true

	log.Info().Str("drop", drop).Str("dataset", dataset).Int("version", version).
		Msg("opened draft dataset version")

	return datadrop.DatasetVersion{
		Drop: drop, Dataset: dataset, Version: version,
		State: datadrop.StateDraft, CreatedAt: now,
	}, nil
}

// AddDatasetFile records a file in a draft version and updates its counters.
//
// The blob must already be stored; this operation is metadata only, which is
// what lets the upload handler use it both for a streamed body and for the
// bodyless mount of an existing digest.
func (s *Store) AddDatasetFile(
	ctx context.Context, drop, dataset string, version int, file datadrop.DatasetFile,
) error {
	if err := datadrop.ValidateDatasetPath(file.Path); err != nil {
		return err
	}

	now := s.Now()

	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	state, err := versionStateTx(ctx, tx, drop, dataset, version)
	if err != nil {
		return err
	}
	if state != datadrop.StateDraft {
		return errors.Wrapf(ErrImmutable, "%s/%s version %d", drop, dataset, version)
	}

	// The blob row is the store's record that these bytes exist; it is shared
	// across every version referencing them.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO blobs(digest, size_bytes, created_at) VALUES(?, ?, ?)
		 ON CONFLICT(digest) DO NOTHING`,
		file.Digest, file.SizeBytes, FormatTime(now)); err != nil {
		return errors.Wrapf(err, "store: record blob %s", file.Digest)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO dataset_files(drop_name, dataset_name, version, path, digest, size_bytes, media_type)
		VALUES(?, ?, ?, ?, ?, ?, ?)`,
		drop, dataset, version, file.Path, file.Digest, file.SizeBytes,
		nullableString(file.MediaType)); err != nil {
		if isUniqueViolation(err) {
			// Replacing a file is a new version, not a mutation of this one.
			return errors.Wrapf(ErrAlreadyExists, "path %q in %s/%s version %d",
				file.Path, drop, dataset, version)
		}
		return errors.Wrapf(err, "store: add file %q", file.Path)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE dataset_versions
		   SET file_count = file_count + 1, total_bytes = total_bytes + ?
		 WHERE drop_name = ? AND dataset_name = ? AND version = ?`,
		file.SizeBytes, drop, dataset, version); err != nil {
		return errors.Wrap(err, "store: update version counters")
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionDatasetFileAdd,
		Drop:   drop,
		Detail: jsonObject(map[string]any{
			"dataset": dataset, "version": version,
			"path": file.Path, "digest": file.Digest, "size_bytes": file.SizeBytes,
		}),
	}); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return errors.Wrap(err, "store: commit file add")
	}
	committed = true
	return nil
}

// CommitDatasetVersion validates the manifest and moves a draft to committed.
//
// After this returns, the version is visible to readers and can never be
// modified.
func (s *Store) CommitDatasetVersion(
	ctx context.Context, drop, dataset string, version int, req datadrop.CommitVersionRequest,
) (datadrop.DatasetVersion, error) {
	manifest, err := compactJSON(req.Manifest)
	if err != nil {
		return datadrop.DatasetVersion{}, errors.Wrap(err, "store: manifest")
	}
	if len(manifest) == 0 {
		manifest = json.RawMessage("{}")
	}

	parsed, err := datadrop.ParseManifest(manifest)
	if err != nil {
		return datadrop.DatasetVersion{}, err
	}

	schemaSpec, err := compactJSON(req.Schema)
	if err != nil {
		return datadrop.DatasetVersion{}, errors.Wrap(err, "store: schema")
	}

	now := s.Now()

	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return datadrop.DatasetVersion{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	state, err := versionStateTx(ctx, tx, drop, dataset, version)
	if err != nil {
		return datadrop.DatasetVersion{}, err
	}
	if state != datadrop.StateDraft {
		return datadrop.DatasetVersion{}, errors.Wrapf(ErrImmutable,
			"%s/%s version %d is already committed", drop, dataset, version)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE dataset_versions
		   SET state = ?, manifest = ?, schema_spec = ?, title = ?, license = ?,
		       row_count = ?, committed_at = ?
		 WHERE drop_name = ? AND dataset_name = ? AND version = ?`,
		string(datadrop.StateCommitted), string(manifest), nullableJSON(schemaSpec),
		nullableString(parsed.Title), nullableString(parsed.License),
		nullableInt64(parsed.RowCount), FormatTime(now),
		drop, dataset, version); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrap(err, "store: commit version")
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionDatasetVersionCommit,
		Drop:   drop,
		Detail: jsonObject(map[string]any{"dataset": dataset, "version": version}),
	}); err != nil {
		return datadrop.DatasetVersion{}, err
	}

	if err := tx.Commit(); err != nil {
		return datadrop.DatasetVersion{}, errors.Wrap(err, "store: commit version transition")
	}
	committed = true

	log.Info().Str("drop", drop).Str("dataset", dataset).Int("version", version).
		Msg("committed dataset version")

	return s.GetDatasetVersion(ctx, drop, dataset, version, true)
}

// GetDatasetVersion reads one version with its files.
//
// includeDrafts must be false on every path that serves a reader. It exists
// only so the upload handler can inspect the draft it is assembling.
func (s *Store) GetDatasetVersion(
	ctx context.Context, drop, dataset string, version int, includeDrafts bool,
) (datadrop.DatasetVersion, error) {
	query := `
		SELECT drop_name, dataset_name, version, state, manifest, schema_spec,
		       file_count, total_bytes, created_at, committed_at
		  FROM dataset_versions
		 WHERE drop_name = ? AND dataset_name = ? AND version = ?`
	args := []any{drop, dataset, version}
	if !includeDrafts {
		query += ` AND state = ?`
		args = append(args, string(datadrop.StateCommitted))
	}

	v, err := scanDatasetVersion(s.db.QueryRowContext(ctx, query, args...))
	if err != nil {
		if isNoRows(err) {
			return datadrop.DatasetVersion{}, errors.Wrapf(ErrNotFound,
				"%s/%s version %d", drop, dataset, version)
		}
		return datadrop.DatasetVersion{}, errors.Wrapf(err, "store: get version %d", version)
	}

	v.Files, err = s.ListDatasetFiles(ctx, drop, dataset, version)
	if err != nil {
		return datadrop.DatasetVersion{}, err
	}
	return v, nil
}

// ResolveLatestVersion returns the highest committed version number.
//
// The state filter is the whole point: a draft must not shadow the committed
// version a reader would otherwise receive.
func (s *Store) ResolveLatestVersion(ctx context.Context, drop, dataset string) (int, error) {
	var version sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `
		SELECT MAX(version) FROM dataset_versions
		 WHERE drop_name = ? AND dataset_name = ? AND state = ?`,
		drop, dataset, string(datadrop.StateCommitted)).Scan(&version); err != nil {
		return 0, errors.Wrapf(err, "store: resolve latest version of %s/%s", drop, dataset)
	}
	if !version.Valid {
		return 0, errors.Wrapf(ErrNotFound, "no committed version of %s/%s", drop, dataset)
	}
	return int(version.Int64), nil
}

// GetDatasetFile reads one file record from a committed version.
func (s *Store) GetDatasetFile(
	ctx context.Context, drop, dataset string, version int, path string,
) (datadrop.DatasetFile, error) {
	var (
		file      datadrop.DatasetFile
		mediaType sql.NullString
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT f.path, f.digest, f.size_bytes, f.media_type
		  FROM dataset_files f
		  JOIN dataset_versions v
		    ON v.drop_name = f.drop_name AND v.dataset_name = f.dataset_name
		   AND v.version = f.version
		 WHERE f.drop_name = ? AND f.dataset_name = ? AND f.version = ? AND f.path = ?
		   AND v.state = ?`,
		drop, dataset, version, path, string(datadrop.StateCommitted),
	).Scan(&file.Path, &file.Digest, &file.SizeBytes, &mediaType)
	if err != nil {
		if isNoRows(err) {
			return datadrop.DatasetFile{}, errors.Wrapf(ErrNotFound,
				"file %q in %s/%s version %d", path, drop, dataset, version)
		}
		return datadrop.DatasetFile{}, errors.Wrapf(err, "store: get file %q", path)
	}
	file.MediaType = mediaType.String
	return file, nil
}

// ListDatasetFiles returns a version's files, path-ordered.
func (s *Store) ListDatasetFiles(
	ctx context.Context, drop, dataset string, version int,
) ([]datadrop.DatasetFile, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT path, digest, size_bytes, media_type
		  FROM dataset_files
		 WHERE drop_name = ? AND dataset_name = ? AND version = ?
		 ORDER BY path`, drop, dataset, version)
	if err != nil {
		return nil, errors.Wrap(err, "store: list dataset files")
	}
	defer func() { _ = rows.Close() }()

	files := []datadrop.DatasetFile{}
	for rows.Next() {
		var (
			file      datadrop.DatasetFile
			mediaType sql.NullString
		)
		if err := rows.Scan(&file.Path, &file.Digest, &file.SizeBytes, &mediaType); err != nil {
			return nil, errors.Wrap(err, "store: scan dataset file")
		}
		file.MediaType = mediaType.String
		files = append(files, file)
	}
	return files, errors.Wrap(rows.Err(), "store: list dataset files")
}

// ListDatasets returns every dataset in a drop with its committed versions.
func (s *Store) ListDatasets(ctx context.Context, drop string) ([]datadrop.Dataset, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT name, created_at FROM datasets WHERE drop_name = ? ORDER BY name`, drop)
	if err != nil {
		return nil, errors.Wrapf(err, "store: list datasets in %q", drop)
	}
	defer func() { _ = rows.Close() }()

	datasets := []datadrop.Dataset{}
	for rows.Next() {
		var (
			d         datadrop.Dataset
			createdAt string
		)
		if err := rows.Scan(&d.Name, &createdAt); err != nil {
			return nil, errors.Wrap(err, "store: scan dataset")
		}
		d.Drop = drop
		if d.CreatedAt, err = ParseTime(createdAt); err != nil {
			return nil, err
		}
		datasets = append(datasets, d)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "store: list datasets")
	}

	for i := range datasets {
		versions, err := s.ListDatasetVersions(ctx, drop, datasets[i].Name)
		if err != nil {
			return nil, err
		}
		datasets[i].Versions = versions
	}
	return datasets, nil
}

// GetDataset reads one dataset with its committed versions.
func (s *Store) GetDataset(ctx context.Context, drop, dataset string) (datadrop.Dataset, error) {
	var (
		d         datadrop.Dataset
		createdAt string
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT name, created_at FROM datasets WHERE drop_name = ? AND name = ?`,
		drop, dataset).Scan(&d.Name, &createdAt)
	if err != nil {
		if isNoRows(err) {
			return datadrop.Dataset{}, errors.Wrapf(ErrNotFound, "dataset %s/%s", drop, dataset)
		}
		return datadrop.Dataset{}, errors.Wrapf(err, "store: get dataset %s/%s", drop, dataset)
	}

	d.Drop = drop
	if d.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.Dataset{}, err
	}
	if d.Versions, err = s.ListDatasetVersions(ctx, drop, dataset); err != nil {
		return datadrop.Dataset{}, err
	}
	return d, nil
}

// ListDatasetVersions returns a dataset's committed versions, newest first.
// Drafts are never included.
func (s *Store) ListDatasetVersions(
	ctx context.Context, drop, dataset string,
) ([]datadrop.DatasetVersion, error) {
	return s.listDatasetVersions(ctx, drop, dataset, datadrop.StateCommitted)
}

// ListDraftDatasetVersions returns the versions still being assembled.
//
// Separate from ListDatasetVersions, and deliberately not a boolean parameter
// on it: every read path in the API filters on committed, because
// "a reader must never observe a version that is still being assembled"
// (handlers_datasets.go). Drafts are visible to WRITERS only, which is a
// different question with a different answer, and a flag that flips it is a
// flag someone passes wrongly.
//
// This exists because without it a client cannot recover from an interrupted
// upload: the draft version number is gone on reload, the API will not admit
// the version exists, and its blob references keep garbage collection from
// reclaiming the bytes. A slow disk leak with no visible cause (guide §4.5).
func (s *Store) ListDraftDatasetVersions(
	ctx context.Context, drop, dataset string,
) ([]datadrop.DatasetVersion, error) {
	return s.listDatasetVersions(ctx, drop, dataset, datadrop.StateDraft)
}

func (s *Store) listDatasetVersions(
	ctx context.Context, drop, dataset string, state datadrop.VersionState,
) ([]datadrop.DatasetVersion, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT drop_name, dataset_name, version, state, manifest, schema_spec,
		       file_count, total_bytes, created_at, committed_at
		  FROM dataset_versions
		 WHERE drop_name = ? AND dataset_name = ? AND state = ?
		 ORDER BY version DESC`,
		drop, dataset, string(state))
	if err != nil {
		return nil, errors.Wrapf(err, "store: list versions of %s/%s", drop, dataset)
	}
	defer func() { _ = rows.Close() }()

	versions := []datadrop.DatasetVersion{}
	for rows.Next() {
		v, err := scanDatasetVersion(rows)
		if err != nil {
			return nil, errors.Wrap(err, "store: scan dataset version")
		}
		versions = append(versions, v)
	}
	return versions, errors.Wrap(rows.Err(), "store: list dataset versions")
}

// DeleteDatasetVersion removes a version and its file records.
//
// Blobs are left in place: they may be referenced by other versions, and the
// ones that are not are reclaimed by a garbage-collection sweep.
func (s *Store) DeleteDatasetVersion(ctx context.Context, drop, dataset string, version int) error {
	tx, err := s.beginImmediate(ctx)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if _, err := versionStateTx(ctx, tx, drop, dataset, version); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM dataset_versions WHERE drop_name = ? AND dataset_name = ? AND version = ?`,
		drop, dataset, version); err != nil {
		return errors.Wrapf(err, "store: delete version %d", version)
	}

	if err := s.audit(ctx, tx, datadrop.AuditRecord{
		Action: datadrop.ActionDatasetVersionDelete,
		Drop:   drop,
		Detail: jsonObject(map[string]any{"dataset": dataset, "version": version}),
	}); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return errors.Wrap(err, "store: commit version delete")
	}
	committed = true

	log.Info().Str("drop", drop).Str("dataset", dataset).Int("version", version).
		Msg("deleted dataset version")
	return nil
}

// ReferencedDigests returns every digest referenced by any dataset file.
//
// Garbage collection takes this set and deletes everything else, which is why
// the blob store does not need to know what a dataset is.
func (s *Store) ReferencedDigests(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT DISTINCT digest FROM dataset_files`)
	if err != nil {
		return nil, errors.Wrap(err, "store: list referenced digests")
	}
	defer func() { _ = rows.Close() }()

	digests := map[string]struct{}{}
	for rows.Next() {
		var digest string
		if err := rows.Scan(&digest); err != nil {
			return nil, errors.Wrap(err, "store: scan digest")
		}
		digests[digest] = struct{}{}
	}
	return digests, errors.Wrap(rows.Err(), "store: list referenced digests")
}

// versionStateTx reads a version's state inside a transaction, mapping a
// missing row to ErrNotFound.
func versionStateTx(
	ctx context.Context, tx *sql.Tx, drop, dataset string, version int,
) (datadrop.VersionState, error) {
	var state string
	err := tx.QueryRowContext(ctx,
		`SELECT state FROM dataset_versions
		  WHERE drop_name = ? AND dataset_name = ? AND version = ?`,
		drop, dataset, version).Scan(&state)
	if err != nil {
		if isNoRows(err) {
			return "", errors.Wrapf(ErrNotFound, "%s/%s version %d", drop, dataset, version)
		}
		return "", errors.Wrapf(err, "store: read state of version %d", version)
	}
	return datadrop.VersionState(state), nil
}

func scanDatasetVersion(sc scanner) (datadrop.DatasetVersion, error) {
	var (
		v           datadrop.DatasetVersion
		state       string
		manifest    string
		schemaSpec  sql.NullString
		createdAt   string
		committedAt sql.NullString
	)
	if err := sc.Scan(&v.Drop, &v.Dataset, &v.Version, &state, &manifest, &schemaSpec,
		&v.FileCount, &v.TotalBytes, &createdAt, &committedAt); err != nil {
		return datadrop.DatasetVersion{}, err
	}

	v.State = datadrop.VersionState(state)
	v.Manifest = json.RawMessage(manifest)
	if schemaSpec.Valid {
		v.Schema = json.RawMessage(schemaSpec.String)
	}

	var err error
	if v.CreatedAt, err = ParseTime(createdAt); err != nil {
		return datadrop.DatasetVersion{}, err
	}
	if committedAt.Valid {
		t, err := ParseTime(committedAt.String)
		if err != nil {
			return datadrop.DatasetVersion{}, err
		}
		v.CommittedAt = &t
	}
	return v, nil
}

func nullableInt64(v *int64) any {
	if v == nil {
		return nil
	}
	return *v
}
