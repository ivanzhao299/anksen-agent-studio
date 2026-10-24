# Office 204 Gitea Deployment Runbook

This runbook intentionally separates preparation, bootstrap, release, account
creation and acceptance. A successful CI run is not permission to skip a gate.

## 1. Current implementation state

The implementation lives in the isolated branch `codex/gitea-local-cicd` and is
not active in production until it is reviewed, committed, pushed, merged and
explicitly deployed. The production target is Office 204; no other project
checkout is modified.

## 2. Infrastructure prerequisites

On Office 204, record before changing anything:

```bash
uname -a
docker version
docker compose version
df -h / /opt
free -h
sudo ss -lntp
sudo nginx -T
sudo aa-status
```

Required outcomes:

- ports `127.0.0.1:4340` and `192.168.2.204:2222` are unused;
- Docker Compose v2 is available;
- Docker supports privileged, isolated Docker-in-Docker containers. The runner
  must not mount the Office 204 host Docker socket;
- `/opt` has capacity for repositories, packages, database and CI images;
- `git.cnjinhu.com` resolves to the approved ingress and has a valid TLS
  certificate before the Runner uses the public URL.

## 3. One-time guarded bootstrap

The server administrator installs reviewed files from the exact candidate SHA.
Do not copy from an uncommitted working tree.

On Office 204:

```bash
sudo install -d -m 700 /opt/anksen/deploy-bootstrap/gitea/lib
sudo install -m 700 deploy-gitea.sh /opt/anksen/deploy-bootstrap/gitea/deploy-gitea.sh
sudo install -m 600 gitea-env.sh /opt/anksen/deploy-bootstrap/gitea/lib/gitea-env.sh
```

On the Aliyun jump host, back up the active forced-command file, install the
reviewed `infrastructure/deployment/aliyun-studio-jump-deploy.sh`, verify owner
and mode, then prove that an unknown command is still rejected. This is the only
step requiring existing jump-host administration.

Allowed Gitea operations are deliberately limited:

```text
gitea deploy <full SHA>
gitea probe
gitea create-admin
gitea backup
```

## 4. GitHub Environment configuration

Create `GITEA_OFFICE_ENV_B64` in the protected `production` Environment from a
reviewed copy of `infrastructure/gitea/env.production.example`. It contains no
passwords or tokens. Encode without printing it into CI logs:

```bash
base64 < gitea.production.env | gh secret set GITEA_OFFICE_ENV_B64 --env production
```

Keep the existing jump-host private key and known-host secrets unchanged. All
database, application and Runner secrets are generated directly on 204 under
`/opt/anksen/gitea/secrets`.

## 5. DNS, TLS and nginx

Install the reviewed nginx server block only after DNS and certificate issuance.
Run `nginx -t` before reload. Verify `/api/healthz`, clone over HTTPS, a large
push within the approved size, and WebSocket behavior. Gitea SSH remains office
LAN only on port 2222.

## 6. Release

After code review and merge, manually run `Deploy Gitea to Office 204` with the
exact confirmation phrase. The workflow validates scripts and Compose, sends the
non-secret environment over stdin, deploys the exact `main` SHA to an immutable
release worktree, then runs the guarded Doctor and public HTTPS health check.

Do not deploy a branch SHA: the server requires requested SHA = `origin/main`.

## 7. Initial administrator

Use a unique password that is at least 12 characters and contains upper-case,
lower-case, number and symbol characters without the username. Transport it via
stdin so it does not appear in shell history or the process list on the jump
host:

```bash
read -rsp 'Initial Gitea password: ' GITEA_INITIAL_PASSWORD
printf '\n'
printf '%s\n' "$GITEA_INITIAL_PASSWORD" | ssh <guarded-jump-options> root@123.57.220.65 'gitea create-admin'
unset GITEA_INITIAL_PASSWORD
```

The initial account is `owner` by default and must change its password at first
login. Do not reuse the Studio, Keycloak, GitHub or server password.

## 8. Acceptance and backup

1. `gitea probe` returns `GITEA_DOCTOR=PASS`.
2. Login and create a non-production organization/repository.
3. Push a sample branch and open a pull request.
4. Run `.gitea/workflows/ci.yml`; verify checkout, install, typecheck, lint,
   smoke and build.
5. Prove the job cannot see the host Docker daemon or unrelated containers.
6. Run `gitea backup`; verify the checksum manifest.
7. Restore the backup into an isolated target and run Gitea Doctor.

Only after all seven pass may the first production repository enter dual CI.

## 9. Rollback

If deployment fails before a database migration, restart the previous immutable
release definition. If a migration has run, stop traffic and preserve the failed
state; restore the matching PostgreSQL, data and config backup together. Never
mix a database snapshot with repository data from another time.
