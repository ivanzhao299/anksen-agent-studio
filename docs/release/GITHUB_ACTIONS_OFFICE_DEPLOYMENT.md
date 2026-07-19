# GitHub Actions Office Deployment

Every push to `main` is validated on GitHub and then deployed to the office Ubuntu server through the Aliyun WireGuard jump host.

The same guarded deployment now starts the self-hosted Keycloak/PostgreSQL identity boundary before restarting Console. Identity secrets are generated once under `/opt/anksen/identity/.env` and are never passed through GitHub Actions. The release is accepted only when public OIDC discovery, OAuth protected-resource metadata, and MCP readiness all pass.

## Route

`GitHub Actions -> 123.57.220.65 -> WireGuard -> 192.168.2.204 -> /opt/anksen/agent-studio`

The runner only receives the dedicated Aliyun jump-host key. That key is bound to a forced command which accepts only `deploy <40-character commit SHA>`; it cannot open an interactive root shell. The office-server key remains on the jump host and is restricted to connections originating from `10.66.66.1`.

The forced-command implementation is versioned at `infrastructure/deployment/aliyun-studio-jump-deploy.sh`. During the first deployment only, an external bootstrap copy of `scripts/deploy.sh` is used on the office server; subsequent runs use the script from the checked-out repository.

## Required Repository Secrets

- `STUDIO_DEPLOY_JUMP_SSH_KEY`: dedicated private key for GitHub Actions to access the Aliyun jump host.
- `STUDIO_DEPLOY_JUMP_KNOWN_HOSTS`: pinned SSH host-key entry for `123.57.220.65`.

Neither secret is stored in the repository or deployment logs.

## Deployment Safety

- Only `main` is deployed.
- GitHub validation must pass before deployment starts.
- A deployment lock prevents concurrent server updates.
- The requested Git commit must exactly match `origin/main`.
- Modified tracked files on the server stop deployment; the script never uses `git reset --hard`.
- Git updates are fast-forward only.
- The Console is typechecked, linted, smoke-tested and built before restart.
- The existing systemd service restarts the Console after the deployment script terminates the managed Node process.
- Local and public `/login` endpoints are checked before the workflow succeeds.

## Manual Replay

Use the `Deploy Studio to Office 204` workflow in GitHub Actions and choose **Run workflow**. It deploys the selected `main` commit through the same guarded path.
