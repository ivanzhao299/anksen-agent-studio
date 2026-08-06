#!/usr/bin/env bash
set -euo pipefail

RUNNER_USER="${ANKSEN_RUNNER_USER:-anksen-runner}"
STUDIO_ROOT="${ANKSEN_STUDIO_ROOT:-/srv/agent-studio}"
PROJECT_ROOT="${SMART_PARK_MANAGED_ROOT:-/srv/managed-projects/jinhu-smart-park}"
CONFIG_ROOT="${ANKSEN_RUNNER_CONFIG_ROOT:-/etc/anksen-runner}"
RUNTIME_ROOT="${ANKSEN_RUNNER_RUNTIME_ROOT:-/srv/agent-studio-runtime}"
SERVICE_NAME="anksen-smart-park-runner"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root" >&2; exit 1; fi
for command in git node pnpm codex systemctl; do command -v "$command" >/dev/null || { echo "missing prerequisite: $command" >&2; exit 1; }; done

id "$RUNNER_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUNNER_USER"
install -d -m 0750 -o "$RUNNER_USER" -g "$RUNNER_USER" "$STUDIO_ROOT" "$RUNTIME_ROOT" "$PROJECT_ROOT" "$PROJECT_ROOT/worktrees"
install -d -m 0700 -o root -g "$RUNNER_USER" "$CONFIG_ROOT"

install_repo() {
  local target="$1" remote="$2" key="$3"
  install -d -m 0700 -o "$RUNNER_USER" -g "$RUNNER_USER" "/home/$RUNNER_USER/.ssh"
  install -m 0600 -o "$RUNNER_USER" -g "$RUNNER_USER" "$key" "/home/$RUNNER_USER/.ssh/$(basename "$key")"
  if [ ! -d "$target/.git" ]; then
    sudo -u "$RUNNER_USER" -H env GIT_SSH_COMMAND="ssh -i /home/$RUNNER_USER/.ssh/$(basename "$key") -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git clone "$remote" "$target"
  fi
  sudo -u "$RUNNER_USER" -H env GIT_SSH_COMMAND="ssh -i /home/$RUNNER_USER/.ssh/$(basename "$key") -o IdentitiesOnly=yes" git -C "$target" fetch origin main
  test -z "$(git -C "$target" status --porcelain)" || { echo "dirty managed state repository: $target" >&2; exit 75; }
  sudo -u "$RUNNER_USER" -H git -C "$target" checkout main
  sudo -u "$RUNNER_USER" -H git -C "$target" merge --ff-only origin/main
}

: "${STUDIO_DEPLOY_KEY_FILE:?STUDIO_DEPLOY_KEY_FILE is required}"
: "${SMART_PARK_DEPLOY_KEY_FILE:?SMART_PARK_DEPLOY_KEY_FILE is required}"
install_repo "$STUDIO_ROOT" "git@github.com:ivanzhao299/anksen-agent-studio.git" "$STUDIO_DEPLOY_KEY_FILE"
install_repo "$PROJECT_ROOT/state" "git@github.com:ivanzhao299/jinhu-smart-park.git" "$SMART_PARK_DEPLOY_KEY_FILE"

sudo -u "$RUNNER_USER" -H bash -lc "cd '$STUDIO_ROOT' && pnpm install --frozen-lockfile"

ENV_FILE="$CONFIG_ROOT/smart-park-runner.env"
if [ ! -f "$ENV_FILE" ]; then
  install -m 0640 -o root -g "$RUNNER_USER" /dev/null "$ENV_FILE"
  printf '%s\n' \
    'SMART_PARK_ISSUE_API_URL=https://park.cnjinhu.com/api/v1' \
    'SMART_PARK_RUNNER_USER=' \
    'SMART_PARK_RUNNER_PASSWORD=' \
    'SMART_PARK_TENANT_ID=10000001' \
    'SMART_PARK_PARK_ID=20000001' \
    "SMART_PARK_PROJECT_ROOT=$PROJECT_ROOT/state" \
    "SMART_PARK_WORKTREE_ROOT=$PROJECT_ROOT/worktrees" \
    'SMART_PARK_ALLOWED_PATHS=apps,packages,database,scripts,docs' \
    'SMART_PARK_ACCEPTANCE_COMMANDS=pnpm lint,pnpm typecheck,pnpm test:unit,pnpm build' \
    'SMART_PARK_AUTO_RELEASE=false' \
    'SMART_PARK_GITHUB_REPOSITORY=ivanzhao299/jinhu-smart-park' \
    'SMART_PARK_PRODUCTION_HEALTH_URL=https://park.cnjinhu.com/api/v1/health' \
    > "$ENV_FILE"
fi
chown root:"$RUNNER_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

install -m 0750 -o root -g "$RUNNER_USER" /dev/null "$RUNTIME_ROOT/run-smart-park-runner.sh"
printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' \
  'set -a; source /etc/anksen-runner/smart-park-runner.env; set +a' \
  "export HOME=/home/$RUNNER_USER" \
  "export CODEX_HOME=/home/$RUNNER_USER/.codex" \
  "studio_ssh='ssh -i /home/$RUNNER_USER/.ssh/$(basename "$STUDIO_DEPLOY_KEY_FILE") -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'" \
  "smart_ssh='ssh -i /home/$RUNNER_USER/.ssh/$(basename "$SMART_PARK_DEPLOY_KEY_FILE") -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'" \
  "test -z \"\$(git -C '$STUDIO_ROOT' status --porcelain)\"" \
  "GIT_SSH_COMMAND=\"\$studio_ssh\" git -C '$STUDIO_ROOT' fetch origin main --quiet" \
  "git -C '$STUDIO_ROOT' merge --ff-only origin/main" \
  "test -z \"\$(git -C '$PROJECT_ROOT/state' status --porcelain)\"" \
  "GIT_SSH_COMMAND=\"\$smart_ssh\" git -C '$PROJECT_ROOT/state' fetch origin main --quiet" \
  "git -C '$PROJECT_ROOT/state' merge --ff-only origin/main" \
  "export GIT_SSH_COMMAND='ssh -i /home/$RUNNER_USER/.ssh/$(basename "$SMART_PARK_DEPLOY_KEY_FILE") -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'" \
  "exec $(command -v node) $STUDIO_ROOT/packages/orchestrator-core/bin/autonomous-development-worker.mjs" \
  > "$RUNTIME_ROOT/run-smart-park-runner.sh"

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=ANKSEN Studio Smart Park Managed Issue Runner
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=$RUNNER_USER
Group=$RUNNER_USER
WorkingDirectory=$STUDIO_ROOT
ExecStart=$RUNTIME_ROOT/run-smart-park-runner.sh
Restart=always
RestartSec=20
RuntimeMaxSec=21600
TimeoutStopSec=90
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$STUDIO_ROOT/runtime $RUNTIME_ROOT $PROJECT_ROOT /home/$RUNNER_USER/.cache /home/$RUNNER_USER/.codex /home/$RUNNER_USER/.config /home/$RUNNER_USER/.local
UMask=0077
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
echo "Installed $SERVICE_NAME. Configure $ENV_FILE, run the read-only doctor, then set SMART_PARK_AUTO_RELEASE=true and start."
