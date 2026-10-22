#!/usr/bin/env bash
# Explicit, narrow release: Console source/process only. No identity, database or capability deployment.
set -Eeuo pipefail
umask 027
[[ "${1:-}" == --commit && "${2:-}" =~ ^[0-9a-f]{40}$ && $# == 2 ]] || { echo 'Usage: deploy-console-media.sh --commit FULL_SHA' >&2; exit 2; }
release_sha="$2"
cd /opt/anksen/agent-studio
exec 9>/tmp/anksen-agent-studio-deploy.lock
flock -n 9 || { echo 'Another Studio deployment is active' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no | awk '$2 != "runtime/global/access-users.json"')" ]] || { echo 'Tracked application work is dirty' >&2; exit 1; }
previous_sha="$(git rev-parse HEAD)"
git fetch --prune origin main
[[ "$(git rev-parse origin/main)" == "$release_sha" ]] || { echo 'Remote SHA mismatch' >&2; exit 1; }
git merge --ff-only "$release_sha"
pnpm install --frozen-lockfile
pnpm typecheck
node --test packages/managed-capability-apps/test/media-workbench.test.mjs packages/orchestrator-core/test/resident-worker-broker.test.mjs
node --check apps/console/web/server.mjs
pnpm --filter @anksen/console build
sudo -n systemctl daemon-reload
sudo -n systemctl restart agent-studio-console.service
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:4317/health/version | node --input-type=module -e 'let s="";for await(const x of process.stdin)s+=x;if(JSON.parse(s).sha!==process.argv[1])process.exit(1)' "$release_sha" && curl --fail --silent --max-time 3 http://127.0.0.1:4317/login >/dev/null; then
    printf 'Console release verified previous=%s current=%s\n' "$previous_sha" "$release_sha"
    exit 0
  fi
  sleep 2
done
echo 'Console release health failed; preserve runtime data and apply documented rollback' >&2
exit 1
