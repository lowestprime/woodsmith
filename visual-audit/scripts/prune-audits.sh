#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith/visual-audits"
DAYS="${AUDIT_RETENTION_DAYS:-90}"
MODE="${1:-}"

resolved="$(readlink -f "$ROOT")"
if [[ "$resolved" != "/volume2/docker_ssd/woodsmith/visual-audits" || ! "$DAYS" =~ ^[0-9]+$ || "$DAYS" -lt 30 ]]; then
  printf '%s\n' "Refusing unsafe retention configuration." >&2
  exit 1
fi

mapfile -d '' candidates < <(find "$resolved" -mindepth 1 -maxdepth 1 -type d -mtime "+$DAYS" -print0)
printf 'Archives older than %s days: %s\n' "$DAYS" "${#candidates[@]}"

if [[ "$MODE" != "--apply" ]]; then
  printf '%s\n' "Dry run only. Re-run with --apply after reviewing storage and retention requirements."
  exit 0
fi

for candidate in "${candidates[@]}"; do
  target="$(readlink -f "$candidate")"
  if [[ "$target" != "$resolved"/* ]]; then
    printf 'Refusing path outside archive root: %s\n' "$target" >&2
    exit 1
  fi
  rm -rf --one-file-system -- "$target"
done
