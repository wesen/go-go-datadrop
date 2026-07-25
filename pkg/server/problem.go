package server

import (
	"net/http"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-datadrop/pkg/datadrop"
	"github.com/go-go-golems/go-go-datadrop/pkg/store"
)

// Problem is the error body every failing endpoint returns.
//
// The shape follows the upstream design §18.2: a machine-readable code, a
// human-readable detail, the request ID for correlating with logs, and — where
// the failure is per-field — the offending instance paths.
type Problem struct {
	Code      string               `json:"code"`
	Detail    string               `json:"detail"`
	RequestID string               `json:"request_id,omitempty"`
	Errors    []datadrop.Violation `json:"errors,omitempty"`
}

// Problem codes. These are part of the API contract: clients branch on them,
// so they must not be renamed casually.
const (
	CodeInvalidRequest = "InvalidRequest"
	CodeUnauthorized   = "Unauthorized"
	// CodeForbidden is authenticated-but-not-permitted, deliberately distinct
	// from Unauthorized. A client that cannot tell the two apart cannot tell
	// "sign in" from "ask for access", and shows the wrong thing to the user.
	CodeForbidden = "Forbidden"
	// CodeCrossOrigin is the CSRF refusal. It is its own code because the fix
	// is completely different from any other 403: it is a bug in the caller's
	// origin, not a permissions problem.
	CodeCrossOrigin       = "CrossOrigin"
	CodeConflict          = "Conflict"
	CodeNotFound          = "NotFound"
	CodeAlreadyExists     = "AlreadyExists"
	CodePayloadTooLarge   = "PayloadTooLarge"
	CodeSchemaInvalid     = "SchemaInvalid"
	CodeValidationFailed  = "SchemaValidationFailed"
	CodeStreamUnavailable = "StreamingUnavailable"
	CodeInternal          = "InternalError"
)

// writeProblem emits an error response. Every error path goes through here so
// the body shape and the request-ID correlation are never hand-rolled.
//
// Note what is NOT included: the bearer token, or any header value. The design
// requires that credentials never reach a response or a log line.
func writeProblem(w http.ResponseWriter, r *http.Request, status int,
	code, detail string, violations ...datadrop.Violation,
) {
	problem := Problem{
		Code:      code,
		Detail:    detail,
		RequestID: RequestIDFromContext(r.Context()),
		Errors:    violations,
	}

	if status >= http.StatusInternalServerError {
		log.Error().
			Str("code", code).Str("path", r.URL.Path).
			Str("request_id", problem.RequestID).
			Msg(detail)
	} else {
		log.Debug().
			Str("code", code).Int("status", status).Str("path", r.URL.Path).
			Str("request_id", problem.RequestID).
			Msg(detail)
	}

	writeJSON(w, r, status, problem)
}

// writeStoreError maps a store sentinel onto the right status and code.
//
// Anything unrecognized becomes a 500 with a generic detail: an internal error
// message may quote SQL or a file path, neither of which belongs in a response.
// The real error is logged against the request ID.
func (s *Server) writeStoreError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeProblem(w, r, http.StatusNotFound, CodeNotFound, err.Error())
	case errors.Is(err, store.ErrAlreadyExists):
		writeProblem(w, r, http.StatusConflict, CodeAlreadyExists, err.Error())
	case errors.Is(err, store.ErrConflict):
		// Also a 409, but a different code: "this name is taken" and "this drop
		// already has an owner" are the same status and completely different
		// remedies, and a client that branches on the code can say so.
		writeProblem(w, r, http.StatusConflict, CodeConflict, err.Error())
	default:
		s.internalError(w, r, err)
	}
}

// internalError logs the cause and returns an opaque 500.
func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	log.Error().
		Err(err).
		Str("path", r.URL.Path).
		Str("request_id", RequestIDFromContext(r.Context())).
		Msg("request failed")

	writeProblem(w, r, http.StatusInternalServerError, CodeInternal,
		"the server failed to handle this request")
}
