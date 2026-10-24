# Self-hosted Gitea and Local CI/CD Requirements

## Objective

Run a private Gitea control surface and Gitea Actions execution plane on the
Office 204 server. The result should provide a GitHub-Actions-like developer
experience while preserving Studio's existing production gates.

## Functional requirements

1. Host private and public Git repositories, organizations, pull requests,
   issues, releases, packages and OCI images.
2. Execute compatible CI workflows using the official Gitea Runner.
3. Mirror selected GitHub repositories without changing their authoritative
   remote until each repository is explicitly migrated.
4. Keep production deployment separate from ordinary CI. A successful workflow
   may request deployment, but only a repository-scoped forced command may
   change production.
5. Provide deterministic health, runner registration, backup and restore
   evidence.
6. Preserve the existing Studio, Keycloak, business-data, Phoenix Runner and
   Smart Park services on 204.

## Security requirements

- No workflow receives the Office 204 host Docker socket.
- CI jobs run in an isolated Docker-in-Docker daemon with capacity 1
  initially.
- Registration, database and application secrets live below
  `/opt/anksen/gitea/secrets`, mode `0600`, outside Git.
- Self-registration and anonymous repository browsing are disabled initially.
- Gitea HTTP binds to loopback; nginx terminates TLS. SSH binds only to the
  office LAN unless a later firewall review approves wider exposure.
- Production deploy identities are per project, command-restricted and never
  shared with the general CI runner.
- Images and release commits are pinned and upgrades require backup plus a
  tested rollback.

## Non-goals for the first release

- Replacing GitHub as the authoritative remote for every project in one cutover.
- Giving arbitrary repositories permission to deploy production.
- Exposing the runner or PostgreSQL directly to the Internet.
- Changing Codex model providers or authentication.

## Initial service-level objectives

- Gitea API health recovers within 180 seconds after a controlled restart.
- One CI runner is online and processes one job at a time.
- Daily backup artifacts contain database, repositories/data and configuration,
  with SHA-256 manifests.
- A restore rehearsal completes before Gitea becomes authoritative.
