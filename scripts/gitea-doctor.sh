#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

state_dir="${GITEA_STATE_DIR:-/opt/anksen/gitea}"
release_dir="${GITEA_RELEASE_DIR:-}"
env_file="$state_dir/.env"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/gitea-env.sh
source "$script_dir/lib/gitea-env.sh"

[[ -n "$release_dir" && -d "$release_dir" && ! -L "$release_dir" ]] || {
  printf 'GITEA_RELEASE_DIR must name the active immutable release directory.\n' >&2
  exit 1
}
[[ -f "$env_file" && ! -L "$env_file" ]] || {
  printf 'Missing regular Gitea environment file: %s\n' "$env_file" >&2
  exit 1
}

load_gitea_env "$env_file"
compose_file="$release_dir/infrastructure/gitea/docker-compose.yml"

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
for service in database server runner; do
  container_id="$(docker compose --env-file "$env_file" -f "$compose_file" ps --status running -q "$service")"
  [[ -n "$container_id" ]] || { printf 'Gitea service is not running: %s\n' "$service" >&2; exit 1; }
done

health="$(curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${GITEA_HTTP_PORT:-4340}/api/healthz")"
node -e 'const body=JSON.parse(process.argv[1]); if (body.status!=="pass") process.exit(1)' "$health"

docker compose --env-file "$env_file" -f "$compose_file" exec -T runner \
  test -s /data/.runner || { printf 'Gitea Actions runner has no persisted registration.\n' >&2; exit 1; }

printf 'GITEA_DOCTOR=PASS release=%s services=3 runner_registration=present health=pass\n' "$(basename "$release_dir")"
