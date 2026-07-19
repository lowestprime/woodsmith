#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
OUTPUT="${ROOT}/visual-audits"
cd "$ROOT"
umask 077

source visual-audit/scripts/docker-command.sh
resolve_docker_command

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

if [[ "${AUDIT_EVIDENCE_TIER:-}" != "tier-2-production-clone" || "${AUDIT_MEDIA_PROVENANCE:-}" != "production-clone" ]]; then
  printf '%s\n' "Refusing snapshot lab without Tier 2 production-clone provenance." >&2
  exit 1
fi

TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
require_exact_app_image "${WOODSMITH_AUDIT_APP_IMAGE:?}" "$TARGET_COMMIT_SHA"
require_linux_amd64_image "${WOODSMITH_VISUAL_AUDIT_IMAGE:?}"

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

COMMIT_SHORT="$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
AUDIT_RUN_ID="${AUDIT_RUN_ID:-lab-$(date -u '+%Y%m%dT%H%M%SZ')-${COMMIT_SHORT}}"
export TARGET_COMMIT_SHA AUDIT_RUN_ID
export AUDIT_SCOPE="${AUDIT_SCOPE:-full}"
export AUDIT_RESUME="${AUDIT_RESUME:-true}"

mkdir -p "$OUTPUT"
chmod 700 "$OUTPUT"

compose=(
  docker_cmd
  compose
  --project-name
  woodsmith-visual-audit-lab
  --env-file
  .env
  --env-file
  .visual-audit-lab.env
  -f
  docker-compose.visual-audit-lab.yml
)

cleanup() {
  status=$?
  trap - EXIT
  set +e

  if [[ "$status" -ne 0 ]]; then
    failure_stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    failure_root="${OUTPUT}/failed-${AUDIT_RUN_ID}-${failure_stamp}"

    mkdir -p "$failure_root"
    chmod 700 "$failure_root"

    {
      printf 'captured_at=%s\n' "$failure_stamp"
      printf 'audit_run_id=%s\n' "$AUDIT_RUN_ID"
      printf 'target_commit_sha=%s\n' "$TARGET_COMMIT_SHA"
      printf 'exit_status=%s\n' "$status"
      printf '\n[compose ps]\n'
      "${compose[@]}" ps -a
    } > "${failure_root}/compose-state.txt" 2>&1

    "${compose[@]}" logs \
      --no-color \
      > "${failure_root}/compose.log" \
      2>&1 ||
      true

    for container in \
      woodsmith-audit-lab \
      woodsmith-visual-audit-lab-runner
    do
      if docker_cmd inspect "$container" >/dev/null 2>&1; then
        docker_cmd inspect \
          "$container" \
          --format \
          'container={{.Id}} image={{.Image}} user={{.Config.User}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}} error={{json .State.Error}}' \
          > "${failure_root}/${container}-state.txt" \
          2>&1 ||
          true
      fi
    done

    chmod -R go-rwx "$failure_root"

    printf \
      'Snapshot-lab failure evidence: %s\n' \
      "$failure_root" \
      >&2
  fi

  "${compose[@]}" down >/dev/null 2>&1 || true
  cleanup_lock
  exit "$status"
}

trap cleanup EXIT

"${compose[@]}" up -d woodsmith-audit-lab
"${compose[@]}" run -T --rm visual-audit
"${compose[@]}" run -T --rm --entrypoint node visual-audit dist/diff.js
"${compose[@]}" run -T --rm --entrypoint node visual-audit dist/report.js
"${compose[@]}" run -T --rm --entrypoint node visual-audit dist/validate.js

chmod -R go-rwx "${OUTPUT}/${AUDIT_RUN_ID}"
printf 'Completed snapshot-lab audit: %s\n' "$AUDIT_RUN_ID"
