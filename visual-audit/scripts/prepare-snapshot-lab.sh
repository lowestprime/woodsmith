#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
MEDIA_SOURCE="/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025"
LAB_RUN_ID="${LAB_RUN_ID:-$(date -u '+%Y%m%dT%H%M%SZ')}"
LAB_ROOT="${ROOT}/visual-audit-lab/${LAB_RUN_ID}"
LAB_DATA="${LAB_ROOT}/data"
LAB_MEDIA_ROOT="/volume1/homes/Cooper/visual-audit-lab/${LAB_RUN_ID}"
LAB_MEDIA="${LAB_MEDIA_ROOT}/pics"
BACKUP_HOST_PATH="${ROOT}/site/data/backups/visual-audit-lab-${LAB_RUN_ID}.sqlite"
BACKUP_CONTAINER_PATH="/app/site/data/backups/visual-audit-lab-${LAB_RUN_ID}.sqlite"

cd "$ROOT"
umask 077

if [[ -e "$LAB_ROOT" || -e "$LAB_MEDIA_ROOT" ]]; then
  printf 'Refusing to overwrite an existing snapshot lab: %s\n' "$LAB_RUN_ID" >&2
  exit 1
fi

if [[ ! -d "$MEDIA_SOURCE" || ! -s secrets/woodsmith_visual_audit_token ]]; then
  printf '%s\n' "Production media or audit-token secret is unavailable." >&2
  exit 1
fi

mkdir -p "$LAB_DATA" "$LAB_MEDIA"
chmod 700 "$LAB_ROOT" "$LAB_MEDIA_ROOT" "$LAB_DATA" "$LAB_MEDIA"

docker exec -i -e BACKUP_PATH="$BACKUP_CONTAINER_PATH" woodsmith node --experimental-sqlite - <<'NODE'
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const source = "/app/site/data/woodsmith.sqlite";
const destination = process.env.BACKUP_PATH;
if (!destination) throw new Error("BACKUP_PATH is missing.");
if (fs.existsSync(destination)) throw new Error("Refusing to overwrite an existing lab backup.");
const database = new DatabaseSync(source);
database.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
database.close();
const verification = new DatabaseSync(destination, { readOnly: true });
const result = verification.prepare("PRAGMA quick_check").all();
verification.close();
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

LAB_STUDIO_PASSWORD="$(openssl rand -hex 36)"
LAB_SESSION_SECRET="$(openssl rand -hex 48)"

printf '%s' "$LAB_STUDIO_PASSWORD" > secrets/woodsmith_audit_lab_password
chmod 600 secrets/woodsmith_audit_lab_password

cat > .visual-audit-lab.env <<EOF
AUDIT_LAB_DATA_DIR=${LAB_DATA}
AUDIT_LAB_MEDIA_DIR=${LAB_MEDIA}
AUDIT_LAB_STUDIO_PASSWORD=${LAB_STUDIO_PASSWORD}
AUDIT_LAB_SESSION_SECRET=${LAB_SESSION_SECRET}
LAB_RUN_ID=${LAB_RUN_ID}
EOF
chmod 600 .visual-audit-lab.env

unset LAB_STUDIO_PASSWORD LAB_SESSION_SECRET
printf 'Prepared isolated snapshot lab %s. Run visual-audit/scripts/run-snapshot-lab.sh next.\n' "$LAB_RUN_ID"
