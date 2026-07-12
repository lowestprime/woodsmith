#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
cd "$ROOT"
umask 077

LOCK="/tmp/woodsmith-visual-audit-lab.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  printf '%s\n' "Another Woodsmith snapshot-lab audit is already running."
  exit 0
fi
cleanup_lock() { rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup_lock EXIT

for required_file in .env .visual-audit-lab.env secrets/woodsmith_audit_lab_password secrets/woodsmith_visual_audit_token; do
  if [[ ! -s "$required_file" ]]; then
    printf 'Missing or empty required snapshot-lab file: %s\n' "$required_file" >&2
    exit 1
  fi
done

set -a
source ./.visual-audit-lab.env
set +a

for directory in "${AUDIT_LAB_DATA_DIR:?}" "${AUDIT_LAB_MEDIA_DIR:?}"; do
  resolved="$(readlink -f "$directory")"
  if [[ ! -d "$resolved" || "$resolved" == "/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025" || "$resolved" == "/volume2/docker_ssd/woodsmith/site/data" ]]; then
    printf 'Refusing unsafe snapshot-lab mount: %s\n' "$directory" >&2
    exit 1
  fi
done

for marker in "${AUDIT_LAB_DATA_DIR}/.woodsmith-visual-audit-lab" "${AUDIT_LAB_MEDIA_DIR}/.woodsmith-visual-audit-lab"; do
  if [[ ! -s "$marker" || "$(<"$marker")" != "${LAB_RUN_ID:?}" ]]; then
    printf 'Refusing unverified snapshot-lab mount; marker mismatch: %s\n' "$marker" >&2
    exit 1
  fi
done

TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
AUDIT_RUN_ID="${AUDIT_RUN_ID:-lab-$(date -u '+%Y%m%dT%H%M%SZ')-${COMMIT_SHORT}}"
export TARGET_COMMIT_SHA AUDIT_RUN_ID
export AUDIT_SCOPE="${AUDIT_SCOPE:-full}"
export AUDIT_RESUME="${AUDIT_RESUME:-true}"

compose=(docker compose --env-file .env --env-file .visual-audit-lab.env -f docker-compose.visual-audit-lab.yml)
cleanup() {
  "${compose[@]}" down >/dev/null 2>&1 || true
  cleanup_lock
}
trap cleanup EXIT

"${compose[@]}" up -d woodsmith-audit-lab
"${compose[@]}" run --rm visual-audit
"${compose[@]}" run --rm --entrypoint node visual-audit dist/diff.js
"${compose[@]}" run --rm --entrypoint node visual-audit dist/report.js
"${compose[@]}" run --rm --entrypoint node visual-audit dist/validate.js

chmod -R go-rwx "/volume2/docker_ssd/woodsmith/visual-audits/${AUDIT_RUN_ID}"
printf 'Completed snapshot-lab audit: %s\n' "$AUDIT_RUN_ID"
