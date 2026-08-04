# GitHub Actions Office Deployment

Every push to `main` is validated on GitHub and then deployed to the office Ubuntu server through the Aliyun WireGuard jump host.

The same guarded deployment starts two isolated state services before restarting Console: the Keycloak/PostgreSQL identity boundary and the transactional business-application PostgreSQL database. Identity secrets remain under `/opt/anksen/identity/.env`; the business database credential and URL remain under `/opt/anksen/business-data/`. They are generated on the office server and are never passed through GitHub Actions or committed to Git.

## Route

`GitHub Actions -> 123.57.220.65 -> WireGuard -> 192.168.2.204 -> /opt/anksen/agent-studio`

The runner only receives the dedicated Aliyun jump-host key. That key is bound to a forced command which accepts only `deploy <40-character commit SHA>`; it cannot open an interactive root shell. The office-server key remains on the jump host and is restricted to connections originating from `10.66.66.1`.

The forced-command implementation is versioned at `infrastructure/deployment/aliyun-studio-jump-deploy.sh`. During the first deployment only, an external bootstrap copy of `scripts/deploy.sh` is used on the office server; subsequent runs use the script from the checked-out repository.

The same forced-command boundary also permits `phoenix-runner probe` and
`phoenix-runner deploy <40-character SHA>`. These commands install the Phoenix
ERP bug-intake runner under `/opt/phoenix-runner`; they never overwrite the
Agent Studio checkout. The runner environment is delivered through stdin from
the encrypted `PHOENIX_ERP_RUNNER_ENV_B64` repository secret.
The manually dispatched workflow is the human approval gate and is bound to
the `production` GitHub Environment. Deployments reject dirty state, pin the
Phoenix checkout to an exact `main` SHA, restart the service, and fail unless
systemd reports it active. Runner-generated changes are allowed only below
`docs/ops/`; a dirty executable `code` worktree or any other state change fails
closed. The workflow's explicit `auto_release` production input rewrites only
`PHOENIX_ERP_RUNNER_AUTO_RELEASE` inside a temporary decoded environment file;
it never prints or replaces the other encrypted credentials. Keep it `false`
for the first acceptance run. Set it to `true` only after CI, security, deploy,
service-account, read-only and rollback gates pass; the resulting Runner adds
push-after-success, CI wait, deploy-after-CI and production route smoke, while
task approval and release-evidence gates continue to fail closed.

The guarded `phoenix-runner probe` is the production qualification check. It
fails unless systemd is enabled and active, the state and executable worktrees
match `origin/main`, and the live process contains every governed execution,
auto-release, CI-wait, deployment and production-smoke capability argument.

## Phoenix production automation activation evidence

Activated on 2026-08-04 for Phoenix bug-intake work only:

- Phoenix commit: `42890d2f10b8ed2bb18b95eed01b47e9d1ab28d9`
- Studio deployment workflow: `30889100063`
- Phoenix deployment and auto-release activation: `30889243457`
- Strict guarded qualification probe: `30889595090`
- Probe decision: `PHOENIX_RUNNER_FULL_AUTOMATION_GATE=PASS`

The scope remains administrator-approved Phoenix bug reports with exact task,
evidence, CI and production-smoke gates. General Studio production autonomy and
unmanaged project deployment remain disabled.

## Required Repository Secrets

- `STUDIO_DEPLOY_JUMP_SSH_KEY`: dedicated private key for GitHub Actions to access the Aliyun jump host.
- `STUDIO_DEPLOY_JUMP_KNOWN_HOSTS`: pinned SSH host-key entry for `123.57.220.65`.
- `PHOENIX_ERP_RUNNER_ENV_B64`: base64-encoded Linux runner environment.

Neither secret is stored in the repository or deployment logs.

## Deployment Safety

- Only `main` is deployed.
- GitHub validation must pass before deployment starts.
- A deployment lock prevents concurrent server updates.
- The requested Git commit must exactly match `origin/main`.
- Modified tracked files on the server stop deployment; the script never uses `git reset --hard`.
- Git updates are fast-forward only.
- The Console is typechecked, linted, smoke-tested and built before restart.
- Third-party capability resources are checked out at their registry-pinned commits and must pass license, content-count and integrity checks before restart.
- The loopback-only business database is started, migrations are applied idempotently, and record/work/event tables are verified before Console restarts.
- The existing systemd service restarts the Console after the deployment script terminates the managed Node process.
- Local and public `/login` endpoints are checked before the workflow succeeds.

## Manual Replay

Use the `Deploy Studio to Office 204` workflow in GitHub Actions and choose **Run workflow**. It deploys the selected `main` commit through the same guarded path.
