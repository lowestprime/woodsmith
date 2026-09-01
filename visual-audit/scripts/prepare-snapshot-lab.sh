#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
MEDIA_SOURCE="/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025"
LAB_RUN_ID="${LAB_RUN_ID:-$(date -u '+%Y%m%dT%H%M%SZ')}"
LAB_ROOT="${ROOT}/visual-audit-lab/${LAB_RUN_ID}"
LAB_DATA="${LAB_ROOT}/data"
LAB_MEDIA_ROOT="/volume1/homes/Cooper/visual-audit-lab/${LAB_RUN_ID}"
LAB_MEDIA="${LAB_MEDIA_ROOT}/pics"
BACKUP_HOST_DIR="${ROOT}/site/data/.visual-audit-backup-${LAB_RUN_ID}"
BACKUP_HOST_PATH="${BACKUP_HOST_DIR}/woodsmith.sqlite"
BACKUP_CONTAINER_DIR="/app/site/data/.visual-audit-backup-${LAB_RUN_ID}"
BACKUP_CONTAINER_PATH="${BACKUP_CONTAINER_DIR}/woodsmith.sqlite"

cd "$ROOT"
umask 077

if [[ ! "$LAB_RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]]; then
  printf '%s\n' "LAB_RUN_ID must contain only letters, numbers, periods, underscores, or hyphens." >&2
  exit 1
fi

if [[ ! -s .env ]]; then
  printf '%s\n' "Required runtime .env file is missing or empty." >&2
  exit 1
fi

read_required_runtime_id() {
  local name="$1"
  local value

  value="$(
    sed -nE \
      "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*$/\1/p" \
      .env |
      tail -n 1
  )"

  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf 'Missing or invalid numeric %s in .env.\n' "$name" >&2
    exit 1
  fi

  printf '%s' "$value"
}

runtime_uid="$(read_required_runtime_id PUID)"
runtime_gid="$(read_required_runtime_id PGID)"

if [[ "$runtime_uid" == "0" || "$runtime_gid" == "0" ]]; then
  printf '%s\n' "Refusing a root-owned snapshot-lab runtime." >&2
  exit 1
fi

source visual-audit/scripts/docker-command.sh
resolve_docker_command

TARGET_COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(printf '%s' "$TARGET_COMMIT_SHA" | cut -c1-8)"
WOODSMITH_AUDIT_APP_IMAGE="${WOODSMITH_AUDIT_APP_IMAGE:-woodsmith:candidate-${COMMIT_SHORT}}"
WOODSMITH_VISUAL_AUDIT_IMAGE="${WOODSMITH_VISUAL_AUDIT_IMAGE:-woodsmith-visual-audit:candidate-${COMMIT_SHORT}}"

require_exact_app_image "$WOODSMITH_AUDIT_APP_IMAGE" "$TARGET_COMMIT_SHA"
require_linux_amd64_image "$WOODSMITH_VISUAL_AUDIT_IMAGE"

if [[ -e "$LAB_ROOT" || -e "$LAB_MEDIA_ROOT" ]]; then
  printf 'Refusing to overwrite an existing snapshot lab: %s\n' "$LAB_RUN_ID" >&2
  exit 1
fi

if [[ ! -d "$MEDIA_SOURCE" || ! -s secrets/woodsmith_visual_audit_token ]]; then
  printf '%s\n' "Production media or audit-token secret is unavailable." >&2
  exit 1
fi

lab_paths_created=false
backup_dir_created=false

cleanup() {
  status=$?
  trap - EXIT
  set +e

  if [[ "$backup_dir_created" == "true" ]]; then
    rm -f -- "$BACKUP_HOST_PATH"
    rmdir -- "$BACKUP_HOST_DIR" 2>/dev/null || true
  fi

  if [[ "$status" -ne 0 && "$lab_paths_created" == "true" ]]; then
    case "$LAB_ROOT" in
      "${ROOT}/visual-audit-lab/"*) rm -rf -- "$LAB_ROOT" ;;
      *) printf 'Refusing unsafe snapshot-lab data cleanup: %s\n' "$LAB_ROOT" >&2 ;;
    esac

    case "$LAB_MEDIA_ROOT" in
      "/volume1/homes/Cooper/visual-audit-lab/"*) rm -rf -- "$LAB_MEDIA_ROOT" ;;
      *) printf 'Refusing unsafe snapshot-lab media cleanup: %s\n' "$LAB_MEDIA_ROOT" >&2 ;;
    esac
  fi

  exit "$status"
}

trap cleanup EXIT

lab_paths_created=true
mkdir -p "$LAB_DATA" "$LAB_MEDIA"
chmod 700 "$LAB_ROOT" "$LAB_MEDIA_ROOT" "$LAB_DATA" "$LAB_MEDIA"

mkdir -m 700 -- "$BACKUP_HOST_DIR"
backup_dir_created=true
chown "${runtime_uid}:${runtime_gid}" "$BACKUP_HOST_DIR"
chmod 700 "$BACKUP_HOST_DIR"

backup_owner="$(stat -c '%u:%g' "$BACKUP_HOST_DIR")"
if [[ "$backup_owner" != "${runtime_uid}:${runtime_gid}" ]]; then
  printf \
    'Snapshot-lab backup directory ownership mismatch: %s is %s, expected %s:%s.\n' \
    "$BACKUP_HOST_DIR" \
    "$backup_owner" \
    "$runtime_uid" \
    "$runtime_gid" \
    >&2
  exit 1
fi

docker_cmd exec -i -e BACKUP_PATH="$BACKUP_CONTAINER_PATH" woodsmith node --experimental-sqlite - <<'NODE'
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const source = "/app/site/data/woodsmith.sqlite";
const destination = process.env.BACKUP_PATH;
if (!destination) throw new Error("BACKUP_PATH is missing.");
if (fs.existsSync(destination)) throw new Error("Refusing to overwrite an existing lab backup.");
const database = new DatabaseSync(source);
try {
  database.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
} finally {
  database.close();
}
const verification = new DatabaseSync(destination, { readOnly: true });
let result;
try {
  result = verification.prepare("PRAGMA quick_check").all();
} finally {
  verification.close();
}
if (!result.some((row) => row.quick_check === "ok")) throw new Error("Snapshot-lab database quick_check failed.");
console.log("Snapshot-lab database quick_check: ok");
NODE

install -m 600 "$BACKUP_HOST_PATH" "${LAB_DATA}/woodsmith.sqlite"
printf '%s\n' "$LAB_RUN_ID" > "${LAB_DATA}/.woodsmith-visual-audit-lab"
chmod 600 "${LAB_DATA}/.woodsmith-visual-audit-lab"

test_file="$(find "$MEDIA_SOURCE" -type f -print -quit)"
if [[ -z "$test_file" ]]; then
  printf '%s\n' "Production media source contains no files." >&2
  exit 1
fi

if cp --reflink=always "$test_file" "${LAB_MEDIA}/.reflink-test" 2>/dev/null; then
  rm -f -- "${LAB_MEDIA}/.reflink-test"
  cp -a --reflink=always "${MEDIA_SOURCE}/." "${LAB_MEDIA}/"
else
  rm -f -- "${LAB_MEDIA}/.reflink-test"
  rsync -a "${MEDIA_SOURCE}/" "${LAB_MEDIA}/"
fi

printf '%s\n' "$LAB_RUN_ID" > "${LAB_MEDIA}/.woodsmith-visual-audit-lab"
chmod 600 "${LAB_MEDIA}/.woodsmith-visual-audit-lab"

chown -R \
  "${runtime_uid}:${runtime_gid}" \
  "$LAB_ROOT" \
  "$LAB_MEDIA_ROOT"

chmod -R \
  u+rwX,go-rwx \
  "$LAB_ROOT" \
  "$LAB_MEDIA_ROOT"

for required_path in \
  "$LAB_ROOT" \
  "$LAB_DATA" \
  "${LAB_DATA}/woodsmith.sqlite" \
  "${LAB_DATA}/.woodsmith-visual-audit-lab" \
  "$LAB_MEDIA_ROOT" \
  "$LAB_MEDIA" \
  "${LAB_MEDIA}/.woodsmith-visual-audit-lab"
do
  actual_owner="$(stat -c '%u:%g' "$required_path")"

  if [[ "$actual_owner" != "${runtime_uid}:${runtime_gid}" ]]; then
    printf \
      'Snapshot-lab ownership mismatch: %s is %s, expected %s:%s.\n' \
      "$required_path" \
      "$actual_owner" \
      "$runtime_uid" \
      "$runtime_gid" \
      >&2
    exit 1
  fi
done

LAB_STUDIO_PASSWORD="$(openssl rand -hex 36)"
LAB_SESSION_SECRET="$(openssl rand -hex 48)"

printf '%s' "$LAB_STUDIO_PASSWORD" > secrets/woodsmith_audit_lab_password
chmod 600 secrets/woodsmith_audit_lab_password

cat > .visual-audit-lab.env <<EOF
AUDIT_LAB_DATA_DIR=${LAB_DATA}
AUDIT_LAB_MEDIA_DIR=${LAB_MEDIA}
AUDIT_LAB_STUDIO_PASSWORD=${LAB_STUDIO_PASSWORD}
AUDIT_LAB_SESSION_SECRET=${LAB_SESSION_SECRET}
AUDIT_EVIDENCE_TIER=tier-2-production-clone
AUDIT_MEDIA_PROVENANCE=production-clone
LAB_RUN_ID=${LAB_RUN_ID}
WOODSMITH_AUDIT_APP_IMAGE=${WOODSMITH_AUDIT_APP_IMAGE}
WOODSMITH_VISUAL_AUDIT_IMAGE=${WOODSMITH_VISUAL_AUDIT_IMAGE}
EOF
chmod 600 .visual-audit-lab.env

unset LAB_STUDIO_PASSWORD LAB_SESSION_SECRET
printf 'Prepared isolated snapshot lab %s. Run visual-audit/scripts/run-snapshot-lab.sh next.\n' "$LAB_RUN_ID"
