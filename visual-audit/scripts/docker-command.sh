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
