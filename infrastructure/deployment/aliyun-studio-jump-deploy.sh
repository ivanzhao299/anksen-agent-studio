#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

office_host="${ANKSEN_OFFICE_HOST:-192.168.2.204}"
office_user="${ANKSEN_OFFICE_USER:-ubuntu}"
office_key="${ANKSEN_OFFICE_KEY:-/root/.ssh/anksen-office-deploy}"
office_repo="${ANKSEN_OFFICE_REPO:-/opt/anksen/agent-studio}"
bootstrap_script="${ANKSEN_BOOTSTRAP_SCRIPT:-/opt/anksen/deploy-bootstrap/agent-studio-deploy.sh}"
gitea_bootstrap_script="${ANKSEN_GITEA_BOOTSTRAP_SCRIPT:-/opt/anksen/deploy-bootstrap/gitea/deploy-gitea.sh}"

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
elif [[ "$action" == "kingturf-erp" && "$argument" == "deploy" && "$commit_sha" =~ ^[0-9a-f]{40}$ && -z "${unexpected:-}" ]]; then
  printf -v remote_command 'cd %q && exec bash scripts/deploy-kingturf-erp.sh --commit %q --archive-stdin' "$office_repo" "$commit_sha"
elif [[ "$action" == "gitea" && "$argument" == "deploy" && "$commit_sha" =~ ^[0-9a-f]{40}$ && -z "${unexpected:-}" ]]; then
  printf -v remote_command \
    'if [ -x /opt/anksen/gitea-control/current/scripts/deploy-gitea.sh ]; then exec bash /opt/anksen/gitea-control/current/scripts/deploy-gitea.sh --commit %q --env-stdin; else exec bash %q --commit %q --env-stdin; fi' \
    "$commit_sha" "$gitea_bootstrap_script" "$commit_sha"
elif [[ "$action" == "gitea" && "$argument" == "probe" && -z "${commit_sha:-}" ]]; then
  printf -v remote_command \
    'release=/opt/anksen/gitea-control/current; test -d "$release" && exec env GITEA_RELEASE_DIR="$release" GITEA_STATE_DIR=/opt/anksen/gitea bash "$release/scripts/gitea-doctor.sh"'
elif [[ "$action" == "gitea" && "$argument" == "create-admin" && -z "${commit_sha:-}" ]]; then
  printf -v remote_command \
    'release=/opt/anksen/gitea-control/current; test -d "$release" && exec env GITEA_RELEASE_DIR="$release" GITEA_STATE_DIR=/opt/anksen/gitea bash "$release/scripts/gitea-create-admin.sh"'
elif [[ "$action" == "gitea" && "$argument" == "backup" && -z "${commit_sha:-}" ]]; then
  printf -v remote_command \
    'release=/opt/anksen/gitea-control/current; test -d "$release" && exec env GITEA_RELEASE_DIR="$release" GITEA_STATE_DIR=/opt/anksen/gitea bash "$release/scripts/backup-gitea.sh"'
else
  printf 'Rejected: allowed commands are deploy SHA, phoenix-runner probe/deploy SHA, kingturf-erp deploy SHA, or gitea deploy SHA/probe/create-admin/backup.\n' >&2
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
