#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

runner_root=/opt/phoenix-runner
repo=ivanzhao299/phoenix-erp-v3
commit=""
probe=false
env_stdin=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --probe) probe=true; shift ;;
    --commit) commit="${2:-}"; shift 2 ;;
    --env-stdin) env_stdin=true; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

for cmd in git node corepack gh codex systemctl sudo curl; do
  command -v "$cmd" >/dev/null || { echo "MISSING=$cmd" >&2; exit 1; }
done
sudo -n true
gh auth status >/dev/null
codex --version >/dev/null
for endpoint in https://github.com https://erp.eggslao.com/api/health https://api.openai.com; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$endpoint")"
  [[ "$status" != 000 ]] || { echo "UNREACHABLE=$endpoint" >&2; exit 1; }
done
echo "PHOENIX_RUNNER_PREREQUISITES=PASS"

if $probe; then
  echo "HOST=$(hostname) USER=$(id -un)"
  echo "NODE_BIN=$(command -v node)"
  echo "CODEX_BIN=$(command -v codex)"
  df -h /opt
  free -h
  sudo systemctl is-enabled --quiet phoenix-bug-intake-runner
  sudo systemctl is-active --quiet phoenix-bug-intake-runner
  echo "PHOENIX_RUNNER_SERVICE=ACTIVE"
  state_repo="$runner_root/state"
  code_repo="$runner_root/code"
  [[ -d "$state_repo/.git" && -e "$code_repo/.git" ]]
  git -C "$state_repo" fetch origin main --quiet
  state_sha="$(git -C "$state_repo" rev-parse HEAD)"
  code_sha="$(git -C "$code_repo" rev-parse HEAD)"
  origin_sha="$(git -C "$state_repo" rev-parse origin/main)"
  echo "PHOENIX_RUNNER_STATE_SHA=$state_sha"
  echo "PHOENIX_RUNNER_CODE_SHA=$code_sha"
  echo "PHOENIX_RUNNER_ORIGIN_SHA=$origin_sha"
  [[ "$state_sha" == "$origin_sha" && "$code_sha" == "$origin_sha" ]]
  main_pid="$(sudo systemctl show phoenix-bug-intake-runner -p MainPID --value)"
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]
  runner_command="$(tr '\0' ' ' < "/proc/$main_pid/cmdline")"
  for required_arg in \
    '--watch' '--parallel-workers 3' '--wake-file' \
    '--apply-queue' '--execute-approved' \
    '--auto-recover-generation-drift' '--auto-unblock-dirty-worktrees' \
    '--skip-blocked' '--commit-audit-artifacts' '--audit-commit-minutes 30' \
    '--push-after-success' '--wait-ci-after-push' '--deploy-after-ci' \
    '--production-smoke-after-ci'; do
    [[ "$runner_command" == *"$required_arg"* ]] || {
      echo "PHOENIX_RUNNER_CAPABILITY_MISSING=$required_arg" >&2
      exit 1
    }
  done
  echo "PHOENIX_RUNNER_FULL_AUTOMATION_GATE=PASS"
  exit 0
fi
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "full commit SHA required" >&2; exit 2; }
$env_stdin || { echo "--env-stdin is required" >&2; exit 2; }
env_b64="$(cat)"
[[ -n "$env_b64" ]] || { echo "runner environment payload is empty" >&2; exit 2; }

sudo install -d -m 0750 -o ubuntu -g ubuntu "$runner_root" "$runner_root/config"
if [[ ! -d "$runner_root/state/.git" ]]; then
  gh repo clone "$repo" "$runner_root/state"
fi
if [[ -d "$runner_root/code" ]] && [[ -n "$(git -C "$runner_root/code" status --porcelain)" ]]; then
  echo "runner code worktree is dirty; refusing deployment" >&2
  exit 1
fi
while IFS= read -r dirty_entry; do
  [[ -z "$dirty_entry" ]] && continue
  dirty_path="${dirty_entry:3}"
  dirty_path="${dirty_path##* -> }"
  [[ "$dirty_path" == docs/ops/* ]] || {
    echo "runner state has non-audit changes: $dirty_path" >&2
    exit 1
  }
done < <(git -C "$runner_root/state" status --porcelain --untracked-files=all)
git -C "$runner_root/state" fetch origin main
[[ "$(git -C "$runner_root/state" rev-parse origin/main)" == "$commit" ]]
git -C "$runner_root/state" checkout main
git -C "$runner_root/state" merge --ff-only "$commit"
env_tmp="$(mktemp)"
trap 'rm -f "$env_tmp"' EXIT
printf '%s' "$env_b64" | base64 --decode > "$env_tmp"
for required in PHOENIX_ERP_RUNNER_USER PHOENIX_ERP_RUNNER_PASS PHOENIX_ERP_RUNNER_API_BASE; do
  grep -Eq "^${required}=.+$" "$env_tmp" || { echo "missing runner setting: $required" >&2; exit 1; }
done
sudo tee "$runner_root/config/bug-intake-runner.env" < "$env_tmp" >/dev/null
sudo chown ubuntu:ubuntu "$runner_root/config/bug-intake-runner.env"
sudo chmod 600 "$runner_root/config/bug-intake-runner.env"
sudo PHOENIX_RUNNER_USER=ubuntu PHOENIX_RUNNER_ROOT="$runner_root" \
  bash "$runner_root/state/scripts/ops/install-bug-intake-runner-systemd.sh"
sudo systemctl restart phoenix-bug-intake-runner
for _ in {1..20}; do
  if sudo systemctl is-active --quiet phoenix-bug-intake-runner; then
    echo "PHOENIX_RUNNER_SERVICE=ACTIVE"
    break
  fi
  sleep 1
done
sudo systemctl is-active --quiet phoenix-bug-intake-runner
echo "PHOENIX_RUNNER_INSTALLED=$commit"
