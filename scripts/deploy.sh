#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

repo_dir="${ANKSEN_DEPLOY_DIR:-/opt/anksen/agent-studio}"
branch="${ANKSEN_DEPLOY_BRANCH:-main}"
expected_commit=""
health_url="${ANKSEN_HEALTH_URL:-http://127.0.0.1:4317/login}"
lock_file="${ANKSEN_DEPLOY_LOCK:-/tmp/anksen-agent-studio-deploy.lock}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      expected_commit="${2:-}"
      shift 2
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$expected_commit" || ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'A full 40-character commit SHA is required via --commit.\n' >&2
  exit 2
fi

for command_name in git pnpm node curl flock pgrep; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is missing: %s\n' "$command_name" >&2
    exit 1
  }
done

exec 9>"$lock_file"
flock -n 9 || {
  printf 'Another Agent Studio deployment is already running.\n' >&2
  exit 1
}

cd "$repo_dir"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf 'Deployment stopped: tracked files on the server are modified.\n' >&2
  git status --short
  exit 1
fi

previous_commit="$(git rev-parse HEAD)"
printf 'Deploying Agent Studio: %s -> %s\n' "$previous_commit" "$expected_commit"

git fetch --prune origin "$branch"
remote_commit="$(git rev-parse "origin/$branch")"
if [[ "$remote_commit" != "$expected_commit" ]]; then
  printf 'Deployment stopped: origin/%s is %s, expected %s.\n' "$branch" "$remote_commit" "$expected_commit" >&2
  exit 1
fi

git merge --ff-only "$expected_commit"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
pnpm --filter @anksen/console build

mapfile -t server_pids < <(pgrep -u "$(id -u)" -f "$repo_dir/apps/console/web/server.mjs" || true)
if [[ ${#server_pids[@]} -eq 0 ]]; then
  printf 'Deployment stopped: the managed Console process was not found.\n' >&2
  exit 1
fi

kill -TERM "${server_pids[@]}"

for attempt in $(seq 1 45); do
  if curl --fail --silent --show-error --max-time 3 "$health_url" >/dev/null; then
    current_commit="$(git rev-parse HEAD)"
    printf 'Deployment complete: commit=%s health=%s attempt=%s\n' "$current_commit" "$health_url" "$attempt"
    exit 0
  fi
  sleep 2
done

printf 'Deployment failed: Console did not recover at %s.\n' "$health_url" >&2
exit 1
