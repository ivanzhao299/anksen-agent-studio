# Gitea Local CI/CD Task Graph

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| GIT-001 | Baseline and architecture audit | — | Local, remote and runtime SHA proven |
| GIT-002 | Gitea/PostgreSQL Compose | GIT-001 | Config renders; no DB/public bind |
| GIT-003 | Rootless DinD runner | GIT-002 | Online runner; no host Docker socket |
| GIT-004 | Immutable deploy script | GIT-002 | Exact SHA, lock, clean release, Doctor |
| GIT-005 | Jump forced-command extension | GIT-004 | Only `gitea deploy/probe` accepted |
| GIT-006 | DNS/TLS/nginx | GIT-002 | HTTPS, headers, upload/clone tested |
| GIT-007 | Backup and restore | GIT-002 | Consistent backup plus restore rehearsal |
| GIT-008 | First admin and organization | GIT-006 | No secret in logs; registration closed |
| GIT-009 | Smoke workflow | GIT-003,GIT-008 | checkout/install/test/artifact pass |
| GIT-010 | GitHub mirror pilot | GIT-008 | All refs/LFS verified; one-way authority |
| GIT-011 | Studio project connector | GIT-009,GIT-010 | Repo identity and branch gates pass |
| GIT-012 | Production pilot | GIT-005,GIT-007,GIT-011 | Three-end SHA plus rollback evidence |

Critical path: GIT-001 -> GIT-002 -> GIT-004 -> GIT-005 -> GIT-006 -> GIT-008
-> GIT-010 -> GIT-011 -> GIT-012.
