# Gitea Operational Data Model

| Object | Authority | Persistence | Secret | Backup |
|---|---|---|---|---|
| User, org, repo and PR metadata | PostgreSQL | `gitea-database` | No | Native `pg_dump` |
| Git repositories, LFS, attachments, packages | Gitea data | `gitea-data` | May contain private source | Consistent volume archive |
| Generated `app.ini` and SSH host material | Gitea config | `gitea-config` | Yes | Encrypted config archive |
| Runner registration | Runner state | `gitea-runner-data` | Yes | Re-creatable; preserve for identity |
| Nested job images/cache | Runner Docker | `gitea-runner-docker` | Potential build residue | Excluded; re-creatable |
| Database/application/runner tokens | File secrets | `/opt/anksen/gitea/secrets` | Yes | Separate encrypted secret backup |
| Release definition | Git SHA | immutable release worktree | No | Git remote plus release evidence |

## Repository lifecycle states

`DISCOVERED -> MIRROR_READ_ONLY -> DUAL_CI -> GITEA_PRIMARY -> ARCHIVED`

Every transition records repository identity, GitHub URL, Gitea URL, default
branch, mirror direction, last synchronized SHA, CI parity result, owner and
rollback remote. Bidirectional mirroring is prohibited because it cannot provide
a deterministic conflict authority.

## Deployment evidence

Each governed deployment records project, repository, requested SHA, validated
remote SHA, workflow run, actor, environment, start/end time, health checks,
backup reference and rollback SHA. Gitea workflow success alone is not runtime
identity evidence.
