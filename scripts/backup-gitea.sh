#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

state_dir="${GITEA_STATE_DIR:-/opt/anksen/gitea}"
release_dir="${GITEA_RELEASE_DIR:-/opt/anksen/gitea-control/current}"
backup_root="${GITEA_BACKUP_DIR:-/opt/anksen/backups/gitea}"
env_file="$state_dir/.env"
compose_file="$release_dir/infrastructure/gitea/docker-compose.yml"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$timestamp"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/gitea-env.sh
source "$script_dir/lib/gitea-env.sh"

for command_name in docker install sha256sum; do
  command -v "$command_name" >/dev/null || { printf 'Gitea backup requires %s.\n' "$command_name" >&2; exit 1; }
done
[[ -f "$env_file" && ! -L "$env_file" ]] || { printf 'Missing Gitea environment file.\n' >&2; exit 1; }
[[ -f "$compose_file" && ! -L "$release_dir" ]] || { printf 'Missing active Gitea release.\n' >&2; exit 1; }

install -d -m 700 "$target"
load_gitea_env "$env_file"

# A consistent backup requires a brief Gitea application stop. PostgreSQL stays
# online for pg_dump, while no repository writes can race with the database dump.
docker compose --env-file "$env_file" -f "$compose_file" stop runner server
restart_required=true
trap 'if ${restart_required:-false}; then docker compose --env-file "$env_file" -f "$compose_file" up -d server runner >/dev/null 2>&1 || true; fi' EXIT

docker compose --env-file "$env_file" -f "$compose_file" exec -T database \
  pg_dump --format=custom --username=gitea --dbname=gitea > "$target/database.dump"
docker run --rm \
  -v anksen-gitea_gitea-data:/source:ro \
  -v "$target:/backup" \
  alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f tar -C /source -czf /backup/gitea-data.tar.gz .
docker run --rm \
  -v anksen-gitea_gitea-config:/source:ro \
  -v "$target:/backup" \
  alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f tar -C /source -czf /backup/gitea-config.tar.gz .

(cd "$target" && sha256sum database.dump gitea-data.tar.gz gitea-config.tar.gz > SHA256SUMS)
chmod 600 "$target"/*
docker compose --env-file "$env_file" -f "$compose_file" up -d server runner
restart_required=false
printf 'Gitea backup complete: %s\n' "$target"
