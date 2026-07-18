#!/usr/bin/env bash

resolve_docker_command() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    WOODSMITH_DOCKER_COMMAND=(docker)
    return
  fi

  if command -v sudo >/dev/null 2>&1 \
    && [[ -x /usr/local/bin/docker ]] \
    && sudo -n /usr/local/bin/docker info >/dev/null 2>&1; then
    WOODSMITH_DOCKER_COMMAND=(sudo -n /usr/local/bin/docker)
    return
  fi

  printf '%s\n' "A working Docker daemon is unavailable to this account." >&2
  return 1
}

docker_cmd() {
  if [[ "${WOODSMITH_DOCKER_COMMAND[0]}" == "sudo" && "${1:-}" == "compose" ]]; then
    local name
    local -a environment=()
    local -a allowed=(
      TARGET_COMMIT_SHA
      AUDIT_RUN_ID
      AUDIT_SCOPE
      AUDIT_RESUME
      AUDIT_EVIDENCE_TIER
      AUDIT_MEDIA_PROVENANCE
      WOODSMITH_AUDIT_APP_IMAGE
      WOODSMITH_VISUAL_AUDIT_IMAGE
      VISUAL_AUDIT_BASE_URL
      APPROVED_BASELINE_ROOT
      WOODSMITH_ADMIN_EMAIL
      MAX_FULL_PAGE_DEVICE_HEIGHT
      MAX_STITCHED_SEGMENT_HEIGHT
      AUDIT_STRICT_DIAGNOSTICS
      VISUAL_AUDIT_ACCELERATOR
      VISUAL_AUDIT_CAPTURE_WORKERS
      VISUAL_AUDIT_VALIDATION_WORKERS
      VISUAL_AUDIT_REPORT_WORKERS
    )

    for name in "${allowed[@]}"; do
      if [[ -v "$name" ]]; then
        environment+=("${name}=${!name}")
      fi
    done
    sudo -n /usr/bin/env "${environment[@]}" /usr/local/bin/docker "$@"
    return
  fi

  "${WOODSMITH_DOCKER_COMMAND[@]}" "$@"
}

require_linux_amd64_image() {
  local image="$1"
  local platform

  if ! platform="$(docker_cmd image inspect "$image" --format '{{.Os}}/{{.Architecture}}' 2>/dev/null)"; then
    printf 'Required audit image is unavailable: %s\n' "$image" >&2
    return 1
  fi
  if [[ "$platform" != "linux/amd64" ]]; then
    printf 'Required audit image is not linux/amd64: %s (%s)\n' "$image" "$platform" >&2
    return 1
  fi
}

require_exact_app_image() {
  local image="$1"
  local commit_sha="$2"

  require_linux_amd64_image "$image"
  if ! docker_cmd image inspect "$image" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -Fqx "WOODSMITH_BUILD_SHA=${commit_sha}"; then
    printf 'Application audit image does not report the exact commit: %s\n' "$image" >&2
    return 1
  fi
}
