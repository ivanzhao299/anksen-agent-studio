# Gitea Local CI/CD Acceptance Criteria

## Platform

- Gitea, PostgreSQL and Runner are healthy after reboot.
- Public HTTPS uses a valid certificate and secure proxy headers.
- PostgreSQL and Runner ports are not publicly reachable.
- Registration is closed and anonymous private-repository access fails.

## CI isolation

- Runner capacity is one initially.
- No `/var/run/docker.sock` host mount exists.
- A CI job cannot inspect Studio, Keycloak, business-data or other host
  containers.
- Fork pull requests cannot read protected secrets.
- Workflow cancellation, timeout, cache and artifact upload are exercised.

## Repository parity

- All branches, tags, default branch and LFS objects match the source repository.
- Mirror direction and authority are explicit.
- GitHub and Gitea CI produce equivalent required results for the pilot.

## Release safety

- Requested SHA equals the selected Gitea remote SHA.
- Dirty control or release state fails closed.
- Production deployment uses a project-scoped forced command.
- Candidate SHA equals merged SHA equals runtime SHA after release.
- Health, user-visible smoke and rollback are verified.

## Recovery

- Backup contains PostgreSQL, Gitea data/config and checksums.
- Restore is rehearsed on an isolated target.
- Recovery point and recovery time are recorded.
- An upgrade cannot proceed without a fresh verified backup.
