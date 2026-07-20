# Governed Codex Resident Worker MVP

## Outcome

Studio now owns the complete entry path for a controlled software-development run. An authorized user selects a connected project, states a goal, and declares the only paths Codex may modify. Studio persists a proposal first; a separate approval action starts the existing governed Codex runner.

This is not a second scheduler or worker implementation. It is a product-facing control plane over the existing Planner, Autonomous Kernel, Scheduler, Resident Worker, Activation Gate, Approval, Lease, Fencing, Runtime Adapter and Morning Report chain.

## Long-task graph

| Task | Deliverable | Depends on |
| --- | --- | --- |
| GCR-001 | Reuse and audit the existing governed runtime chain | — |
| GCR-010 | Persistent Studio run proposal and strict path policy | GCR-001 |
| GCR-020 | Project-scoped RBAC and separate human approval | GCR-010 |
| GCR-030 | Detached resident process using the existing runner | GCR-020 |
| GCR-040 | Process-state reconciliation after page/server restart | GCR-030 |
| GCR-050 | Product UI for proposal, approval, progress and cancellation | GCR-040 |
| GCR-060 | Focused safety tests, typecheck and build verification | GCR-050 |

Shortest implementation path: GCR-001 → GCR-010 → GCR-020 → GCR-030 → GCR-040 → GCR-050 → GCR-060.

## Execution path

`Studio /actions → persistent proposal → explicit approval → governed-codex-run → Planner → Task Graph → PostgreSQL Kernel → Scheduler → Worker Claim → Attempt + Lease → Activation Gate → one-time Approval consume → Codex Runtime Adapter → Fencing result write → Goal aggregation → Morning Report`

## Safety contract

- Codex remains disabled by default and is enabled only inside the governed runner after every readiness check passes.
- Every run has one attempt, an explicit project root, an allowlist of writable paths and a hard runtime limit.
- Credential values are never accepted by this interface; it uses only `codex-local-session-ref`.
- Commit, push, merge and deploy remain disabled.
- A dirty repository, policy violation, invalid approval, missing worker, failed CLI health check, stale fencing token or changed path outside the allowlist stops the run.
- The web server does not invoke an alternate Runtime path. It launches the existing audited runner as a detached resident process and reconciles its durable output.

## Current human checkpoints

The user must still connect the target repository, define the exact writable paths, review the proposal and approve the real run. Product review of the resulting diff and any later commit/push/merge/deploy remain separate human-controlled actions.

## Next phase

The next phase should add an organization-wide long-task portfolio: reusable domain Skill Packs, Agent role assignments, execution budgets, scheduled/resumable campaigns, and consolidated outcome/cost dashboards. It should consume this same governed run contract instead of adding another runner.
