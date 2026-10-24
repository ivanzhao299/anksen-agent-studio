# GitHub to Gitea Migration Plan

## Phase 0: qualification

- Inventory Office 204 CPU, memory, filesystem, Docker, AppArmor, nginx, DNS and
  backup capacity.
- Confirm no conflict on loopback 4340 or LAN 2222.
- Confirm outbound access to the pinned image registries and GitHub actions.
- Capture existing nginx and firewall backups.

## Phase 1: non-authoritative platform

- Deploy Gitea and one runner.
- Create administrator and organization with sign-up disabled.
- Mirror one non-production repository from GitHub to Gitea.
- Keep GitHub as the authoritative write remote.
- Run a deterministic workflow that installs, lints, tests and uploads a harmless
  artifact; compare output with GitHub Actions.

## Phase 2: dual CI

- Add `.gitea/workflows` to selected repositories.
- Require both GitHub and Gitea CI while compatibility is evaluated.
- Store secrets separately; never copy GitHub environment secrets wholesale.
- Validate fork/PR secret isolation and cancellation/concurrency behavior.

## Phase 3: controlled production pilot

- Choose one reversible, low-risk service.
- Grant only its repository-scoped deploy identity.
- Prove candidate SHA = Gitea merged SHA = runtime SHA.
- Exercise failed health rollback and restore rehearsal.

## Phase 4: optional authority cutover

- Freeze writes briefly.
- Verify final Git refs, LFS and releases.
- Change developer remotes and Studio project registry explicitly.
- Retain GitHub as a read-only rollback mirror until an agreed retirement date.

No bulk repository cutover occurs without a project-by-project acceptance record.
