#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

state_dir="${GITEA_STATE_DIR:-/opt/anksen/gitea}"
release_dir="${GITEA_RELEASE_DIR:-/opt/anksen/gitea-control/current}"
username="${GITEA_ADMIN_USERNAME:-owner}"
email="${GITEA_ADMIN_EMAIL:-owner@localhost.invalid}"
env_file="$state_dir/.env"
compose_file="$release_dir/infrastructure/gitea/docker-compose.yml"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/gitea-env.sh
source "$script_dir/lib/gitea-env.sh"

[[ "$username" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}$ ]] || { printf 'Invalid administrator username.\n' >&2; exit 2; }
[[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || { printf 'Invalid administrator email.\n' >&2; exit 2; }
[[ -f "$env_file" && -f "$compose_file" ]] || { printf 'Gitea is not deployed.\n' >&2; exit 1; }

if [[ -t 0 ]]; then
  read -rsp 'Initial Gitea administrator password: ' admin_password
  printf '\n'
else
  IFS= read -r admin_password
fi

password_lower="$(printf '%s' "$admin_password" | tr '[:upper:]' '[:lower:]')"
username_lower="$(printf '%s' "$username" | tr '[:upper:]' '[:lower:]')"
if [[ ${#admin_password} -lt 12 \
  || ! "$admin_password" =~ [A-Z] \
  || ! "$admin_password" =~ [a-z] \
  || ! "$admin_password" =~ [0-9] \
  || ! "$admin_password" =~ [^A-Za-z0-9[:space:]] \
  || "$admin_password" =~ [[:space:]] \
  || "$password_lower" == *"$username_lower"* ]]; then
  unset admin_password password_lower
  printf 'Password must be at least 12 characters and include upper, lower, number and symbol without whitespace or username.\n' >&2
  exit 2
fi
unset password_lower username_lower

load_gitea_env "$env_file"
if docker compose --env-file "$env_file" -f "$compose_file" exec -T server \
  gitea admin user list --config /etc/gitea/app.ini | awk 'NR > 1 { print $2 }' | grep -Fxq "$username"; then
  printf 'Administrator already exists: %s\n' "$username" >&2
  exit 1
fi

# The password is transported only over stdin. It is not written to Git, the
# environment file, shell history or command logs.
printf '%s\n' "$admin_password" | docker compose --env-file "$env_file" -f "$compose_file" exec -T server \
  sh -eu -c 'IFS= read -r password; exec gitea admin user create --config /etc/gitea/app.ini --admin --must-change-password --username "$1" --email "$2" --password "$password"' sh "$username" "$email"
unset admin_password
printf 'Gitea administrator created: %s (password change required at first login)\n' "$username"
