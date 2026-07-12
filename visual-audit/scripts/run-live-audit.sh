#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
OUTPUT="${ROOT}/visual-audits"
LOCK="/tmp/woodsmith-visual-audit.lock"

cd "$ROOT"
umask 077

if ! mkdir "$LOCK" 2>/dev/null; then
  printf '%s\n' "Another Woodsmith visual audit is already running."
  exit 0
fi

cleanup() { rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup EXIT

for required_file in .env secrets/woodsmith_audit_admin_password secrets/woodsmith_visual_audit_token; do
  if [[ ! -s "$required_file" ]]; then
    printf 'Missing or empty required audit file: %s\n' "$required_file" >&2
    exit 1
  fi
done

TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
AUDIT_RUN_ID="${AUDIT_RUN_ID:-full-$(date -u '+%Y%m%dT%H%M%SZ')-${COMMIT_SHORT}}"

export TARGET_COMMIT_SHA AUDIT_RUN_ID
export AUDIT_SCOPE="${AUDIT_SCOPE:-full}"
export AUDIT_RESUME="${AUDIT_RESUME:-true}"

mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

compose=(docker compose --env-file .env -f docker-compose.visual-audit-live.yml)
"${compose[@]}" build visual-audit
"${compose[@]}" run --rm visual-audit
"${compose[@]}" run --rm --entrypoint node visual-audit dist/diff.js
"${compose[@]}" run --rm --entrypoint node visual-audit dist/report.js
"${compose[@]}" run --rm --entrypoint node visual-audit dist/validate.js

chmod -R go-rwx "${OUTPUT}/${AUDIT_RUN_ID}"

if [[ "${AUDIT_RETENTION_APPLY:-false}" == "true" ]]; then
  AUDIT_RETENTION_DAYS="${AUDIT_RETENTION_DAYS:-90}" visual-audit/scripts/prune-audits.sh --apply
fi

printf 'Completed visual audit: %s/%s\n' "$OUTPUT" "$AUDIT_RUN_ID"
