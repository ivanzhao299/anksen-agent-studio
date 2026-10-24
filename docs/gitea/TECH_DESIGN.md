# Self-hosted Gitea Technical Design

## Baseline evidence

At design start on 2026-10-23:

- local `main`: `0c10f96e07982241b53366c3920b2b7ce0835919`
- `origin/main`: `0c10f96e07982241b53366c3920b2b7ce0835919`
- production `https://studio.cnjinhu.com/health/version`: the same SHA
- primary checkout: clean
- implementation worktree: `codex/gitea-local-cicd`

## Topology

```text
Developer / Studio
        |
        v
git.cnjinhu.com (nginx TLS on Office 204)
        |
        +--> 127.0.0.1:4340 --> Gitea rootless container
                                  |
                                  +--> PostgreSQL (internal network only)
                                  +--> named repository/data volumes

Gitea Actions --> isolated DinD Runner (capacity=1)
                         |
                         +--> disposable job containers
                         +--> no host Docker socket
                         +--> no general production SSH key

Approved release workflow
        |
        v
Aliyun forced command --> project-specific deploy script --> exact SHA + health
```

## Version policy

The initial design targets Gitea `28.2.0-rootless`, PostgreSQL 16 and Gitea
Runner major version 2. Every production image is pinned by tag and immutable
registry digest. Future upgrades must change both values together and attach a
fresh backup plus rollback record.

## Isolation decisions

The Gitea server uses the official rootless image. The Actions runner uses the
official isolated DinD image. Office 204's AppArmor policy blocks the user
namespace transition needed by the rootless DinD flavour after container
restart, so the pinned rootful DinD flavour is used instead. It remains isolated
from the host daemon: jobs only control the nested daemon and never receive
`/var/run/docker.sock` from Office 204. Runner capacity starts at one to limit
CPU, memory and duplicate work.

The CI trust boundary is repository allowlisting. Fork pull requests never
receive deployment secrets. Production deployment remains an independent
forced-command path that verifies repository identity, exact commit, clean
release state, locks, backup/readiness and post-deploy health.

## Storage and release layout

```text
/opt/anksen/gitea/                 persistent state and secrets
/opt/anksen/gitea/.env             mode 0600, non-Git configuration
/opt/anksen/gitea/secrets/         Docker secret files, mode 0600
/opt/anksen/gitea-control/         deployment control root
/opt/anksen/gitea-control/repository.git
/opt/anksen/gitea-control/releases/<full-sha>/
/opt/anksen/gitea-control/current  symlink updated only after Doctor passes
/opt/anksen/backups/gitea/<UTC timestamp>/
```

Docker named volumes hold PostgreSQL, Gitea data/config and runner state. The
Git checkout is never used as persistent service storage.

## Network policy

- Gitea HTTP: `127.0.0.1:4340`, proxied by nginx with TLS.
- Gitea SSH: `192.168.2.204:2222`, office LAN only initially.
- PostgreSQL: internal Compose network, no host port.
- Runner metrics: disabled initially; when enabled, loopback only.
- Outbound access: server and runner may reach GitHub and package registries;
  inbound runner access is not published.

## Session policy

Interactive sessions use the database-backed session provider so controlled
service restarts do not discard valid sessions. Ordinary sessions default to
30 days and the explicit "remember this device" flow defaults to 365 days.
Both limits are bounded configuration (`GITEA_SESSION_LIFE_TIME_SECONDS` and
`GITEA_LOGIN_REMEMBER_DAYS`), not credentials. Cookies remain HTTPS-only with
`SameSite=Lax`; logout, password changes, account revocation and administrator
session invalidation still terminate access before the configured limit.

## GitHub Actions compatibility

Workflows move to `.gitea/workflows`. Most common syntax is compatible, but
permissions differ and GitHub-only scopes such as `id-token`, `checks`,
`deployments` and `security-events` are not assumed. Existing GitHub actions
remain downloadable from GitHub during the transition. Every migrated workflow
requires an explicit compatibility test; copying files alone is not acceptance.

## Rollout

1. Install DNS and TLS for `git.cnjinhu.com`.
2. Install the reviewed forced-command update on the Aliyun jump host.
3. Create the GitHub Environment secret containing only non-secret environment
   configuration; service secrets are generated on 204.
4. Deploy the exact reviewed commit into the immutable release worktree.
5. Create the initial administrator through a non-logging server-side command.
6. Register runner, run Doctor and a no-secret smoke workflow.
7. Mirror one non-production repository and validate PR, CI, package and backup.
8. Complete restore rehearsal; only then onboard production repositories.

## Rollback

Application rollback selects the previous immutable release and recreates the
Compose services. Database rollback is never automatic: stop Gitea, preserve
the failed state, restore the matching PostgreSQL/data/config backup, regenerate
Git hooks, run `gitea doctor`, then reopen traffic.
