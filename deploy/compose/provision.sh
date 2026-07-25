#!/bin/sh
# Provision Zitadel for datadrop: allow self-registration, create the project
# and the OIDC application, and hand the client credentials to datadrop.
#
# Runs once per `up`, exits, and datadrop waits for it (service_completed_
# successfully). It is idempotent because you will run it more than once.
#
# Authenticates as the IAM_OWNER machine user whose personal access token
# Zitadel writes to the shared volume on first boot
# (ZITADEL_FIRSTINSTANCE_PATPATH).
#
# Uses the v1 management and admin REST APIs. They are marked deprecated in
# favour of Connect-RPC v2 services, and they are still the right choice here:
# the v2 protos carry no google.api.http annotations, so their paths cannot be
# read off the source and must be discovered against a running instance. These
# paths are verified from proto/zitadel/management.proto and admin.proto.

set -eu

apk add --no-cache curl jq >/dev/null 2>&1

PAT_FILE=/bootstrap/admin.pat
API="$ZITADEL_BASE"

# ── 0. wait for the PAT ───────────────────────────────────────────────────────
#
# The healthcheck says the API is ready; the file appears at the end of the same
# first-boot sequence. Waiting a few seconds here is cheaper than a restart
# policy and says what it is waiting for.
attempt=0
while [ ! -s "$PAT_FILE" ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt 60 ]; then
        echo "provision: $PAT_FILE never appeared." >&2
        echo "  If this is not a first run, the bootstrap volume may be stale:" >&2
        echo "  'docker compose down' keeps it while discarding the database" >&2
        echo "  that issued it. Try: make compose-nuke" >&2
        exit 1
    fi
    sleep 2
done

PAT=$(cat "$PAT_FILE")
AUTH="Authorization: Bearer $PAT"
JSON="Content-Type: application/json"

api() {
    method=$1; path=$2; shift 2
    curl -fsS -X "$method" "$API$path" -H "$AUTH" -H "$JSON" "$@"
}

# Fail loudly rather than continuing with a broken credential.
if ! api GET /admin/v1/policies/login >/dev/null 2>&1; then
    echo "provision: the machine PAT was rejected by $API." >&2
    echo "  Most likely a stale bootstrap volume. Try: make compose-nuke" >&2
    exit 1
fi

# ── 1. allow self-registration ────────────────────────────────────────────────
#
# Two traps here, both learned the hard way.
#
# UpdateLoginPolicy is a FULL REPLACEMENT, not a patch. A PUT carrying only
# allowRegister:true sets allowUsernamePassword to false — and you have just
# locked every human out of an instance whose only other credential is this
# machine token. Hence the read-merge-write below.
#
# And Zitadel REJECTS AN UPDATE THAT CHANGES NOTHING with a 400. On an
# event-sourced store that is reasonable, and it means a blind write is not
# idempotent: the first `up` succeeds and the second fails. Hence the check.
#
# (On Zitadel v4 allowRegister already defaults to true, so this is usually a
# no-op. It stays because a version or a policy where it is not would otherwise
# fail silently at the point a stranger tries to sign up.)
POLICY=$(api GET /admin/v1/policies/login | jq -c '.policy')

if [ "$(echo "$POLICY" | jq -r '.allowRegister // false')" = "true" ]; then
    echo "provision: self-registration is already enabled"
else
    echo "provision: enabling self-registration"
    echo "$POLICY" \
      | jq '{
            allowUsernamePassword,
            allowRegister: true,
            allowExternalIdp,
            forceMfa,
            forceMfaLocalOnly,
            hidePasswordReset,
            ignoreUnknownUsernames,
            allowDomainDiscovery,
            disableLoginWithEmail,
            disableLoginWithPhone,
            passwordlessType,
            defaultRedirectUri
        }' \
      | api PUT /admin/v1/policies/login -d @- >/dev/null
fi

# ── 2. the project ────────────────────────────────────────────────────────────
#
# Idempotency is by search, not by a marker file: a marker records what this
# script did, not what the server has, and the two drift the first time someone
# deletes the app in the console.
PROJECT_ID=$(api POST /management/v1/projects/_search \
    -d '{"queries":[{"nameQuery":{"name":"datadrop","method":"TEXT_QUERY_METHOD_EQUALS"}}]}' \
    | jq -r '.result[0].id // empty')

if [ -z "$PROJECT_ID" ]; then
    echo "provision: creating the datadrop project"
    PROJECT_ID=$(api POST /management/v1/projects -d '{"name":"datadrop"}' | jq -r '.id')
fi

# ── 3. the OIDC application ───────────────────────────────────────────────────
APP_ID=$(api POST "/management/v1/projects/$PROJECT_ID/apps/_search" -d '{}' \
    | jq -r '[.result[]? | select(.name=="workbench") | .id][0] // empty')

if [ -z "$APP_ID" ]; then
    echo "provision: creating the workbench OIDC application"
    RESPONSE=$(api POST "/management/v1/projects/$PROJECT_ID/apps/oidc" -d "{
        \"name\": \"workbench\",
        \"redirectUris\": [\"$DATADROP_BASE/v1/auth/callback\"],
        \"postLogoutRedirectUris\": [\"$DATADROP_BASE/ui/\"],
        \"responseTypes\": [\"OIDC_RESPONSE_TYPE_CODE\"],
        \"grantTypes\": [\"OIDC_GRANT_TYPE_AUTHORIZATION_CODE\"],
        \"appType\": \"OIDC_APP_TYPE_WEB\",
        \"authMethodType\": \"OIDC_AUTH_METHOD_TYPE_BASIC\",
        \"accessTokenType\": \"OIDC_TOKEN_TYPE_BEARER\",
        \"idTokenUserinfoAssertion\": true,
        \"devMode\": true
    }")
    APP_ID=$(echo "$RESPONSE" | jq -r '.appId')
    CLIENT_ID=$(echo "$RESPONSE" | jq -r '.clientId')
    CLIENT_SECRET=$(echo "$RESPONSE" | jq -r '.clientSecret')
else
    # The app exists but its secret was shown once and is gone. Regenerating is
    # the only way to recover a known value, and it is safe here because the
    # only holder is the datadrop container we are about to (re)start.
    echo "provision: reusing application $APP_ID, regenerating its secret"
    CLIENT_ID=$(api GET "/management/v1/projects/$PROJECT_ID/apps/$APP_ID" \
        | jq -r '.app.oidcConfig.clientId')
    CLIENT_SECRET=$(api POST \
        "/management/v1/projects/$PROJECT_ID/apps/$APP_ID/oidc_config/_generate_client_secret" \
        -d '{}' | jq -r '.clientSecret')
fi

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "null" ]; then
    echo "provision: no client id was returned; refusing to write a broken configuration" >&2
    exit 1
fi

# ── 4. hand the credentials to datadrop ───────────────────────────────────────
#
# By file rather than by environment: a secret in the environment is visible in
# `docker inspect`, is inherited by every child process, and lands in a crash
# dump of the process environment.
printf '%s' "$CLIENT_ID"     > /bootstrap/datadrop-client-id
printf '%s' "$CLIENT_SECRET" > /bootstrap/datadrop-client-secret

# Owner-only, owned by the user that reads it: distroless's nonroot, uid 65532.
#
# The chown is not decoration. This script runs as root; datadrop does not, so
# a bare `chmod 600` locks out the only process that needs the file — and the
# symptom is "permission denied" from a container that has just successfully
# migrated its database, i.e. one that plainly has working storage.
chown 65532 /bootstrap/datadrop-client-secret /bootstrap/datadrop-client-id
chmod 600 /bootstrap/datadrop-client-secret

echo "provision: done — project=$PROJECT_ID app=$APP_ID client_id=$CLIENT_ID"
