#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

repo_dir="${ANKSEN_DEPLOY_DIR:-/opt/anksen/agent-studio}"
data_dir="${ANKSEN_BUSINESS_DATA_DIR:-/opt/anksen/business-data}"
compose_file="$repo_dir/infrastructure/business-data/docker-compose.yml"
data_env="$data_dir/.env"
database_url_file="$data_dir/database-url"

for command_name in docker openssl install node; do
  command -v "$command_name" >/dev/null || { printf 'Business data deployment requires %s.\n' "$command_name" >&2; exit 1; }
done
docker compose version >/dev/null

install -d -m 700 "$data_dir"
if [[ ! -f "$data_env" ]]; then
  db_password="$(openssl rand -hex 32)"
  printf 'BUSINESS_DB_PASSWORD=%s\n' "$db_password" > "$data_env"
  chmod 600 "$data_env"
fi

set -a
source "$data_env"
set +a
printf 'postgresql://anksen_business:%s@127.0.0.1:4330/anksen_studio_business\n' "$BUSINESS_DB_PASSWORD" > "$database_url_file"
chmod 600 "$database_url_file"

docker compose --env-file "$data_env" -f "$compose_file" config --quiet
docker compose --env-file "$data_env" -f "$compose_file" up -d
for attempt in $(seq 1 60); do
  if docker compose --env-file "$data_env" -f "$compose_file" exec -T business-db pg_isready -U anksen_business -d anksen_studio_business >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == "60" ]]; then printf 'Business database did not become ready.\n' >&2; exit 1; fi
  sleep 2
done

BUSINESS_DATABASE_REQUIRED=true BUSINESS_DATABASE_URL_FILE="$database_url_file" node "$repo_dir/packages/domain-center/bin/business-database-migrate.mjs"
printf 'Business data service ready: backend=POSTGRESQL database=anksen_studio_business\n'
