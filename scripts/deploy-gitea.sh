#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

expected_commit=""
read_env_stdin=false
state_dir="${GITEA_STATE_DIR:-/opt/anksen/gitea}"
control_dir="${GITEA_CONTROL_DIR:-/opt/anksen/gitea-control}"
repository_url="${GITEA_CONTROL_REPOSITORY:-https://github.com/ivanzhao299/anksen-agent-studio.git}"
lock_file="${GITEA_DEPLOY_LOCK:-/tmp/anksen-gitea-deploy.lock}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/gitea-env.sh
source "$script_dir/lib/gitea-env.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) expected_commit="${2:-}"; shift 2 ;;
    --env-stdin) read_env_stdin=true; shift ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'A full 40-character commit SHA is required.\n' >&2
  exit 2
}
for command_name in docker git curl flock install openssl node awk; do
  command -v "$command_name" >/dev/null || { printf 'Gitea deployment requires %s.\n' "$command_name" >&2; exit 1; }
done
docker compose version >/dev/null

exec 9>"$lock_file"
flock -n 9 || { printf 'Another Gitea deployment is already running.\n' >&2; exit 1; }

[[ ! -L "$state_dir" && ! -L "$control_dir" ]] || {
  printf 'Gitea state and control directories must not be symbolic links.\n' >&2
  exit 1
}
install -d -m 700 "$state_dir" "$state_dir/secrets" "$control_dir" "$control_dir/releases"

env_file="$state_dir/.env"
if $read_env_stdin; then
  env_tmp="$(mktemp "$state_dir/.env.XXXXXX")"
  trap 'test -z "${env_tmp:-}" || unlink "$env_tmp" 2>/dev/null || true' EXIT
  base64 --decode > "$env_tmp"
  chmod 600 "$env_tmp"
  grep -Eq '^GITEA_DOMAIN=[A-Za-z0-9.-]+$' "$env_tmp" || { printf 'Decoded Gitea environment is invalid.\n' >&2; exit 1; }
  mv "$env_tmp" "$env_file"
  env_tmp=""
fi
[[ -f "$env_file" && ! -L "$env_file" ]] || { printf 'Missing Gitea environment file: %s\n' "$env_file" >&2; exit 1; }
chmod 600 "$env_file"

load_gitea_env "$env_file"
[[ "${GITEA_STATE_DIR:-}" == "$state_dir" ]] || { printf 'GITEA_STATE_DIR must equal %s.\n' "$state_dir" >&2; exit 1; }

for secret in database-password secret-key internal-token jwt-secret runner-registration-token; do
  secret_path="$state_dir/secrets/$secret"
  if [[ ! -e "$secret_path" ]]; then openssl rand -hex 48 > "$secret_path"; fi
  [[ -f "$secret_path" && ! -L "$secret_path" ]] || { printf 'Invalid secret path: %s\n' "$secret_path" >&2; exit 1; }
  chmod 600 "$secret_path"
done

mirror="$control_dir/repository.git"
if [[ ! -d "$mirror" ]]; then git clone --bare "$repository_url" "$mirror"; fi
[[ "$(git --git-dir="$mirror" remote get-url origin)" == "$repository_url" ]] || {
  printf 'Gitea control mirror origin mismatch.\n' >&2
  exit 1
}
git --git-dir="$mirror" fetch --prune origin \
  '+refs/heads/main:refs/remotes/origin/main'
remote_commit="$(git --git-dir="$mirror" rev-parse refs/remotes/origin/main)"
[[ "$remote_commit" == "$expected_commit" ]] || {
  printf 'Gitea deployment stopped: origin/main does not match requested commit.\n' >&2
  exit 1
}

release_dir="$control_dir/releases/$expected_commit"
if [[ ! -d "$release_dir" ]]; then git --git-dir="$mirror" worktree add --detach "$release_dir" "$expected_commit"; fi
[[ -z "$(git -C "$release_dir" status --porcelain --untracked-files=all)" ]] || {
  printf 'Gitea release worktree is dirty.\n' >&2
  exit 1
}
[[ "$(git -C "$release_dir" rev-parse HEAD)" == "$expected_commit" ]] || {
  printf 'Gitea release worktree SHA mismatch.\n' >&2
  exit 1
}

compose_file="$release_dir/infrastructure/gitea/docker-compose.yml"
docker compose --env-file "$env_file" -f "$compose_file" config --quiet
docker compose --env-file "$env_file" -f "$compose_file" pull --policy missing database server
docker compose --env-file "$env_file" -f "$compose_file" up -d database server

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${GITEA_HTTP_PORT:-4340}/api/healthz" >/dev/null; then break; fi
  [[ "$attempt" != "60" ]] || { printf 'Gitea server did not become ready.\n' >&2; exit 1; }
  sleep 3
done

docker compose --env-file "$env_file" -f "$compose_file" pull --policy missing runner
docker compose --env-file "$env_file" -f "$compose_file" up -d runner
GITEA_RELEASE_DIR="$release_dir" GITEA_STATE_DIR="$state_dir" bash "$release_dir/scripts/gitea-doctor.sh"
ln -sfn "$release_dir" "$control_dir/current.next"
mv -Tf "$control_dir/current.next" "$control_dir/current"
printf 'Gitea deployment complete: commit=%s state=%s\n' "$expected_commit" "$state_dir"
