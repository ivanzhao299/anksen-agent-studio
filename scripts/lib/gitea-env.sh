#!/usr/bin/env bash

load_gitea_env() {
  local env_file="${1:?environment file is required}"
  local line key value line_number=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || { printf 'Invalid Gitea environment line %s.\n' "$line_number" >&2; return 1; }
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      GITEA_DOMAIN|GITEA_HTTP_PORT|GITEA_SSH_DOMAIN|GITEA_SSH_BIND_ADDRESS|GITEA_SSH_PORT|GITEA_RUNNER_NAME|GITEA_RUNNER_LABELS|GITEA_RUNNER_INSTANCE_URL|GITEA_STATE_DIR) ;;
      *) printf 'Unsupported Gitea environment key on line %s: %s\n' "$line_number" "$key" >&2; return 1 ;;
    esac
    [[ "$value" =~ ^[A-Za-z0-9_./:,@+-]+$ ]] || {
      printf 'Unsafe Gitea environment value on line %s.\n' "$line_number" >&2
      return 1
    }
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$env_file"
  [[ "${GITEA_DOMAIN:-}" =~ ^[A-Za-z0-9.-]+$ ]] || { printf 'GITEA_DOMAIN is invalid.\n' >&2; return 1; }
  [[ "${GITEA_STATE_DIR:-}" == /* ]] || { printf 'GITEA_STATE_DIR must be absolute.\n' >&2; return 1; }
}
