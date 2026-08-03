#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

office_host="${ANKSEN_OFFICE_HOST:-192.168.2.204}"
office_user="${ANKSEN_OFFICE_USER:-ubuntu}"
office_key="${ANKSEN_OFFICE_KEY:-/root/.ssh/anksen-office-deploy}"
office_repo="${ANKSEN_OFFICE_REPO:-/opt/anksen/agent-studio}"
bootstrap_script="${ANKSEN_BOOTSTRAP_SCRIPT:-/opt/anksen/deploy-bootstrap/agent-studio-deploy.sh}"

read -r action argument commit_sha unexpected <<< "${SSH_ORIGINAL_COMMAND:-}"

if [[ "$action" == "deploy" ]]; then
  commit_sha="$argument"
  if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ || -n "${unexpected:-}" ]]; then
    printf 'Rejected: expected deploy followed by one full commit SHA.\n' >&2
    exit 64
  fi
  printf -v remote_command \
    'cd %q && if [ -x scripts/deploy.sh ]; then exec bash scripts/deploy.sh --commit %q; else exec bash %q --commit %q; fi' \
    "$office_repo" "$commit_sha" "$bootstrap_script" "$commit_sha"
elif [[ "$action" == "phoenix-runner" && "$argument" == "probe" && -z "${commit_sha:-}" ]]; then
  printf -v remote_command 'cd %q && exec bash scripts/deploy-phoenix-runner.sh --probe' "$office_repo"
elif [[ "$action" == "phoenix-runner" && "$argument" == "deploy" && "$commit_sha" =~ ^[0-9a-f]{40}$ && -z "${unexpected:-}" ]]; then
  printf -v remote_command 'cd %q && exec bash scripts/deploy-phoenix-runner.sh --commit %q --env-stdin' "$office_repo" "$commit_sha"
else
  printf 'Rejected: allowed commands are deploy SHA, phoenix-runner probe, or phoenix-runner deploy SHA.\n' >&2
  exit 64
fi

exec ssh \
  -i "$office_key" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=4 \
  "$office_user@$office_host" \
  "$remote_command"
