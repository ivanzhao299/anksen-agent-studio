#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

repo_dir="${ANKSEN_DEPLOY_DIR:-/opt/anksen/agent-studio}"
identity_dir="${ANKSEN_IDENTITY_DIR:-/opt/anksen/identity}"
compose_file="$repo_dir/infrastructure/identity/docker-compose.yml"
identity_env="$identity_dir/.env"
runtime_config="$identity_dir/studio-mcp.json"

for command_name in docker openssl curl install; do
  command -v "$command_name" >/dev/null || {
    printf 'Identity deployment requires %s.\n' "$command_name" >&2
    exit 1
  }
done
docker compose version >/dev/null

install -d -m 700 "$identity_dir"
if [[ ! -f "$identity_env" ]]; then
  db_password="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 32)"
  user_password="$(openssl rand -hex 24)"
  {
    printf 'KEYCLOAK_DB_PASSWORD=%s\n' "$db_password"
    printf 'KEYCLOAK_ADMIN_USERNAME=studio-bootstrap-admin\n'
    printf 'KEYCLOAK_ADMIN_PASSWORD=%s\n' "$admin_password"
    printf 'STUDIO_IDENTITY_BOOTSTRAP_USERNAME=studio-admin\n'
    printf 'STUDIO_IDENTITY_BOOTSTRAP_PASSWORD=%s\n' "$user_password"
  } > "$identity_env"
  chmod 600 "$identity_env"
fi

install -m 600 "$repo_dir/infrastructure/identity/studio-mcp.production.json" "$runtime_config"
docker compose --env-file "$identity_env" -f "$compose_file" config --quiet
docker compose --env-file "$identity_env" -f "$compose_file" up -d

discovery_url="http://127.0.0.1:4320/auth/realms/anksen/.well-known/openid-configuration"
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 3 "$discovery_url" >/dev/null; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    printf 'Identity deployment failed: Keycloak did not become ready.\n' >&2
    exit 1
  fi
  sleep 3
done

set -a
source "$identity_env"
set +a
docker compose --env-file "$identity_env" -f "$compose_file" exec -T keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://127.0.0.1:8080/auth \
  --realm master \
  --user "$KEYCLOAK_ADMIN_USERNAME" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
docker compose --env-file "$identity_env" -f "$compose_file" exec -T keycloak \
  /opt/keycloak/bin/kcadm.sh update realms/anksen/client-policies/profiles \
  -f /opt/anksen/client-policies/cimd-profiles.json >/dev/null
docker compose --env-file "$identity_env" -f "$compose_file" exec -T keycloak \
  /opt/keycloak/bin/kcadm.sh update realms/anksen/client-policies/policies \
  -f /opt/anksen/client-policies/cimd-policies.json >/dev/null

node - "$discovery_url" <<'NODE'
const response = await fetch(process.argv[2]);
if (!response.ok) throw new Error(`OIDC discovery failed: ${response.status}`);
const metadata = await response.json();
const expected = "https://studio.cnjinhu.com/auth/realms/anksen";
if (metadata.issuer !== expected) throw new Error(`Unexpected issuer: ${metadata.issuer}`);
if (!metadata.code_challenge_methods_supported?.includes("S256")) throw new Error("Keycloak does not advertise PKCE S256.");
if (metadata.client_id_metadata_document_supported !== true) throw new Error("Keycloak CIMD is not active.");
NODE

printf 'Identity service ready: realm=anksen issuer=https://studio.cnjinhu.com/auth/realms/anksen\n'
