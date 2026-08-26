#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

repo_dir="${ANKSEN_DEPLOY_DIR:-/opt/anksen/agent-studio}"
data_dir="${ANKSEN_BUSINESS_DATA_DIR:-/opt/anksen/business-data}"
compose_file="$repo_dir/infrastructure/business-data/docker-compose.yml"
business_db_port="${BUSINESS_DB_PORT:-54330}"
data_env="$data_dir/.env"
database_url_file="$data_dir/database-url"

for command_name in docker openssl install node; do
  command -v "$command_name" >/dev/null || { printf 'Business data deployment requires %s.\n' "$command_name" >&2; exit 1; }
done
docker compose version >/dev/null

if [[ -L "$data_dir" ]]; then
  printf 'Business data directory must not be a symbolic link.\n' >&2
  exit 1
fi
install -d -m 700 "$data_dir"
if [[ -L "$data_env" || -L "$database_url_file" ]]; then
  printf 'Business database credential files must not be symbolic links.\n' >&2
  exit 1
fi
if [[ ! -f "$data_env" ]]; then
  db_password="$(openssl rand -hex 32)"
  printf 'BUSINESS_DB_PASSWORD=%s\n' "$db_password" > "$data_env"
  chmod 600 "$data_env"
fi

set -a
source "$data_env"
set +a
printf 'postgresql://anksen_business:%s@127.0.0.1:%s/anksen_studio_business\n' "$BUSINESS_DB_PASSWORD" "$business_db_port" > "$database_url_file"
chmod 600 "$database_url_file"

if ss -lnt "sport = :$business_db_port" | tail -n +2 | grep -q . && \
  [[ -z "$(docker compose --env-file "$data_env" -f "$compose_file" ps --status running -q business-db)" ]]; then
  printf 'Business database port 127.0.0.1:%s is already occupied by another service.\n' "$business_db_port" >&2
  exit 1
fi

export BUSINESS_DB_PORT="$business_db_port"
docker compose --env-file "$data_env" -f "$compose_file" config --quiet
docker compose --env-file "$data_env" -f "$compose_file" up -d
for attempt in $(seq 1 60); do
  if docker compose --env-file "$data_env" -f "$compose_file" exec -T business-db pg_isready -U anksen_business -d anksen_studio_business >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == "60" ]]; then printf 'Business database did not become ready.\n' >&2; exit 1; fi
  sleep 2
done

BUSINESS_DATABASE_REQUIRED=true BUSINESS_DATABASE_URL_FILE="$database_url_file" node "$repo_dir/packages/domain-center/bin/business-database-migrate.mjs"
printf 'Business data service ready: backend=POSTGRESQL database=anksen_studio_business\n'
