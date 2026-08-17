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

for command_name in git pnpm node curl flock pgrep bash; do
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

tracked_dirty="$(git status --porcelain --untracked-files=no | awk '$2 != "runtime/global/access-users.json"')"
if [[ -n "$tracked_dirty" ]]; then
  printf 'Deployment stopped: tracked files on the server are modified.\n' >&2
  printf '%s\n' "$tracked_dirty"
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
if [[ "$previous_commit" != "$expected_commit" && "${ANKSEN_DEPLOY_REEXECUTED:-false}" != "true" ]]; then
  printf 'Deployment script changed with the release; restarting from commit %s.\n' "$expected_commit"
  exec env ANKSEN_DEPLOY_REEXECUTED=true bash scripts/deploy.sh --commit "$expected_commit"
fi
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
pnpm capability-resources:sync
openmontage_repo="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openmontage").deployment.repository)')"
openmontage_commit="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openmontage").deployment.commit)')"
openmontage_root="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openmontage").deployment.root)')"
openmontage_service="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openmontage").deployment.service)')"
bash scripts/deploy-openmontage.sh --repo "$openmontage_repo" --commit "$openmontage_commit" --root "$openmontage_root" --service "$openmontage_service"
openclaw_image="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openclaw").deployment.image)')"
openclaw_version="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openclaw").deployment.version)')"
openclaw_root="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openclaw").deployment.root)')"
openclaw_service="$(node -e 'const r=require("./runtime/global/managed-capability-app-registry.json");process.stdout.write(r.apps.find(a=>a.app_id==="openclaw").deployment.service)')"
bash scripts/deploy-openclaw.sh --image "$openclaw_image" --version "$openclaw_version" --root "$openclaw_root" --service "$openclaw_service"
pnpm --filter @anksen/console build
bash scripts/deploy-business-data.sh
bash scripts/deploy-identity.sh

mapfile -t server_pids < <(pgrep -u "$(id -u)" -f "$repo_dir/apps/console/web/server.mjs" || true)
if [[ ${#server_pids[@]} -eq 0 ]]; then
  printf 'Deployment stopped: the managed Console process was not found.\n' >&2
  exit 1
fi

kill -TERM "${server_pids[@]}"

for attempt in $(seq 1 45); do
  if curl --fail --silent --show-error --max-time 3 "$health_url" >/dev/null \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4317/mcp/ready >/dev/null \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4750/api/health >/dev/null \
    && /opt/anksen/capabilities/openmontage/.venv/bin/python /opt/anksen/capabilities/openmontage/scripts/studio_bridge.py health | /opt/anksen/capabilities/openmontage/.venv/bin/python -c 'import json,sys; data=json.load(sys.stdin); assert data["ok"] and data["status"]=="READY"' \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:18789/healthz >/dev/null \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4317/.well-known/oauth-protected-resource >/dev/null; then
    current_commit="$(git rev-parse HEAD)"
    printf 'Deployment complete: commit=%s health=%s attempt=%s\n' "$current_commit" "$health_url" "$attempt"
    exit 0
  fi
  sleep 2
done

printf 'Deployment failed: Console did not recover at %s.\n' "$health_url" >&2
exit 1
