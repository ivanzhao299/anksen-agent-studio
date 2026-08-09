#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

repo_url=""
commit_sha=""
app_root="/opt/anksen/capabilities/openmontage"
service_name="anksen-openmontage-backlot"
port=4750

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo_url="${2:-}"; shift 2 ;;
    --commit) commit_sha="${2:-}"; shift 2 ;;
    --root) app_root="${2:-}"; shift 2 ;;
    --service) service_name="${2:-}"; shift 2 ;;
    --port) port="${2:-}"; shift 2 ;;
    *) printf 'Unknown OpenMontage deployment argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ "$repo_url" =~ ^https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]] || { echo "A pinned GitHub repository URL is required." >&2; exit 2; }
[[ "$commit_sha" =~ ^[a-f0-9]{40}$ ]] || { echo "A full OpenMontage commit SHA is required." >&2; exit 2; }
[[ "$app_root" == /opt/anksen/capabilities/* ]] || { echo "OpenMontage root must stay below /opt/anksen/capabilities." >&2; exit 2; }
[[ "$service_name" =~ ^[a-z0-9-]+$ ]] || { echo "Invalid OpenMontage service name." >&2; exit 2; }
[[ "$port" =~ ^[0-9]{4,5}$ ]] || { echo "Invalid OpenMontage port." >&2; exit 2; }

for command_name in git python3 node npm curl sudo systemctl; do
  command -v "$command_name" >/dev/null || { printf 'OpenMontage prerequisite missing: %s\n' "$command_name" >&2; exit 1; }
done
python3 -c 'import sys; assert sys.version_info >= (3, 11), "OpenMontage requires Python 3.11+"'
node -e 'const major=Number(process.versions.node.split(".")[0]);if(major<22)throw new Error("OpenMontage Remotion requires Node.js 22+")'
sudo -n true

apt_updated=false
install_apt_package() {
  local package_name="$1"
  command -v apt-get >/dev/null || { printf 'Required system package is missing and apt-get is unavailable: %s\n' "$package_name" >&2; exit 1; }
  if [[ "$apt_updated" != true ]]; then
    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update
    apt_updated=true
  fi
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$package_name"
}

command -v ffmpeg >/dev/null || install_apt_package ffmpeg
if ! dpkg-query -W -f='${Status}' python3-venv 2>/dev/null | grep -q 'install ok installed'; then
  install_apt_package python3-venv
fi

sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$(dirname "$app_root")"
if [[ ! -d "$app_root/.git" ]]; then
  git clone --no-checkout "$repo_url" "$app_root"
fi
[[ "$(git -C "$app_root" remote get-url origin)" == "$repo_url" ]] || { echo "OpenMontage remote mismatch." >&2; exit 1; }
if git -C "$app_root" rev-parse --verify HEAD >/dev/null 2>&1; then
  [[ -z "$(git -C "$app_root" status --porcelain --untracked-files=no)" ]] || { echo "OpenMontage tracked files are dirty; refusing deployment." >&2; exit 1; }
fi
git -C "$app_root" fetch --prune origin "$commit_sha"
git -C "$app_root" cat-file -e "${commit_sha}^{commit}"
git -C "$app_root" checkout --detach "$commit_sha"
[[ "$(git -C "$app_root" rev-parse HEAD)" == "$commit_sha" ]]

marker="$app_root/.studio-installed-commit"
if [[ ! -f "$marker" || "$(cat "$marker")" != "$commit_sha" ]]; then
  [[ -d "$app_root/.venv" ]] || python3 -m venv "$app_root/.venv"
  "$app_root/.venv/bin/python" -m pip install --disable-pip-version-check -r "$app_root/requirements.txt"
  npm --prefix "$app_root/remotion-composer" ci --no-audit --no-fund
  if [[ ! -f "$app_root/.env" ]]; then
    install -m 0600 "$app_root/.env.example" "$app_root/.env"
  fi
  printf '%s\n' "$commit_sha" > "$marker"
fi
install -d -m 0750 "$app_root/projects" "$app_root/.backlot"

sudo tee "/etc/systemd/system/${service_name}.service" >/dev/null <<EOF
[Unit]
Description=ANKSEN Independent OpenMontage Backlot
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$(id -un)
Group=$(id -gn)
WorkingDirectory=$app_root
Environment=BACKLOT_PORT=$port
ExecStart=$app_root/.venv/bin/python -m backlot serve --port $port
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$app_root/projects $app_root/.backlot
UMask=0027
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$service_name" >/dev/null
sudo systemctl restart "$service_name"
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${port}/api/health" >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${port}/api/health" >/dev/null
"$app_root/.venv/bin/python" "$app_root/scripts/studio_bridge.py" health | "$app_root/.venv/bin/python" -c 'import json,sys; data=json.load(sys.stdin); assert data["ok"] and data["status"]=="READY"'
sudo systemctl is-active --quiet "$service_name"
printf 'OPENMONTAGE_DEPLOYMENT=PASS commit=%s root=%s service=%s\n' "$commit_sha" "$app_root" "$service_name"
