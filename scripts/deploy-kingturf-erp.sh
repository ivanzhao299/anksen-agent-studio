#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

release_root="${KINGTURF_ERP_RELEASE_ROOT:-/opt/kingturf/preview}"
commit_sha=""
archive_stdin=false

while (($#)); do
  case "$1" in
    --commit) commit_sha="${2:-}"; shift 2 ;;
    --archive-stdin) archive_stdin=true; shift ;;
    *) printf 'Rejected: unknown argument %s.\n' "$1" >&2; exit 64 ;;
  esac
done

if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ || "$archive_stdin" != true ]]; then
  printf 'Rejected: expected --commit <40-character SHA> --archive-stdin.\n' >&2
  exit 64
fi

release_dir="$release_root/releases/$commit_sha"
compose_file="$release_dir/infra/docker/compose.preview.yaml"
env_file="$release_root/.env"

if [[ ! -f "$env_file" ]]; then
  printf 'Rejected: missing server-local ERP environment at %s.\n' "$env_file" >&2
  exit 78
fi

install -d -m 755 "$release_dir"
tar -xzf - -C "$release_dir"
test -f "$compose_file"
ln -sfn "$release_dir" "$release_root/current"

docker compose --env-file "$env_file" -f "$compose_file" up -d --build --remove-orphans

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4331/health >/dev/null \
    && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4331/ready >/dev/null; then
    printf 'KingTurf ERP deployed: %s\n' "$commit_sha"
    exit 0
  fi
  sleep 2
done

printf 'KingTurf ERP health/ready did not pass for %s.\n' "$commit_sha" >&2
docker compose --env-file "$env_file" -f "$compose_file" ps >&2 || true
exit 1
