#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image=""
version=""
app_root="/opt/anksen/capabilities/openclaw"
container_name="anksen-openclaw-gateway"
port=18789
lock_file="/tmp/anksen-openclaw-deploy.lock"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) image="${2:-}"; shift 2 ;;
    --version) version="${2:-}"; shift 2 ;;
    --root) app_root="${2:-}"; shift 2 ;;
    --service) container_name="${2:-}"; shift 2 ;;
    --port) port="${2:-}"; shift 2 ;;
    *) printf 'Unknown OpenClaw deployment argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ "$image" =~ ^ghcr\.io/openclaw/openclaw@sha256:[a-f0-9]{64}$ ]] || { echo "OpenClaw must use the official GHCR image pinned by digest." >&2; exit 2; }
[[ "$version" =~ ^[0-9]{4}\.[0-9]+\.[0-9]+-[0-9]+$ ]] || { echo "A pinned OpenClaw version is required." >&2; exit 2; }
[[ "$app_root" == /opt/anksen/capabilities/openclaw ]] || { echo "OpenClaw root must be /opt/anksen/capabilities/openclaw." >&2; exit 2; }
[[ "$container_name" == "anksen-openclaw-gateway" ]] || { echo "Unexpected OpenClaw container name." >&2; exit 2; }
[[ "$port" == "18789" ]] || { echo "OpenClaw gateway port must remain 18789." >&2; exit 2; }

for command_name in curl flock openssl python3 sudo systemctl timeout; do
  command -v "$command_name" >/dev/null || { printf 'OpenClaw prerequisite missing: %s\n' "$command_name" >&2; exit 1; }
done
sudo -n true

apt_updated=false
install_apt_package() {
  local package_name="$1"
  command -v apt-get >/dev/null || { printf 'Required package is missing and apt-get is unavailable: %s\n' "$package_name" >&2; exit 1; }
  if [[ "$apt_updated" != true ]]; then
    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update
    apt_updated=true
  fi
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$package_name"
}

if ! command -v docker >/dev/null; then
  install_apt_package docker.io
  sudo -n systemctl enable --now docker
fi

docker_command=(docker)
if ! docker info >/dev/null 2>&1; then
  if ! sudo -n docker info >/dev/null 2>&1; then
    sudo -n systemctl start docker
  fi
  sudo -n docker info >/dev/null
  docker_command=(sudo -n docker)
fi
if ! "${docker_command[@]}" compose version >/dev/null 2>&1; then
  if ! install_apt_package docker-compose-v2; then
    install_apt_package docker-compose-plugin
  fi
fi
"${docker_command[@]}" compose version >/dev/null

exec 9>"$lock_file"
flock -n 9 || { echo "Another OpenClaw deployment is already running." >&2; exit 1; }

memory_kib="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
disk_kib="$(df -Pk /opt | awk 'NR==2 {print $4}')"
(( memory_kib >= 1900000 )) || { echo "OpenClaw deployment requires at least 2 GB total RAM." >&2; exit 1; }
(( disk_kib >= 4194304 )) || { echo "OpenClaw deployment requires at least 4 GB free under /opt." >&2; exit 1; }

os_name="$(. /etc/os-release && printf '%s' "$PRETTY_NAME")"
printf 'OPENCLAW_SERVER_INVENTORY hostname=%s os=%q arch=%s cpu=%s memory_mib=%s disk_free_mib=%s docker=%s compose=%s\n' \
  "$(hostname)" "$os_name" "$(uname -m)" "$(nproc)" "$((memory_kib / 1024))" "$((disk_kib / 1024))" \
  "$("${docker_command[@]}" version --format '{{.Server.Version}}')" "$("${docker_command[@]}" compose version --short)"
if command -v ss >/dev/null; then
  ss -lntH | awk '$4 ~ /:(4317|4750|18789)$/ {print "OPENCLAW_RELEVANT_LISTENER=" $4}'
fi
"${docker_command[@]}" ps --filter label=com.anksen.capability=openclaw --format 'OPENCLAW_EXISTING_CONTAINER={{.Names}} status={{.Status}} ports={{.Ports}}'

deploy_user="$(id -un)"
deploy_group="$(id -gn)"
sudo install -d -m 0700 -o "$deploy_user" -g "$deploy_group" "$app_root"
sudo install -d -m 0700 "$app_root/state" "$app_root/workspace"
sudo chown -R 1000:1000 "$app_root/state" "$app_root/workspace"

env_file="$app_root/.env"
if [[ ! -f "$env_file" ]]; then
  token="$(openssl rand -hex 32)"
  printf 'OPENCLAW_GATEWAY_TOKEN=%s\n' "$token" > "$env_file"
  chmod 0600 "$env_file"
fi
grep -Eq '^OPENCLAW_GATEWAY_TOKEN=[a-f0-9]{64}$' "$env_file" || { echo "Existing OpenClaw token file is invalid; refusing to overwrite it." >&2; exit 1; }

config_file="$app_root/state/openclaw.json"
config_baseline="$(mktemp)"
cat > "$config_baseline" <<'JSON'
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token",
      "rateLimit": { "maxAttempts": 10, "windowMs": 60000, "lockoutMs": 300000 }
    },
    "controlUi": {
      "allowedOrigins": ["http://127.0.0.1:18789", "http://localhost:18789"]
    }
  },
  "session": { "dmScope": "per-channel-peer" },
  "agents": { "defaults": { "sandbox": { "mode": "off" } } },
  "tools": {
    "profile": "messaging",
    "deny": ["gateway", "cron", "sessions_spawn", "sessions_send", "browser"],
    "exec": { "security": "deny", "ask": "always" },
    "elevated": { "enabled": false }
  },
  "browser": { "enabled": false }
}
JSON
python3 -m json.tool "$config_baseline" >/dev/null
config_merged="$(mktemp)"
sudo -n python3 - "$config_file" "$config_baseline" "$config_merged" <<'PY'
import json, os, sys

target, baseline_path, output = sys.argv[1:]
current = {}
if os.path.exists(target):
    with open(target, encoding="utf-8") as handle:
        current = json.load(handle)
with open(baseline_path, encoding="utf-8") as handle:
    baseline = json.load(handle)

def merge(destination, source):
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(destination.get(key), dict):
            merge(destination[key], value)
        else:
            destination[key] = value

merge(current, baseline)
with open(output, "w", encoding="utf-8") as handle:
    json.dump(current, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
sudo install -m 0600 -o 1000 -g 1000 "$config_merged" "$config_file"
rm -f "$config_baseline" "$config_merged"
sudo -n python3 -m json.tool "$config_file" >/dev/null

compose_file="$app_root/compose.yaml"
compose_tmp="$(mktemp)"
cat > "$compose_tmp" <<YAML
services:
  openclaw-gateway:
    image: ${image}
    container_name: ${container_name}
    restart: unless-stopped
    init: true
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    pids_limit: 256
    mem_limit: 2g
    cpus: 2.0
    env_file:
      - .env
    environment:
      HOME: /home/node
      NODE_ENV: production
    command: ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
    ports:
      - "127.0.0.1:${port}:18789"
    volumes:
      - ./state:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=256m
      - /home/node/.cache:rw,noexec,nosuid,size=256m
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:18789/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 12
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"
    labels:
      com.anksen.capability: openclaw
      com.anksen.boundary: independent-managed-app
YAML
"${docker_command[@]}" compose --env-file "$env_file" -f "$compose_tmp" config --quiet
install -m 0600 "$compose_tmp" "$compose_file"
rm -f "$compose_tmp"

"${docker_command[@]}" compose --env-file "$env_file" -f "$compose_file" pull
"${docker_command[@]}" compose --env-file "$env_file" -f "$compose_file" run --rm --no-deps --entrypoint node openclaw-gateway dist/index.js config validate >/dev/null
"${docker_command[@]}" compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans

healthy=false
for _ in $(seq 1 60); do
  status="$("${docker_command[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]] && curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${port}/healthz" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  "${docker_command[@]}" logs --tail 120 "$container_name" >&2 || true
  echo "OpenClaw gateway did not become healthy." >&2
  exit 1
fi

running_image="$("${docker_command[@]}" inspect --format '{{.Config.Image}}' "$container_name")"
[[ "$running_image" == "$image" ]] || { printf 'OpenClaw image mismatch: %s\n' "$running_image" >&2; exit 1; }
"${docker_command[@]}" exec "$container_name" node dist/index.js health >/dev/null

doctor_log="$(mktemp)"
if ! timeout 90 "${docker_command[@]}" exec "$container_name" node dist/index.js doctor --non-interactive >"$doctor_log" 2>&1; then
  sed -n '1,160p' "$doctor_log" >&2
  rm -f "$doctor_log"
  echo "OpenClaw doctor failed." >&2
  exit 1
fi
rm -f "$doctor_log"

audit_file="$app_root/security-audit.json"
audit_tmp="$(mktemp)"
if ! "${docker_command[@]}" exec "$container_name" node dist/index.js security audit --json > "$audit_tmp"; then
  rm -f "$audit_tmp"
  echo "OpenClaw security audit command failed." >&2
  exit 1
fi
python3 - "$audit_tmp" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
summary = data.get("summary") or {}
critical = int(summary.get("critical", 0))
print("OPENCLAW_SECURITY_AUDIT critical=%s warn=%s info=%s" % (critical, summary.get("warn", 0), summary.get("info", 0)))
if critical:
    raise SystemExit("OpenClaw security audit reported critical findings")
PY
install -m 0600 "$audit_tmp" "$audit_file"
rm -f "$audit_tmp"

manifest_tmp="$(mktemp)"
python3 - "$manifest_tmp" "$version" "$image" "$container_name" <<'PY'
import json, sys
from datetime import datetime, timezone
path, version, image, service = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "schema_version": 1,
        "app_id": "openclaw",
        "version": version,
        "image": image,
        "service": service,
        "gateway": "http://127.0.0.1:18789",
        "access": "SERVER_LOOPBACK_OR_SSH_TUNNEL",
        "model_provider_configured": False,
        "channels_configured": False,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
install -m 0644 "$manifest_tmp" "$app_root/deployment.json"
rm -f "$manifest_tmp"

printf 'OPENCLAW_DEPLOYMENT=PASS version=%s image=%s bind=127.0.0.1:%s onboarding=REQUIRED\n' "$version" "$image" "$port"
